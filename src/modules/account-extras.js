// Painel do personal: primeiros passos (lista do que fazer ao começar),
// aviso de e-mail não confirmado e "Minha conta e dados" (baixar os dados e
// excluir a conta).
import { accountRequest } from './api-client.js'
import { showToast } from './utils.js'

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}
const mb = (bytes) => `${Math.round(Number(bytes || 0) / (1024 * 1024))} MB`

// ---------- e-mail não confirmado (faixa no topo do painel)
const EMAIL_BANNER_KEY = 'farisa-email-banner-hidden'
const hiddenFor = () => {
  try {
    return JSON.parse(localStorage.getItem(EMAIL_BANNER_KEY) || 'null')
  } catch {
    return null
  }
}
export function paintEmailBanner(email) {
  let bar = document.querySelector('[data-email-banner]')
  // Fechada pelo personal: some por 7 dias (só para este e-mail).
  const hidden = hiddenFor()
  const dismissed = hidden?.email === email?.email && Date.now() < Number(hidden?.until || 0)
  if (!email || email.verified || dismissed) {
    bar?.remove()
    return
  }
  if (!bar) {
    bar = el('div', 'billing-banner')
    bar.dataset.emailBanner = ''
    document.querySelector('.main-content')?.prepend(bar)
  }
  const again = el('button', 'button button--secondary', 'Reenviar e-mail')
  again.type = 'button'
  again.addEventListener('click', async () => {
    again.disabled = true
    try {
      const result = await accountRequest('/auth/resend-verification', { method: 'POST', body: '{}' })
      showToast(result.verified ? 'Seu e-mail já está confirmado.' : `E-mail de confirmação enviado para ${email.email}.`)
      if (result.verified) bar.remove()
    } catch (error) {
      showToast(error.message)
    } finally {
      again.disabled = false
    }
  })
  // E-mail errado? O próprio personal corrige (com a senha) e o link vai para o novo.
  const fix = el('button', 'button button--secondary', 'Corrigir e-mail')
  fix.type = 'button'
  fix.addEventListener('click', () => openEmailChange(email))
  const close = el('button', 'billing-banner-close', '×')
  close.type = 'button'
  close.title = 'Fechar este aviso por 7 dias'
  close.setAttribute('aria-label', 'Fechar este aviso por 7 dias')
  close.addEventListener('click', () => {
    try {
      localStorage.setItem(EMAIL_BANNER_KEY, JSON.stringify({ email: email.email, until: Date.now() + 7 * 86_400_000 }))
    } catch {
      /* sem armazenamento: some só até recarregar */
    }
    bar.remove()
  })
  bar.replaceChildren(
    el('span', '', `✉️ Confirme seu e-mail (${email.email}) para abrir sua página a novos alunos e receber pagamentos. Enviamos um link para você.`),
    again,
    fix,
    close,
  )
}

function openEmailChange(email) {
  const box = el('dialog', 'confirm-dialog')
  const form = el('form', 'payout-confirm')
  form.method = 'dialog'
  form.append(
    el('h2', '', 'Corrigir o e-mail da conta'),
    el('p', '', `Hoje a conta está com ${email.email}. Digite o e-mail certo e a sua senha: enviamos o link de confirmação para o e-mail novo, e ele passa a ser o seu login.`),
  )
  const field = (label, name, type) => {
    const wrap = el('label', 'field')
    const input = el('input')
    Object.assign(input, { name, type, required: true, autocomplete: type === 'password' ? 'current-password' : 'email' })
    wrap.append(el('span', '', label), input)
    form.append(wrap)
    return input
  }
  const address = field('E-mail certo', 'email', 'email')
  const password = field('Sua senha', 'password', 'password')
  const status = el('p', 'form-error')
  status.hidden = true
  const actions = el('div', 'payout-actions')
  const cancel = el('button', 'button button--secondary', 'Cancelar')
  cancel.type = 'button'
  cancel.addEventListener('click', () => box.close())
  const save = el('button', 'button button--primary', 'Trocar e enviar o link')
  save.type = 'submit'
  actions.append(cancel, save)
  form.append(status, actions)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    save.disabled = true
    status.hidden = true
    try {
      const result = await accountRequest('/account/email', {
        method: 'POST',
        body: JSON.stringify({ email: address.value.trim(), password: password.value }),
      })
      box.close()
      paintEmailBanner({ email: result.email, verified: false })
      showToast(
        result.sent
          ? `Pronto! Enviamos o link de confirmação para ${result.email}. Seu login agora é este e-mail.`
          : `E-mail trocado para ${result.email}. Não conseguimos enviar o link agora: use “Reenviar e-mail” em alguns minutos.`,
      )
    } catch (error) {
      status.textContent = error.message
      status.hidden = false
      save.disabled = false
    }
  })
  box.addEventListener('close', () => box.remove())
  box.append(form)
  document.body.append(box)
  box.showModal()
  address.focus()
}

