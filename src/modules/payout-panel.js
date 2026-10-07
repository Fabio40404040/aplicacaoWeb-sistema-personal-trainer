// Painel → "Recebimentos": por onde o personal recebe dos alunos.
//  - Mercado Pago conectado: Pix e cartão, com liberação automática;
//  - Chave Pix de qualquer banco: o aluno paga e avisa, o personal confirma.
import { fetchPayout, payoutAction } from './api-client.js'
import { historyBox } from './payout-history.js'
import { showToast } from './utils.js'

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}
const money = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const PIX_TYPES = { cpf: 'CPF', cnpj: 'CNPJ', phone: 'Celular', email: 'E-mail', random: 'Chave aleatória' }
const CYCLES = { monthly: 'mensal', quarterly: 'trimestral', semiannual: 'semestral', annual: 'anual', permanent: 'único' }
const MP_RESULT = {
  ok: 'Mercado Pago conectado. Os pagamentos dos seus alunos já caem na sua conta.',
  cancelado: 'A conexão com o Mercado Pago foi cancelada.',
  expirou: 'O pedido de conexão expirou. Clique em Conectar de novo.',
  invalido: 'Não foi possível validar a conexão. Clique em Conectar de novo.',
  erro: 'O Mercado Pago não concluiu a conexão. Tente de novo em instantes.',
}

const folderOpen = {}
let info = null
let editingPix = false

function button(label, kind, onClick) {
  const node = el('button', `button button--${kind}`, label)
  node.type = 'button'
  node.addEventListener('click', async () => {
    node.disabled = true
    try {
      await onClick()
    } catch (error) {
      showToast(error.message)
    } finally {
      node.disabled = false
    }
  })
  return node
}

// Confirmação dentro da página (sem alert do navegador).
function confirmCard(title, text, confirmLabel) {
  return new Promise((resolve) => {
    const box = el('dialog', 'confirm-dialog')
    const card = el('div', 'payout-confirm')
    const actions = el('div', 'payout-actions')
    const no = el('button', 'button button--secondary', 'Voltar')
    const yes = el('button', 'button button--primary', confirmLabel)
    no.type = yes.type = 'button'
    const done = (value) => {
      box.close()
      box.remove()
      resolve(value)
    }
    no.addEventListener('click', () => done(false))
    yes.addEventListener('click', () => done(true))
    box.addEventListener('cancel', (event) => {
      event.preventDefault()
      done(false)
    })
    actions.append(no, yes)
    card.append(el('h2', '', title), el('p', '', text), actions)
    box.append(card)
    document.body.append(box)
    box.showModal()
  })
}

function badge(active) {
  return el('span', `payout-badge${active ? ' is-on' : ''}`, active ? 'Em uso' : 'Disponível')
}

function pendingBox() {
  if (!info.pending?.length) return null
  const card = el('section', 'panel payout-card payout-pending')
  const section = folder('pending', 'Pix para conferir', info.pending.length, true)
  card.append(section)
  section.append(
    el('p', 'support-muted', 'O aluno avisou que pagou. Confira no extrato do seu banco e confirme para liberar o acesso.'),
  )
  info.pending.forEach((item) => {
    const row = el('div', 'payout-pending-row')
    const text = el('div')
    text.append(
      el('strong', '', `${item.studentName} · ${money(item.amountCents)}`),
      el('small', '', `${item.planName || item.planCode} (${CYCLES[item.billingCycle] || item.billingCycle})`),
    )
    const actions = el('div', 'payout-actions')
    actions.append(
      button('Não recebi', 'secondary', async () => {
        if (!(await confirmCard('Não recebeu este Pix?', `O aviso de ${item.studentName} será recusado e o acesso continua bloqueado.`, 'Recusar aviso'))) return
        await payoutAction(`manual/${item.id}/reject`)
        await load()
      }),
      button('Recebi · liberar acesso', 'primary', async () => {
        await payoutAction(`manual/${item.id}/confirm`)
        showToast(`Pagamento de ${item.studentName} confirmado. Acesso liberado.`)
        window.setTimeout(() => location.reload(), 1200) // atualiza a lista de alunos
      }),
    )
    row.append(text, actions)
    section.append(row)
  })
  return card
}

// Pasta que abre e fecha (lembra o estado enquanto a página está aberta).
function folder(key, label, count, openByDefault) {
  const details = el('details', 'support-folder payout-folder')
  details.open = folderOpen[key] ?? openByDefault
  details.addEventListener('toggle', () => {
    folderOpen[key] = details.open
  })
  const summary = el('summary')
  summary.append(el('span', '', label), el('small', '', String(count)))
  details.append(summary)
  return details
}