// ---------- uso do espaço (vídeos e PDFs)
export function storageLine(storage) {
  if (!storage?.limit) return null
  const box = el('div', 'saas-usage')
  const bar = el('progress')
  bar.max = storage.limit
  bar.value = Math.min(storage.used, storage.limit)
  box.append(el('small', '', `${mb(storage.used)} de ${mb(storage.limit)} em vídeos e PDFs (GIFs não contam)`), bar)
  return box
}

// ---------- minha conta e dados
function askDelete() {
  const box = el('dialog', 'confirm-dialog')
  const form = el('form', 'payout-confirm account-delete')
  form.noValidate = true
  const password = el('input')
  password.type = 'password'
  password.autocomplete = 'current-password'
  const word = el('input')
  word.type = 'text'
  word.autocomplete = 'off'
  const passLabel = el('label', 'field')
  passLabel.append(el('span', '', 'Sua senha'), password)
  const wordLabel = el('label', 'field')
  wordLabel.append(el('span', '', 'Digite EXCLUIR para confirmar'), word)
  const status = el('p', 'account-delete-status')
  status.setAttribute('role', 'status')
  const actions = el('div', 'payout-actions')
  const no = el('button', 'button button--secondary', 'Voltar')
  const yes = el('button', 'button button--danger', 'Excluir minha conta')
  no.type = 'button'
  yes.type = 'submit'
  no.addEventListener('click', () => {
    box.close()
    box.remove()
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    yes.disabled = true
    status.textContent = 'Excluindo…'
    try {
      await accountRequest('/account/delete', {
        method: 'POST',
        body: JSON.stringify({ password: password.value, confirm: word.value }),
        timeoutMs: 60000,
      })
      sessionStorage.clear()
      location.href = '/?conta=excluida'
    } catch (error) {
      status.textContent = error.message
      yes.disabled = false
    }
  })
  actions.append(no, yes)
  form.append(
    el('h2', '', 'Excluir minha conta'),
    el(
      'p',
      '',
      'Isso apaga de vez a sua conta, a sua página, todos os seus alunos (com as contas de acesso deles), treinos, avaliações, agenda e arquivos enviados. Não dá para desfazer. Se quiser guardar uma cópia, baixe os seus dados antes.',
    ),
    passLabel,
    wordLabel,
    status,
    actions,
  )
  box.append(form)
  document.body.append(box)
  box.showModal()
}