function mercadoPagoCard() {
  const card = el('section', 'panel payout-card')
  const head = el('div', 'payout-card-head')
  head.append(el('h2', '', 'Mercado Pago'), info.mp.connected ? badge(info.mode === 'mercadopago') : el('span', 'payout-badge payout-badge--best', 'Recomendado'))
  card.append(
    head,
    el('p', '', 'Pix e cartão com liberação automática: o aluno paga e o acesso abre sozinho. O dinheiro cai direto na sua conta Mercado Pago, de onde você transfere para o banco que quiser.'),
  )
  const actions = el('div', 'payout-actions')
  if (info.mp.connected) {
    card.append(el('p', 'payout-ok', `✓ Conta conectada${info.mp.userId ? ` (nº ${info.mp.userId})` : ''}.`))
    if (info.mode !== 'mercadopago')
      actions.append(button('Usar o Mercado Pago', 'primary', async () => {
        await payoutAction('mode', 'PUT', { mode: 'mercadopago' })
        await load()
      }))
    actions.append(button('Desconectar', 'secondary', async () => {
      if (!(await confirmCard('Desconectar o Mercado Pago?', 'Seus alunos deixam de pagar com cartão e com Pix automático até você conectar de novo.', 'Desconectar'))) return
      await payoutAction('mp/disconnect')
      await load()
    }))
  } else if (info.mpAvailable) {
    actions.append(button('Conectar minha conta Mercado Pago', 'primary', async () => {
      const { url } = await payoutAction('mp/connect')
      location.href = url
    }))
    const steps = el('ol', 'payout-steps')
    const first = el('li', '', 'Tenha uma conta no Mercado Pago (é grátis). ')
    const create = el('a', '', 'Ainda não tem conta? Crie grátis no Mercado Pago')
    create.href = 'https://www.mercadopago.com.br/'
    create.target = '_blank'
    create.rel = 'noopener noreferrer'
    first.append(create)
    steps.append(
      first,
      el('li', '', 'Toque em “Conectar minha conta Mercado Pago”, entre na sua conta e autorize. É uma vez só.'),
      el('li', '', 'Pronto: seus alunos pagam por Pix ou cartão e o acesso deles é liberado sozinho.'),
    )
    card.append(
      el('strong', 'payout-steps-title', 'Como ativar'),
      steps,
      el('small', 'support-muted', 'Usa outro banco? Sem problema: receba pelo Mercado Pago e transfira por Pix para o seu banco. A FARISA nunca vê a sua senha. As taxas do Mercado Pago são cobradas por ele, na sua conta.'),
    )
  } else {
    card.append(el('p', 'support-muted', 'A conexão com o Mercado Pago será liberada em breve pela plataforma. Enquanto isso, use a chave Pix.'))
  }
  card.append(actions)
  return card
}

function pixForm() {
  const form = el('form', 'payout-form')
  const pix = info.pix || {}
  const select = el('select')
  select.name = 'type'
  Object.entries(PIX_TYPES).forEach(([value, label]) => {
    const option = el('option', '', label)
    option.value = value
    select.append(option)
  })
  select.value = pix.type || 'cpf'
  const field = (label, name, value, extra = {}) => {
    const wrap = el('label', 'field')
    const input = el('input')
    Object.assign(input, { name, value: value || '', required: true, ...extra })
    wrap.append(el('span', '', label), input)
    return wrap
  }
  const typeField = el('label', 'field')
  typeField.append(el('span', '', 'Tipo de chave'), select)
  const status = el('p', 'payout-status')
  status.setAttribute('role', 'status')
  const actions = el('div', 'payout-actions')
  const save = el('button', 'button button--primary', 'Salvar chave Pix')
  save.type = 'submit'
  actions.append(save)
  if (info.pix) {
    const cancel = el('button', 'button button--secondary', 'Cancelar')
    cancel.type = 'button'
    cancel.addEventListener('click', () => {
      editingPix = false
      render()
    })
    actions.prepend(cancel)
  }
  form.append(
    typeField,
    field('Chave Pix', 'key', pix.key, { maxLength: 80, autocomplete: 'off' }),
    field('Nome do titular (como está no banco)', 'holder', pix.holder, { maxLength: 80 }),
    field('Cidade do titular', 'city', pix.city, { maxLength: 40 }),
    status,
    actions,
  )
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    save.disabled = true
    status.textContent = 'Salvando…'
    try {
      await payoutAction('pix', 'PUT', Object.fromEntries(new FormData(form)))
      editingPix = false
      showToast('Chave Pix salva.')
      await load()
    } catch (error) {
      status.textContent = error.message
      save.disabled = false
    }
  })
  return form
}

function pixCard() {
  const card = el('section', 'panel payout-card')
  const head = el('div', 'payout-card-head')
  head.append(el('h2', '', 'Chave Pix (qualquer banco)'))
  if (info.pix) head.append(badge(info.mode === 'pix'))
  card.append(
    head,
    el('p', '', 'O aluno paga o Pix direto na sua chave, com o valor do plano já preenchido, e avisa pelo app. Você confere no extrato e confirma aqui para liberar o acesso. Não aceita cartão.'),
  )
  if (!info.pix || editingPix) {
    card.append(pixForm())
    return card
  }
  card.append(el('p', 'payout-ok', `✓ ${PIX_TYPES[info.pix.type] || 'Chave'}: ${info.pix.key} · ${info.pix.holder}`))
  const actions = el('div', 'payout-actions')
  if (info.mode !== 'pix')
    actions.append(button('Usar a chave Pix', 'primary', async () => {
      await payoutAction('mode', 'PUT', { mode: 'pix' })
      await load()
    }))
  actions.append(
    button('Alterar chave', 'secondary', async () => {
      editingPix = true
      render()
    }),
    button('Remover', 'secondary', async () => {
      if (!(await confirmCard('Remover a chave Pix?', 'Seus alunos deixam de ver esta chave na hora de pagar.', 'Remover chave'))) return
      await payoutAction('pix', 'DELETE')
      await load()
    }),
  )
  card.append(actions)
  return card
}

function render() {
  const root = document.querySelector('[data-payout-root]')
  if (!root || !info) return
  root.replaceChildren()
  if (!info.ready) {
    root.append(el('p', 'support-muted', 'Esta área será liberada na próxima atualização da plataforma.'))
    return
  }
  const summary = el('section', `panel payout-summary payout-summary--${info.mode}`)
  const lines = {
    platform: ['Você recebe pela conta Mercado Pago da plataforma', 'Pix e cartão com liberação automática. Nada a configurar aqui.'],
    mercadopago: ['Você recebe na sua conta Mercado Pago', 'Pix e cartão, com liberação automática do aluno.'],
    pix: ['Você recebe pela sua chave Pix', 'O aluno paga e avisa; você confirma para liberar o acesso.'],
    none: ['Falta configurar como você recebe', 'Enquanto não escolher uma forma abaixo, seus alunos não conseguem pagar pelo site.'],
  }[info.mode]
  summary.append(el('strong', '', lines[0]), el('p', '', lines[1]))
  root.append(summary)
  const pending = pendingBox()
  if (pending) root.append(pending)
  if (info.mode !== 'platform') {
    const grid = el('div', 'payout-grid')
    grid.append(mercadoPagoCard(), pixCard())
    root.append(grid)
  }
  const history = historyBox(info.history)
  if (history) root.append(history)
}

function paintBadge() {
  const count = document.querySelector('[data-payout-count]')
  if (!count || !info?.ready) return
  const pending = info.pending?.length || 0
  count.hidden = !(pending || info.mode === 'none')
  count.textContent = pending ? String(pending) : '!'
}

async function load() {
  if (!sessionStorage.getItem('farisa-coach-api-token')) return
  try {
    info = await fetchPayout()
  } catch {
    return
  }
  paintBadge()
  if (location.hash === '#recebimentos') render()
}

export function initPayoutPanel() {
  // Volta do Mercado Pago (/personal/?mp=ok#recebimentos).
  const result = new URLSearchParams(location.search).get('mp')
  if (result && MP_RESULT[result]) {
    history.replaceState(null, '', `${location.pathname}#recebimentos`)
    window.setTimeout(() => showToast(MP_RESULT[result]), 600)
  }
  window.addEventListener('hashchange', () => {
    if (location.hash === '#recebimentos') {
      if (info) render()
      void load()
    }
  })
  let loaded = false
  window.addEventListener('farisa:data-changed', () => {
    if (loaded) return
    loaded = true
    void load()
  })
  void load()
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void load()
  }, 120000)
}