export function accountCard() {
  const card = el('section', 'panel account-card')
  const actions = el('div', 'payout-actions')
  const download = el('button', 'button button--secondary', 'Baixar meus dados')
  download.type = 'button'
  download.addEventListener('click', async () => {
    download.disabled = true
    try {
      const data = await accountRequest('/account/export', { timeoutMs: 60000 })
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `meus-dados-farisa-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 2000)
      showToast('Arquivo com os seus dados baixado.')
    } catch (error) {
      showToast(error.message)
    } finally {
      download.disabled = false
    }
  })
  const remove = el('button', 'button button--secondary account-delete-open', 'Excluir minha conta')
  remove.type = 'button'
  remove.addEventListener('click', askDelete)
  actions.append(download, remove)
  card.append(
    el('h2', '', 'Minha conta e dados'),
    el(
      'p',
      'support-muted',
      'Você pode baixar uma cópia dos seus dados (alunos, treinos, avaliações, pagamentos) a qualquer momento, ou excluir a conta de vez.',
    ),
    actions,
  )
  return card
}

// ---------- primeiros passos (aparece no Painel até concluir ou ocultar)
const HIDE_KEY = 'farisa-primeiros-passos-oculto'
const DONE_KEY = 'farisa-primeiros-passos-concluido'
const STEPS = [
  ['profile', 'Complete o seu perfil', 'Foto, telefone e uma frase sobre você.', '#painel', 'profile'],
  ['site', 'Monte a sua página', 'Marca, cor, foto e os preços dos seus planos.', '#meu-site'],
  ['payout', 'Escolha como receber', 'Mercado Pago ou a sua chave Pix.', '#recebimentos'],
  ['student', 'Cadastre o primeiro aluno', 'Ou envie o link da sua página para ele se cadastrar.', '#alunos'],
  ['workout', 'Monte o primeiro treino', 'Crie a ficha e publique para o aluno.', '#treinos'],
]

export async function paintOnboarding() {
  const host = document.querySelector('[data-route="painel"]')
  if (!host || !sessionStorage.getItem('farisa-coach-api-token')) return
  let hidden = false
  try {
    hidden = localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    hidden = false
  }
  let card = host.querySelector('[data-onboarding]')
  if (hidden) {
    card?.remove()
    return
  }
  let data
  try {
    data = await accountRequest('/onboarding')
  } catch {
    return
  }
  const done = STEPS.filter(([key]) => data.steps?.[key]).length
  let celebrated = false
  try {
    celebrated = localStorage.getItem(DONE_KEY) === '1'
  } catch {
    celebrated = false
  }
  if (done === STEPS.length && celebrated) {
    card?.remove()
    return
  }
  if (!card) {
    card = el('section', 'panel onboarding')
    card.dataset.onboarding = ''
    host.querySelector('.page-heading')?.after(card)
  }
  // Tudo concluído: parabéns uma vez, até a pessoa fechar.
  if (done === STEPS.length) {
    card.classList.add('onboarding--done')
    const close = el('button', 'button button--primary', 'Fechar')
    close.type = 'button'
    close.addEventListener('click', () => {
      try {
        localStorage.setItem(DONE_KEY, '1')
      } catch {
        /* sem armazenamento: some só nesta visita */
      }
      card.remove()
    })
    const text = el('div')
    text.append(
      el('h2', '', '🎉 Tudo pronto!'),
      el('p', '', 'Sua conta está configurada: perfil, página, recebimento, aluno e treino. Agora é só divulgar a sua página.'),
    )
    card.replaceChildren(text)
    if (data.slug) {
      const share = el('p', 'onboarding-share')
      const link = el('a', '', `${location.origin}/p/${data.slug}`)
      link.href = `/p/${data.slug}`
      link.target = '_blank'
      link.rel = 'noopener'
      share.append('Sua página: ', link)
      card.append(share)
    }
    card.append(close)
    return
  }
  card.classList.remove('onboarding--done')
  const head = el('div', 'onboarding-head')
  const title = el('div')
  title.append(el('h2', '', 'Primeiros passos'), el('p', '', `${done} de ${STEPS.length} concluídos`))
  const hide = el('button', 'link-button', 'Ocultar')
  hide.type = 'button'
  hide.addEventListener('click', () => {
    try {
      localStorage.setItem(HIDE_KEY, '1')
    } catch {
      /* sem armazenamento: some só nesta visita */
    }
    card.remove()
  })
  head.append(title, hide)
  const bar = el('progress')
  bar.max = STEPS.length
  bar.value = done
  const list = el('ol', 'onboarding-list')
  STEPS.forEach(([key, label, hint, href, action]) => {
    const ok = Boolean(data.steps?.[key])
    const item = el('li', ok ? 'is-done' : '')
    const mark = el('span', 'onboarding-mark', ok ? '✓' : '')
    const text = el('div')
    text.append(el('strong', '', label), el('small', '', hint))
    item.append(mark, text)
    if (!ok) {
      const go = el('a', 'button button--secondary', 'Fazer')
      go.href = href
      if (action === 'profile')
        go.addEventListener('click', (event) => {
          const open = document.querySelector('.topbar .profile')
          if (open) {
            event.preventDefault()
            open.click()
          }
        })
      item.append(go)
    }
    list.append(item)
  })
  card.replaceChildren(head, bar, list)
  if (data.slug) {
    const share = el('p', 'onboarding-share')
    const link = el('a', '', `${location.origin}/p/${data.slug}`)
    link.href = `/p/${data.slug}`
    link.target = '_blank'
    link.rel = 'noopener'
    share.append('Sua página: ', link)
    card.append(share)
  }
}
