// Área do administrador da plataforma (/admin). Página separada do site:
// login próprio (conta de administrador, não de personal) e código que só é
// baixado por quem abre /admin.
import './admin.css'
import { paintAvatar } from '../modules/profile-kit.js'
import { initPasswordControls } from '../modules/password-controls.js'
import { historyBox } from '../modules/payout-history.js'

const API_URL = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'farisa-admin-token'
let trainers = []

const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
const setToken = (token) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* sem armazenamento: a sessão dura só até recarregar */
  }
}

async function api(path, options = {}) {
  const token = getToken()
  let response
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    throw new Error('Não foi possível conectar ao servidor.')
  }
  const result = await response.json().catch(() => null)
  if (response.status === 401 && path !== '/admin/auth/login') {
    setToken(null)
    showLogin('Sua sessão expirou. Entre de novo.')
  }
  if (!response.ok) throw new Error(result?.error || 'Não foi possível concluir a solicitação.')
  return result
}

const $ = (selector) => document.querySelector(selector)

function el(tag, className = '', text = '') {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

const toDate = (value) => {
  if (!value) return null
  const raw = String(value)
  const date = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}
const formatDay = (value) =>
  toDate(value)?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) ||
  '—'
function formatLastLogin(value) {
  const date = toDate(value)
  if (!date) return 'Ainda não registrado'
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0)
    return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Ontem'
  if (days < 30) return `Há ${days} dias`
  return formatDay(value)
}

const money = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
let overview = {}
let saasPlansList = []
let folderOpen = false
const PLAN_NAMES = { free: 'Grátis', unlimited: 'Ilimitado' }
let tickets = []
let openTicket = null
let ticketQuery = ''
let ticketsOpen = false
const ticketGroups = {}

function render() {
  const recentLimit = Date.now() - 30 * 86_400_000
  const stat = (key, value) => {
    const node = document.querySelector(`[data-admin-stat="${key}"]`)
    if (node) node.textContent = String(value)
  }
  const blocked = trainers.filter((item) => item.status === 'blocked').length
  stat('trainers', trainers.length)
  stat('blocked', blocked ? `${blocked} bloqueado(s)` : 'Contas cadastradas')
  stat('students', trainers.reduce((sum, item) => sum + item.students, 0))
  stat('active', `${trainers.reduce((sum, item) => sum + item.activeStudents, 0)} com acesso`)
  stat('revenue', money(overview.revenue30Cents))
  stat('payments', `${overview.payments30 || 0} pagamento(s) · 30 dias`)
  stat(
    'recent',
    trainers.filter((item) => (toDate(item.lastLoginAt)?.getTime() || 0) >= recentLimit).length,
  )
  const query = ($('[data-admin-search]').value || '').trim().toLocaleLowerCase('pt-BR')
  const filter = $('[data-admin-filter]').value
  const list = trainers.filter(
    (item) =>
      `${item.name} ${item.email}`.toLocaleLowerCase('pt-BR').includes(query) &&
      (filter === 'all' || (item.status || 'active') === filter),
  )
  // A lista fica fechada na pasta "Todos os personais": abre ao clicar, ou
  // sozinha quando há busca ou filtro.
  const searching = Boolean(query) || filter !== 'all'
  const open = folderOpen || searching
  const folder = $('[data-admin-folder]')
  folder.setAttribute('aria-expanded', String(open))
  folder.classList.toggle('is-open', open)
  folder.querySelector('strong').textContent = searching ? 'Resultado da busca' : 'Todos os personais'
  $('[data-admin-folder-count]').textContent = searching
    ? `${list.length} de ${trainers.length} personal(is)`
    : `${trainers.length} personal(is) · ${open ? 'toque para fechar' : 'toque para abrir'}`
  $('[data-admin-table]').hidden = !open
  $('[data-admin-trainers]').replaceChildren(
    ...list.map((trainer) => {
      const row = document.createElement('tr')
      if (trainer.status === 'blocked') row.className = 'is-blocked'
      const person = el('td')
      const cell = el('div', 'person-cell')
      const avatar = el('span', 'avatar')
      paintAvatar(avatar, trainer)
      const info = el('div')
      const name = el('strong', '', trainer.name)
      if (trainer.isOwner) name.append(' ', el('span', 'admin-badge', 'Dono do site'))
      info.append(name, el('small', '', trainer.email))
      if (trainer.planName) info.append(el('small', 'admin-muted', trainer.planName))
      cell.append(avatar, info)
      person.append(cell)
      const status = el('td')
      status.append(
        el(
          'span',
          `admin-status admin-status--${trainer.status === 'blocked' ? 'blocked' : 'active'}`,
          trainer.status === 'blocked' ? 'Bloqueado' : 'Ativo',
        ),
      )
      if (trainer.blockedReason) status.append(el('small', 'admin-muted', trainer.blockedReason))
      if (trainer.saasPlan) {
        const expires = toDate(trainer.saasExpiresAt)
        const expired = expires && expires < new Date()
        status.append(
          el(
            'small',
            expired ? 'admin-alert' : 'admin-muted',
            `${PLAN_NAMES[trainer.saasPlan] || trainer.saasPlan}${expires ? ` · ${expired ? 'venceu' : 'até'} ${formatDay(trainer.saasExpiresAt)}` : ' · sem vencimento'}`,
          ),
        )
      }
      // Teste completo de 30 dias (só faz diferença no Grátis).
      if (trainer.saasPlan === 'free' && !trainer.isOwner && trainer.trialEndsAt) {
        const trialEnd = toDate(trainer.trialEndsAt)
        const inTrial = trialEnd && trialEnd > new Date()
        status.append(
          el('small', 'admin-muted', inTrial ? `Teste completo até ${formatDay(trainer.trialEndsAt)}` : 'Teste encerrado · ferramentas básicas'),
        )
      }
      if (trainer.payoutMode)
        status.append(
          el(
            'small',
            trainer.payoutMode === 'none' ? 'admin-alert' : 'admin-muted',
            {
              platform: 'Recebe: conta da plataforma',
              mercadopago: 'Recebe: Mercado Pago próprio',
              pix: 'Recebe: chave Pix própria',
              none: 'Recebimento não configurado',
            }[trainer.payoutMode],
          ),
        )
      if (trainer.openTickets)
        status.append(el('small', 'admin-alert', `${trainer.openTickets} chamado(s) aberto(s)`))
      const students = el('td')
      students.append(el('strong', '', String(trainer.students)))
      const limit = trainer.studentLimit ? ` · limite ${trainer.studentLimit}` : ' · sem limite'
      students.append(el('small', 'admin-muted', `${trainer.activeStudents} com acesso${limit}`))
      if (trainer.revenue30Cents)
        students.append(el('small', 'admin-muted', `${money(trainer.revenue30Cents)} em 30 dias`))
      const actions = el('td', 'admin-actions')
      const menu = el('details', 'admin-menu')
      const summary = el('summary', 'button button--secondary', 'Ações ▾')
      const items = el('div', 'admin-menu-list')
      summary.addEventListener('click', () => {
        menu.dataset.openedAt = String(Date.now())
      })
      // Abre o menu por cima da página, alinhado ao botão (não é cortado pela tabela).
      menu.addEventListener('toggle', () => {
        if (!menu.open) return
        document.querySelectorAll('.admin-menu[open]').forEach((other) => {
          if (other !== menu) other.open = false
        })
        menu.dataset.openedAt = String(Date.now())
        const rect = summary.getBoundingClientRect()
        const height = items.offsetHeight || 230
        const below = rect.bottom + 6 + height <= window.innerHeight
        items.style.top = `${below ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)}px`
        items.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`
        items.style.left = 'auto'
      })
      const action = (label, handler, extra = '') => {
        const button = el('button', extra, label)
        button.type = 'button'
        button.addEventListener('click', () => {
          menu.open = false
          handler(trainer)
        })
        items.append(button)
      }
      action('Editar dados', openTrainerForm)
      action('Acessar painel (suporte)', impersonate)
      action('Plano e limite de alunos', setPlan)
      if (!trainer.isOwner) action('Teste de 30 dias…', setTrial)
      action('Marcar e-mail como confirmado', confirmEmail)
      action('Gerar nova senha', resetPassword)
      action(trainer.status === 'blocked' ? 'Desbloquear' : 'Bloquear', toggleBlock)
      action('Excluir personal…', deleteTrainer, 'is-danger')
      menu.append(summary, items)
      actions.append(menu)
      row.append(
        person,
        status,
        students,
        el('td', '', String(trainer.workouts)),
        el('td', '', formatLastLogin(trainer.lastLoginAt)),
        actions,
      )
      return row
    }),
  )
  $('[data-admin-empty]').hidden = !open || list.length > 0
}

// ---------- janelas (formulário, confirmação, resultado)
function dialog({ eyebrow = 'Administração', title, body, confirmLabel = 'Confirmar', danger = false, cancelLabel = 'Cancelar' }) {
  const box = el('dialog', 'modal admin-dialog')
  const form = el('form')
  form.method = 'dialog'
  const header = el('header')
  const titles = el('div')
  titles.append(el('span', 'eyebrow eyebrow--blue', eyebrow), el('h2', '', title))
  const close = el('button', 'icon-button', '×')
  // type="button": fecha sem passar pela validação dos campos obrigatórios.
  close.type = 'button'
  close.addEventListener('click', () => box.close())
  close.setAttribute('aria-label', 'Fechar')
  header.append(titles, close)
  const content = el('div', 'modal-body')
  content.append(...body)
  const status = el('p', 'admin-dialog-status')
  status.setAttribute('role', 'status')
  content.append(status)
  const footer = el('footer')
  if (cancelLabel) {
    const cancel = el('button', 'button button--secondary', cancelLabel)
    cancel.type = 'button'
    cancel.addEventListener('click', () => box.close())
    footer.append(cancel)
  }
  const ok = el('button', `button ${danger ? 'button--danger' : 'button--primary'}`, confirmLabel)
  ok.type = 'submit'
  ok.value = 'ok'
  footer.append(ok)
  form.append(header, content, footer)
  box.append(form)
  document.body.append(box)
  box.addEventListener('close', () => box.remove())
  return { box, form, status, ok }
}
function field(label, name, { type = 'text', value = '', required = false, placeholder = '', textarea = false } = {}) {
  const wrap = el('label', 'field')
  const input = el(textarea ? 'textarea' : 'input')
  input.name = name
  if (!textarea) input.type = type
  if (textarea) input.rows = 3
  input.value = value ?? ''
  input.required = required
  input.placeholder = placeholder
  wrap.append(el('span', '', label), input)
  return wrap
}
function run(form, ok, status, task) {
  form.addEventListener('submit', async (event) => {
    if (event.submitter?.value !== 'ok') return
    event.preventDefault()
    if (!form.reportValidity()) return
    ok.disabled = true
    status.textContent = ''
    try {
      await task(Object.fromEntries(new FormData(form)))
    } catch (error) {
      status.textContent = error.message
      ok.disabled = false
    }
  })
}
function showPassword(title, trainer, password) {
  const copy = el('button', 'button button--secondary', 'Copiar senha')
  copy.type = 'button'
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(password)
      copy.textContent = 'Copiada!'
    } catch {
      copy.textContent = 'Copie manualmente'
    }
  })
  const code = el('code', 'admin-password', password)
  const { box, form } = dialog({
    title,
    body: [
      el('p', '', `Senha provisória de ${trainer.name} (${trainer.email}). Ela aparece só agora — envie ao personal por um canal seguro e peça para trocar em "Esqueci a senha" ou no perfil.`),
      code,
      copy,
    ],
    confirmLabel: 'Pronto',
    cancelLabel: '',
  })
  form.addEventListener('submit', () => box.close())
  box.showModal()
}

async function reload() {
  const [list, stats] = await Promise.all([
    api('/admin/trainers'),
    api('/admin/overview').catch(() => ({})),
  ])
  trainers = list || []
  overview = stats || {}
  if (!saasPlansList.length) saasPlansList = (await api('/admin/saas-plans').catch(() => [])) || []
  saasPlansList.forEach((plan) => (PLAN_NAMES[plan.code] = plan.name))
  render()
  await loadTickets()
}

function openTrainerForm(trainer = null) {
  const editing = Boolean(trainer?.id)
  const body = [
    field('Nome completo', 'name', { value: trainer?.name, required: true }),
    field('E-mail de acesso', 'email', { type: 'email', value: trainer?.email, required: true }),
  ]
  const grid = el('div', 'field-grid')
  grid.append(
    field('Telefone / WhatsApp', 'phone', { value: trainer?.phone }),
    field('CREF', 'cref', { value: trainer?.cref }),
  )
  body.push(grid)
  body.push(
    el(
      'p',
      'admin-muted',
      editing
        ? 'Plano e limite de alunos: use “Plano e limite de alunos” no menu Ações.'
        : 'A conta começa no plano Grátis. Depois, use “Plano e limite de alunos” no menu Ações para mudar.',
    ),
  )
  if (editing) body.push(field('Anotações internas (só o admin vê)', 'adminNotes', { value: trainer?.adminNotes, textarea: true }))
  else body.push(el('p', 'admin-muted', 'Uma senha provisória será criada e mostrada uma única vez.'))
  const { box, form, status, ok } = dialog({
    title: editing ? `Editar ${trainer.name}` : 'Novo personal',
    body,
    confirmLabel: editing ? 'Salvar alterações' : 'Criar conta',
  })
  run(form, ok, status, async (values) => {
    if (editing) {
      await api(`/admin/trainers/${trainer.id}`, { method: 'PUT', body: JSON.stringify(values) })
      box.close()
    } else {
      const created = await api('/admin/trainers', { method: 'POST', body: JSON.stringify(values) })
      box.close()
      showPassword('Personal criado', created, created.temporaryPassword)
    }
    await reload()
  })
  box.showModal()
}

function impersonate(trainer) {
  const { box, form, status, ok } = dialog({
    title: `Acessar o painel de ${trainer.name}`,
    body: [
      el('p', '', 'Abre o FARISA Painel deste personal numa nova aba, por 1 hora, para dar suporte. Você verá os dados dos alunos dele — use só o necessário.'),
      field('Motivo do acesso (fica registrado)', 'reason', { required: true, placeholder: 'Ex.: chamado sobre ficha que não aparece para o aluno' }),
    ],
    confirmLabel: 'Abrir painel',
  })
  run(form, ok, status, async ({ reason }) => {
    const tab = window.open('about:blank', '_blank')
    const result = await api(`/admin/trainers/${trainer.id}/impersonate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
    const url = `/personal/#suporte-acesso?token=${encodeURIComponent(result.token)}&nome=${encodeURIComponent(result.trainer.name)}`
    if (tab) tab.location.href = url
    else window.location.href = url
    box.close()
  })
  box.showModal()
}

// Teste completo de 30 dias do personal: encerrar agora (para conferir o
// plano Grátis básico) ou dar mais 30 dias.
function setTrial(trainer) {
  const ends = trainer.trialEndsAt ? new Date(trainer.trialEndsAt) : null
  const active = ends && ends.getTime() > Date.now()
  const day = (date) => date.toLocaleDateString('pt-BR')
  const situation = !ends
    ? 'Esta conta não tem teste de 30 dias registrado.'
    : active
      ? `Em teste completo até ${day(ends)}.`
      : `Teste encerrado em ${day(ends)}. Se estiver no Grátis, usa só as ferramentas básicas.`
  const paid = trainer.saasPlan && trainer.saasPlan !== 'free'
  const choice = el('div', 'admin-trial-choice')
  ;[
    ['end', 'Encerrar o teste agora', 'A conta passa na hora para as ferramentas básicas do Grátis (se não tiver plano pago).'],
    ['restart', 'Dar mais 30 dias', 'Libera tudo de novo por 30 dias a partir de hoje.'],
  ].forEach(([value, label, hint], index) => {
    const option = el('label', 'check-field')
    const input = el('input')
    Object.assign(input, { type: 'radio', name: 'action', value, required: true, checked: index === (active ? 0 : 1) })
    const text = el('span')
    text.append(el('strong', '', label), el('br'), el('small', 'admin-muted', hint))
    option.append(input, text)
    choice.append(option)
  })
  const body = [el('p', '', situation), choice]
  if (paid) body.push(el('p', 'admin-muted', 'Esta conta tem plano pago: o teste não muda nada enquanto o plano estiver ativo.'))
  const { box, form, status, ok } = dialog({ title: `Teste de 30 dias · ${trainer.name}`, body, confirmLabel: 'Aplicar' })
  run(form, ok, status, async ({ action }) => {
    await api(`/admin/trainers/${trainer.id}/trial`, { method: 'POST', body: JSON.stringify({ action }) })
    box.close()
    await reload()
  })
  box.showModal()
}

function confirmEmail(trainer) {
  const { box, form, status, ok } = dialog({
    title: `Confirmar o e-mail de ${trainer.name}`,
    body: [
      el('p', '', `Marca ${trainer.email} como confirmado e tira o aviso amarelo do painel deste personal. Use quando o e-mail de confirmação não chegar ou numa conta de teste.`),
    ],
    confirmLabel: 'Marcar como confirmado',
  })
  run(form, ok, status, async () => {
    await api(`/admin/trainers/${trainer.id}/confirm-email`, { method: 'POST', body: '{}' })
    box.close()
    await reload()
  })
  box.showModal()
}

function resetPassword(trainer) {
  const { box, form, status, ok } = dialog({
    title: `Nova senha para ${trainer.name}`,
    body: [el('p', '', 'Cria uma senha provisória e encerra as sessões abertas deste personal. A senha antiga deixa de funcionar.')],
    confirmLabel: 'Gerar nova senha',
  })
  run(form, ok, status, async () => {
    const result = await api(`/admin/trainers/${trainer.id}/password`, { method: 'POST', body: '{}' })
    box.close()
    showPassword('Nova senha gerada', trainer, result.temporaryPassword)
    await reload()
  })
  box.showModal()
}

function toggleBlock(trainer) {
  const blocking = trainer.status !== 'blocked'
  const { box, form, status, ok } = dialog({
    title: blocking ? `Bloquear ${trainer.name}` : `Desbloquear ${trainer.name}`,
    body: blocking
      ? [
          el('p', '', 'O personal não consegue mais entrar e as sessões abertas são encerradas. Os alunos dele mantêm o acesso já pago à área do aluno.'),
          field('Motivo (aparece para o personal ao tentar entrar)', 'reason', { required: true, placeholder: 'Ex.: assinatura da plataforma em atraso' }),
        ]
      : [el('p', '', 'O personal volta a entrar normalmente no painel.')],
    confirmLabel: blocking ? 'Bloquear' : 'Desbloquear',
    danger: blocking,
  })
  run(form, ok, status, async ({ reason }) => {
    await api(`/admin/trainers/${trainer.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: blocking ? 'blocked' : 'active', reason }),
    })
    box.close()
    await reload()
  })
  box.showModal()
}

function deleteTrainer(trainer) {
  const { box, form, status, ok } = dialog({
    title: `Excluir ${trainer.name}`,
    body: [
      el('p', 'admin-danger-text', `Apaga DEFINITIVAMENTE a conta do personal e todos os dados ligados a ela: ${trainer.students} aluno(s), fichas, avaliações, check-ins, agenda, pagamentos registrados e arquivos (GIFs, vídeos, PDFs). Não há como desfazer.`),
      field('Motivo', 'reason', { required: true, placeholder: 'Ex.: pedido do personal / fim do contrato' }),
      field(`Digite o e-mail ${trainer.email} para confirmar`, 'confirmEmail', { type: 'email', required: true }),
    ],
    confirmLabel: 'Excluir definitivamente',
    danger: true,
  })
  run(form, ok, status, async (values) => {
    await api(`/admin/trainers/${trainer.id}/delete`, { method: 'POST', body: JSON.stringify(values) })
    box.close()
    await reload()
  })
  box.showModal()
}

function setPlan(trainer) {
  const select = el('select')
  select.name = 'planCode'
  ;(saasPlansList.length ? saasPlansList : Object.entries(PLAN_NAMES).map(([code, name]) => ({ code, name }))).forEach((plan) => {
    const option = el('option', '', `${plan.name} · ${plan.studentLimit ? `até ${plan.studentLimit} alunos` : 'sem limite de alunos'}`)
    option.value = plan.code
    select.append(option)
  })
  select.value = trainer.saasPlan || 'free'
  const planField = el('label', 'field')
  planField.append(el('span', '', 'Plano'), select)
  const expires = trainer.saasExpiresAt ? toDate(trainer.saasExpiresAt) : null
  const dateValue = expires
    ? `${expires.getFullYear()}-${String(expires.getMonth() + 1).padStart(2, '0')}-${String(expires.getDate()).padStart(2, '0')}`
    : ''
  const limitField = field('Limite de alunos deste personal', 'studentLimit', {
    type: 'number',
    value: trainer.customLimit ?? '',
  })
  limitField.querySelector('input').min = '0'
  limitField.querySelector('input').placeholder = 'Limite do plano'
  const dateField = field('Ilimitado válido até', 'expiresAt', { type: 'date', value: dateValue })
  const syncDate = () => {
    const free = select.value === 'free'
    dateField.style.display = free ? 'none' : ''
    if (dateField.nextElementSibling) dateField.nextElementSibling.style.display = free ? 'none' : ''
    if (free) dateField.querySelector('input').value = ''
  }
  select.addEventListener('change', syncDate)
  const { box, form, status, ok } = dialog({
    title: `Plano de ${trainer.name}`,
    body: [
      el('p', '', 'Escolha o plano deste personal e, se quiser, um limite de alunos só para ele.'),
      planField,
      limitField,
      el('small', 'admin-muted', 'Vazio = usa o limite do plano · 0 = sem limite · ou digite o número de alunos.'),
      dateField,
      el('small', 'admin-muted', 'Só para o Ilimitado. Vazio = sem vencimento (cortesia). O Grátis é permanente.'),
    ],
    confirmLabel: 'Salvar plano',
  })
  syncDate()
  run(form, ok, status, async (values) => {
    await api(`/admin/trainers/${trainer.id}/plan`, { method: 'POST', body: JSON.stringify(values) })
    box.close()
    await reload()
  })
  box.showModal()
}

// Aba Faturamento: resumo das assinaturas, vencimentos e o relatório de pagamentos.
async function renderBilling() {
  const root = $('[data-admin-billing]')
  if (!root.childElementCount) root.replaceChildren(el('p', 'admin-billing-note', 'Carregando…'))
  let data
  try {
    data = await api('/admin/billing')
  } catch (error) {
    root.replaceChildren(el('p', 'admin-billing-note', error.message))
    return
  }
  const summary = data.summary || {}
  const tile = (label, value, hint) => {
    const box = el('article', 'panel admin-billing-tile')
    box.append(el('span', '', label), el('strong', '', value), el('small', '', hint))
    return box
  }
  const tiles = el('div', 'admin-billing-tiles')
  tiles.append(
    tile('Assinantes pagando', String(summary.paying || 0), `de ${summary.trainers || 0} personais`),
    tile('Receita mensal prevista', money(summary.monthlyCents), 'se todos renovarem'),
    tile('No plano Grátis', String(summary.free || 0), 'podem virar assinantes'),
    tile('Cortesia', String(summary.courtesy || 0), 'Ilimitado sem vencimento'),
  )

  const soon = (data.expiring || []).filter((item) => item.daysLeft <= 30)
  const due = el('article', 'panel admin-billing-due')
  due.append(el('h2', '', 'Vencimentos nos próximos 30 dias'))
  if (!soon.length) due.append(el('p', 'admin-billing-note', 'Nenhuma assinatura vence nos próximos 30 dias.'))
  soon.forEach((item) => {
    const row = el('div', 'admin-billing-row')
    const who = el('div')
    who.append(el('strong', '', item.name), el('small', '', `${item.email} · ${item.planName} · ${money(item.priceCents)}`))
    const when =
      item.daysLeft <= 0 ? 'Venceu' : item.daysLeft === 1 ? 'Vence amanhã' : `Vence em ${item.daysLeft} dias`
    const tag = el('span', `admin-billing-tag${item.daysLeft <= 3 ? ' is-urgent' : item.daysLeft <= 7 ? ' is-soon' : ''}`, when)
    const date = toDate(item.expiresAt)
    if (date) tag.title = date.toLocaleDateString('pt-BR')
    row.append(who, tag)
    due.append(row)
  })

  const report = historyBox(
    (data.payments || []).map((item) => ({ ...item, studentName: item.trainerName })),
    {
      key: 'assinaturas',
      title: 'Pagamentos de assinatura',
      who: 'Personal',
      plural: 'personais',
      removed: 'Personal removido',
      file: 'faturamento-farisa',
      emptyAll: 'Ainda não há pagamentos de assinatura. Eles aparecem aqui assim que um personal assinar.',
    },
  )
  root.replaceChildren(tiles, due, report)
}

async function renderPlans() {
  saasPlansList = (await api('/admin/saas-plans').catch(() => [])) || []
  $('[data-admin-plans]').replaceChildren(
    ...saasPlansList.map((plan) => {
      const tr = document.createElement('tr')
      tr.dataset.code = plan.code
      const input = (name, value, type = 'text') => {
        const node = el('input')
        node.name = name
        node.type = type
        node.value = value ?? ''
        if (type === 'number') node.min = '0'
        if (name === 'price') node.step = '0.01'
        return node
      }
      const name = el('td')
      name.append(input('name', plan.name))
      const price = el('td')
      if (plan.isFree) price.append(el('small', 'admin-muted', 'Grátis · permanente'))
      else price.append(input('price', (plan.priceCents / 100).toFixed(2), 'number'))
      const limit = el('td')
      limit.append(input('studentLimit', plan.studentLimit, 'number'), el('small', 'admin-muted', plan.studentLimit ? `até ${plan.studentLimit} alunos` : 'sem limite'))
      // Plano anual: preço editável; o desconto (%) acompanha e vice-versa.
      const annual = el('td')
      if (plan.isFree) annual.append(el('small', 'admin-muted', '—'))
      else {
        const yearly = input('annualPrice', (Number(plan.annualPriceCents || 0) / 100).toFixed(2), 'number')
        const percent = input('annualDiscount', plan.annualDiscount ?? 20, 'number')
        yearly.step = '0.01'
        percent.max = '90'
        percent.className = 'admin-annual-percent'
        const hint = el('small', 'admin-muted')
        const monthly = () => Number(tr.querySelector('[name="price"]')?.value || 0)
        const paint = () => {
          const value = Number(yearly.value || 0)
          hint.textContent = value ? `${money(Math.round(value * 100))}/ano = ${money(Math.round((value * 100) / 12))}/mês` : ''
        }
        yearly.addEventListener('input', () => {
          if (monthly()) percent.value = String(Math.max(0, Math.round((1 - Number(yearly.value || 0) / (monthly() * 12)) * 100)))
          paint()
        })
        const fromPercent = () => {
          yearly.value = ((monthly() * 12 * (100 - Number(percent.value || 0))) / 100).toFixed(2)
          paint()
        }
        percent.addEventListener('input', fromPercent)
        // Mudou o mensal: mantém o mesmo % e recalcula o anual.
        queueMicrotask(() => tr.querySelector('[name="price"]')?.addEventListener('input', fromPercent))
        const row = el('div', 'admin-annual')
        row.append(el('span', 'admin-muted', 'R$'), yearly, el('span', 'admin-muted', 'ou'), percent, el('span', 'admin-muted', '% off'))
        annual.append(row, hint)
        paint()
      }
      const desc = el('td')
      desc.append(input('description', plan.description))
      tr.append(name, price, limit, annual, desc)
      return tr
    }),
  )
}

async function savePlans() {
  const status = $('[data-admin-plans-status]')
  const plans = [...document.querySelectorAll('[data-admin-plans] tr')].map((tr) => ({
    code: tr.dataset.code,
    name: tr.querySelector('[name="name"]').value,
    priceCents: Math.round(Number(tr.querySelector('[name="price"]')?.value || 0) * 100),
    studentLimit: Number(tr.querySelector('[name="studentLimit"]').value),
    annualDiscount: Number(tr.querySelector('[name="annualDiscount"]')?.value ?? 20),
    annualPriceCents: Math.round(Number(tr.querySelector('[name="annualPrice"]')?.value || 0) * 100),
    description: tr.querySelector('[name="description"]').value,
  }))
  status.textContent = 'Salvando…'
  try {
    await api('/admin/saas-plans', { method: 'PUT', body: JSON.stringify({ plans }) })
    status.textContent = 'Planos salvos. Os novos valores já valem para os personais.'
    await reload()
    await renderPlans()
  } catch (error) {
    status.textContent = error.message
  }
}

// ---------- suporte
const SUPPORT_STATUS = { open: 'Aguardando você', answered: 'Respondido', closed: 'Encerrado' }
const CATEGORY = { duvida: 'Dúvida', problema: 'Problema', pagamento: 'Pagamentos', conta: 'Conta', sugestao: 'Sugestão' }
async function loadTickets() {
  tickets = (await api('/admin/support').catch(() => [])) || []
  const pending = tickets.filter((ticket) => ticket.unread && ticket.status !== 'closed').length
  const badge = $('[data-admin-support-count]')
  badge.hidden = !pending
  badge.textContent = String(pending)
  if (!$('[data-admin-section="suporte"]').hidden) await renderSupport()
}
async function renderSupport() {
  const root = $('[data-admin-support]')
  const list = el('aside', 'panel support-list')
  list.append(el('h2', '', 'Chamados'))
  // Buscador + "Aguardando você" sempre à vista + pasta "Todos os chamados"
  // (abre ao clicar, ou sozinha quando há busca).
  const search = el('label', 'search-box support-search')
  const input = el('input')
  input.type = 'search'
  input.placeholder = 'Buscar chamado'
  input.setAttribute('aria-label', 'Buscar por personal ou assunto')
  input.value = ticketQuery
  search.append(input)
  const items = el('div', 'support-items')
  const ticketButton = (ticket) => {
    const item = el('button', `support-item${ticket.id === openTicket ? ' is-active' : ''}${ticket.unread ? ' is-unread' : ''}`)
    item.type = 'button'
    item.append(
      el('strong', '', ticket.subject),
      el('small', '', `${ticket.trainerName} · ${SUPPORT_STATUS[ticket.status]}`),
    )
    item.addEventListener('click', () => {
      openTicket = ticket.id
      void renderSupport()
    })
    return item
  }
  const paintItems = () => {
    const query = ticketQuery.trim().toLocaleLowerCase('pt-BR')
    if (!tickets.length) {
      items.replaceChildren(el('p', 'support-muted', 'Nenhum chamado ainda.'))
      return
    }
    if (query) {
      const found = tickets.filter((ticket) =>
        `${ticket.subject} ${ticket.trainerName} ${ticket.trainerEmail || ''}`.toLocaleLowerCase('pt-BR').includes(query),
      )
      items.replaceChildren(
        el('small', 'support-group', `${found.length} resultado(s)`),
        ...(found.length ? found.map(ticketButton) : [el('p', 'support-muted', 'Nenhum chamado encontrado.')]),
      )
      return
    }
    const waiting = tickets.filter((ticket) => ticket.status === 'open')
    const folder = el('button', `admin-folder${ticketsOpen ? ' is-open' : ''}`)
    folder.type = 'button'
    folder.setAttribute('aria-expanded', String(ticketsOpen))
    const text = el('span', 'admin-folder-text')
    text.append(
      el('strong', '', 'Todos os chamados'),
      el('small', '', `${tickets.length} chamado(s) · ${ticketsOpen ? 'toque para fechar' : 'toque para abrir'}`),
    )
    folder.append(el('span', 'admin-folder-icon', '📁'), text, el('span', 'admin-folder-arrow', '▾'))
    folder.addEventListener('click', () => {
      ticketsOpen = !ticketsOpen
      paintItems()
    })
    items.replaceChildren(
      el('small', 'support-group', `Aguardando você (${waiting.length})`),
      ...(waiting.length ? waiting.map(ticketButton) : [el('p', 'support-muted', 'Nada pendente. 🎉')]),
      folder,
      ...(ticketsOpen
        ? [
            ['answered', 'Respondidos'],
            ['closed', 'Encerrados'],
          ]
            .map(([status, label]) => {
              const group = tickets.filter((ticket) => ticket.status === status)
              if (!group.length) return null
              const details = el('details', 'support-folder')
              details.open = ticketGroups[status] ?? status === 'answered'
              details.addEventListener('toggle', () => {
                ticketGroups[status] = details.open
              })
              const summary = el('summary')
              summary.append(el('span', '', label), el('small', '', String(group.length)))
              details.append(summary, ...group.map(ticketButton))
              return details
            })
            .filter(Boolean)
        : []),
    )
  }
  input.addEventListener('input', () => {
    ticketQuery = input.value
    paintItems()
  })
  paintItems()
  list.append(search, items)
  const main = el('section', 'panel support-thread')
  if (!openTicket) {
    main.append(el('p', 'support-muted', 'Escolha um chamado para ver a conversa.'))
  } else {
    try {
      const ticket = await api(`/admin/support/${openTicket}`)
      const head = el('header', 'support-thread-head')
      const title = el('div')
      title.append(
        el('strong', '', ticket.subject),
        el('small', '', `${ticket.trainerName} (${ticket.trainerEmail}) · ${CATEGORY[ticket.category] || ticket.category} · ${formatDay(ticket.createdAt)}`),
      )
      head.append(title, el('span', `support-status support-status--${ticket.status}`, SUPPORT_STATUS[ticket.status]))
      const messages = el('div', 'support-messages')
      ticket.messages.forEach((message) => {
        const bubble = el('div', `support-bubble support-bubble--${message.author === 'admin' ? 'trainer' : 'admin'}`)
        bubble.append(
          el('small', '', `${message.author === 'admin' ? 'Você (suporte)' : ticket.trainerName} · ${formatLastLogin(message.createdAt)}`),
          el('p', '', message.body),
        )
        messages.append(bubble)
      })
      const reply = el('form', 'support-reply')
      reply.append(field('Resposta', 'body', { textarea: true }))
      const buttons = el('div', 'support-actions')
      const close = el('button', 'button button--secondary', ticket.status === 'closed' ? 'Reabrir' : 'Encerrar chamado')
      close.type = 'button'
      close.addEventListener('click', async () => {
        await api(`/admin/support/${ticket.id}`, {
          method: 'POST',
          body: JSON.stringify({ status: ticket.status === 'closed' ? 'open' : 'closed' }),
        })
        await loadTickets()
        await renderSupport()
      })
      const send = el('button', 'button button--primary', 'Enviar resposta')
      send.type = 'submit'
      buttons.append(close, send)
      reply.append(buttons)
      reply.addEventListener('submit', async (event) => {
        event.preventDefault()
        const body = reply.elements.body.value.trim()
        if (!body) return
        send.disabled = true
        try {
          await api(`/admin/support/${ticket.id}`, { method: 'POST', body: JSON.stringify({ body }) })
          await loadTickets()
          await renderSupport()
        } catch (error) {
          send.disabled = false
          window.setTimeout(() => (send.textContent = 'Enviar resposta'), 1500)
          send.textContent = error.message
        }
      })
      main.append(head, messages, reply)
      requestAnimationFrame(() => (messages.scrollTop = messages.scrollHeight))
    } catch (error) {
      main.append(el('p', 'support-muted', error.message))
    }
  }
  root.replaceChildren(list, main)
}

// ---------- registro de ações
const ACTIONS = {
  trainer_created: 'Personal criado',
  trainer_updated: 'Dados editados',
  trainer_blocked: 'Personal bloqueado',
  trainer_unblocked: 'Personal desbloqueado',
  trainer_password_reset: 'Nova senha gerada',
  trainer_deleted: 'Personal excluído',
  trainer_impersonated: 'Acesso de suporte ao painel',
  library_opened: 'Biblioteca FARISA aberta para edição',
  library_synced: 'Biblioteca FARISA: arquivos viraram exercícios',
  trainer_plan_set: 'Plano definido',
  saas_plans_updated: 'Planos editados',
  support_replied: 'Resposta de suporte',
  support_closed: 'Chamado encerrado',
  support_open: 'Chamado reaberto',
}
const AUDIT_GROUPS = {
  personais: ['trainer_created', 'trainer_updated', 'trainer_blocked', 'trainer_unblocked', 'trainer_password_reset', 'trainer_deleted'],
  acessos: ['trainer_impersonated'],
  planos: ['trainer_plan_set', 'saas_plans_updated'],
  suporte: ['support_replied', 'support_closed', 'support_open'],
}
const AUDIT_DAYS = { hoje: 1, semana: 7, mes: 30 }
let auditRows = []
function paintAudit() {
  const query = ($('[data-audit-search]').value || '').trim().toLocaleLowerCase('pt-BR')
  const type = $('[data-audit-type]').dataset.value || 'all'
  const period = $('[data-audit-period]').value
  const since =
    period === 'hoje'
      ? new Date().setHours(0, 0, 0, 0)
      : AUDIT_DAYS[period]
        ? Date.now() - AUDIT_DAYS[period] * 86_400_000
        : 0
  const rows = auditRows.filter(
    (row) =>
      (type === 'all' || AUDIT_GROUPS[type]?.includes(row.action)) &&
      (!since || (toDate(row.createdAt)?.getTime() || 0) >= since) &&
      (!query ||
        `${ACTIONS[row.action] || row.action} ${row.targetLabel || ''} ${row.details || ''} ${row.adminEmail || ''}`
          .toLocaleLowerCase('pt-BR')
          .includes(query)),
  )
  $('[data-audit-count]').textContent = `${rows.length} de ${auditRows.length} ação(ões)`
  const filtered = Boolean(query) || type !== 'all' || period !== 'all'
  $('[data-audit-clear]').hidden = !filtered
  $('[data-admin-audit]').replaceChildren(
    ...(rows.length
      ? rows.map((row) => {
          const tr = document.createElement('tr')
          tr.append(
            el('td', '', `${formatDay(row.createdAt)} ${toDate(row.createdAt)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || ''}`),
            el('td', '', ACTIONS[row.action] || row.action),
            el('td', '', row.targetLabel || '—'),
            el('td', 'admin-muted', row.details || ''),
            el('td', 'admin-muted', row.adminEmail || ''),
          )
          return tr
        })
      : [(() => {
          const tr = document.createElement('tr')
          const td = el('td', 'admin-muted', auditRows.length ? 'Nenhuma ação com esse filtro.' : 'Nenhuma ação registrada ainda.')
          td.colSpan = 5
          tr.append(td)
          return tr
        })()]),
  )
}
async function renderAudit() {
  auditRows = (await api('/admin/audit').catch(() => [])) || []
  paintAudit()
  void renderErrors()
}
// Erros do servidor (os 100 mais recentes). Fica fechado; abre ao clicar.
async function renderErrors() {
  const box = $('[data-admin-errors]')
  const rows = (await api('/admin/errors').catch(() => [])) || []
  box.hidden = false
  const details = el('details', 'support-folder')
  const summary = el('summary')
  summary.append(el('span', '', 'Erros do sistema'), el('small', '', String(rows.length)))
  details.append(summary)
  if (!rows.length) details.append(el('p', 'admin-billing-note', 'Nenhum erro registrado. Quando o servidor falhar em alguma ação, aparece aqui.'))
  rows.forEach((row) => {
    const item = el('div', 'admin-billing-row')
    const text = el('div')
    const when = toDate(row.createdAt)
    text.append(
      el('strong', '', row.message || 'Erro'),
      el('small', '', [when ? when.toLocaleString('pt-BR') : '', row.route].filter(Boolean).join(' · ')),
    )
    // E-mail que não saiu: o motivo da Brevo fica à vista.
    if (['E-MAIL', 'PAGAMENTO'].includes(row.route) && row.detail) text.append(el('small', 'admin-alert', row.detail))
    item.append(text)
    item.title = row.detail || ''
    details.append(item)
  })
  if (rows.length) {
    const clear = el('button', 'button button--secondary', 'Limpar lista')
    clear.type = 'button'
    clear.addEventListener('click', clearErrors)
    details.append(clear)
  }
  box.replaceChildren(details, emailTester())
}

// Apaga os erros já resolvidos (os novos voltam a aparecer se acontecerem de novo).
function clearErrors() {
  const { box, form, status, ok } = dialog({
    title: 'Limpar os erros do sistema',
    body: [el('p', '', 'Apaga todos os erros da lista. Use depois de resolver: se o problema acontecer de novo, ele volta a aparecer aqui.')],
    confirmLabel: 'Limpar lista',
  })
  run(form, ok, status, async () => {
    await api('/admin/errors', { method: 'DELETE' })
    box.close()
    await renderErrors()
  })
  box.showModal()
}

// Envia um e-mail de teste e mostra a resposta exata da Brevo.
function emailTester() {
  const wrap = el('details', 'support-folder')
  const summary = el('summary')
  summary.append(el('span', '', 'Testar envio de e-mail'))
  const form = el('form', 'admin-email-test')
  const input = el('input')
  Object.assign(input, { type: 'email', required: true, placeholder: 'seu-email@exemplo.com' })
  const send = el('button', 'button button--primary', 'Enviar teste')
  send.type = 'submit'
  const result = el('p', 'admin-billing-note')
  form.append(input, send)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    send.disabled = true
    result.textContent = 'Enviando…'
    try {
      const data = await api('/admin/email-test', { method: 'POST', body: JSON.stringify({ to: input.value }) })
      result.textContent = data.ok
        ? `✅ A Brevo aceitou (código ${data.status}), remetente ${data.from}. Se não chegar em 2 minutos, veja o spam e os Logs da Brevo. Resposta: ${data.detail}`
        : data.configured
          ? `❌ A Brevo recusou (código ${data.status}). Motivo: ${data.detail}`
          : `❌ ${data.detail}`
    } catch (error) {
      result.textContent = error.message
    } finally {
      send.disabled = false
    }
  })
  wrap.append(summary, form, result)
  return wrap
}
function initAuditFilters() {
  const chips = $('[data-audit-type]')
  chips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-type]')
    if (!chip) return
    chips.dataset.value = chip.dataset.type
    chips.querySelectorAll('[data-type]').forEach((node) => node.classList.toggle('is-active', node === chip))
    paintAudit()
  })
  $('[data-audit-search]').addEventListener('input', paintAudit)
  $('[data-audit-period]').addEventListener('change', paintAudit)
  $('[data-audit-clear]').addEventListener('click', () => {
    $('[data-audit-search]').value = ''
    $('[data-audit-period]').value = 'all'
    chips.querySelector('[data-type="all"]').click()
  })
}

function showTab(name) {
  document.querySelectorAll('[data-admin-tab]').forEach((tab) => {
    const active = tab.dataset.adminTab === name
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-selected', String(active))
  })
  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.hidden = section.dataset.adminSection !== name
  })
  if (name === 'suporte') void loadTickets()
  if (name === 'registro') void renderAudit()
  if (name === 'planos') void renderPlans()
  if (name === 'faturamento') void renderBilling()
  if (name === 'biblioteca') void renderLibrary()
}

// Biblioteca FARISA: o admin abre a biblioteca no painel (mesmas ferramentas
// da biblioteca do personal: arrastar pastas de GIF/MP4, conferir, editar).
async function renderLibrary() {
  const root = $('[data-admin-library]')
  if (!root) return
  const info = (await api('/admin/library').catch(() => null)) || {}
  const stats = el('div', 'admin-library-stats')
  ;[
    ['Exercícios', info.exercises],
    ['Pastas', info.folders],
    ['Com GIF', info.gifs],
    ['Com vídeo', info.videos],
  ].forEach(([label, value]) => {
    const card = el('article', 'panel admin-library-stat')
    card.append(el('strong', '', String(value ?? 0)), el('span', '', label))
    stats.append(card)
  })
  const how = el('article', 'panel admin-library-how')
  how.append(
    el('h2', '', 'Como abastecer'),
    el('p', '', 'Clique em “Abrir a Biblioteca FARISA”. Ela abre numa nova aba, no mesmo painel do personal, já na Biblioteca de exercícios.'),
    el('p', '', 'Arraste as pastas de GIF e MP4 (Peitoral, Costas, Ombros…), confira a lista e salve. Você também pode editar nome, grupo, equipamento e instruções de cada exercício.'),
    el('p', 'admin-muted', 'Tudo o que estiver nesta biblioteca será mostrado para todos os personais, que poderão usar nas fichas sem poder apagar ou alterar. O acesso fica no Registro de ações.'),
  )
  const open = el('button', 'button button--primary', 'Abrir a Biblioteca FARISA')
  open.type = 'button'
  open.addEventListener('click', async () => {
    open.disabled = true
    const tab = window.open('about:blank', '_blank')
    try {
      const result = await api('/admin/library/open', { method: 'POST', body: '{}' })
      const url = `/personal/#suporte-acesso?token=${encodeURIComponent(result.token)}&nome=${encodeURIComponent(result.name)}&biblioteca=1`
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (error) {
      tab?.close()
      root.querySelector('[data-library-error]')?.remove()
      const line = el('p', 'admin-alert', error.message)
      line.dataset.libraryError = ''
      how.append(line)
    } finally {
      open.disabled = false
    }
  })
  how.append(open)
  const parts = [stats]
  // GIFs/MP4 enviados soltos (abas GIFs e Vídeos) ainda não são exercícios:
  // os personais só veem exercícios.
  const loose = Number(info.looseGifs || 0) + Number(info.looseVideos || 0)
  if (loose) {
    const alert = el('article', 'panel admin-library-how admin-library-loose')
    alert.append(
      el('h2', '', `⚠️ ${loose} arquivo(s) ainda não aparecem para os personais`),
      el(
        'p',
        '',
        `${info.looseGifs || 0} GIF(s) e ${info.looseVideos || 0} vídeo(s) foram enviados soltos (nas abas GIFs/Vídeos) e ainda não viraram exercícios. Os personais só veem exercícios.`,
      ),
    )
    const sync = el('button', 'button button--primary', 'Transformar em exercícios')
    sync.type = 'button'
    sync.addEventListener('click', async () => {
      sync.disabled = true
      sync.textContent = 'Criando exercícios…'
      try {
        const result = await api('/admin/library/sync', { method: 'POST', body: '{}' })
        alert.replaceChildren(el('h2', '', `✅ ${result.created} exercício(s) criados. Já aparecem para os personais.`))
        window.setTimeout(() => void renderLibrary(), 1500)
      } catch (error) {
        sync.disabled = false
        sync.textContent = 'Transformar em exercícios'
        alert.append(el('p', 'admin-alert', error.message))
      }
    })
    alert.append(
      el('p', 'admin-muted', 'Cada arquivo vira um exercício com o nome do arquivo e a pasta dele. Depois você pode editar nome, equipamento e instruções na Biblioteca FARISA.'),
      sync,
    )
    parts.push(alert)
  }
  parts.push(how)
  root.replaceChildren(...parts)
}

// Telas da entrada: login, "esqueci a senha" e "nova senha" (link do e-mail).
function showScreen(name) {
  document.querySelectorAll('[data-admin-screen]').forEach((screen) => {
    screen.hidden = screen.dataset.adminScreen !== name
  })
}

// Entrada da administração: /admin/#acesso-farisa
const LOGIN_HASH = '#acesso-farisa'
function showLogin(message = '') {
  $('[data-admin-shell]').hidden = true
  $('[data-admin-login]').hidden = false
  showScreen('login')
  if (location.hash !== LOGIN_HASH)
    history.replaceState(null, '', location.pathname + LOGIN_HASH)
  $('[data-admin-login-status]').textContent = message
}

const resetToken = () =>
  location.hash.startsWith('#nova-senha')
    ? new URLSearchParams(location.hash.split('?')[1] || '').get('token')
    : null

async function showPanel() {
  const me = await api('/admin/me')
  $('[data-admin-user]').textContent = me?.name || me?.email || ''
  $('[data-admin-login]').hidden = true
  $('[data-admin-shell]').hidden = false
  if (location.hash) history.replaceState(null, '', location.pathname)
  await reload()
}

function init() {
  initAuditFilters()
  $('[data-admin-folder]').addEventListener('click', () => {
    folderOpen = !folderOpen
    render()
  })
  $('[data-admin-search]').addEventListener('input', render)
  $('[data-admin-filter]').addEventListener('change', render)
  $('[data-admin-new-trainer]').addEventListener('click', () => openTrainerForm())
  $('[data-admin-save-plans]').addEventListener('click', savePlans)
  document.querySelectorAll('[data-admin-tab]').forEach((tab) =>
    tab.addEventListener('click', () => showTab(tab.dataset.adminTab)),
  )
  // Fecha o menu "Ações" ao clicar fora, rolar ou redimensionar.
  const closeMenus = (event) => {
    document.querySelectorAll('.admin-menu[open]').forEach((menu) => {
      // Rolagem logo após abrir (o navegador ajeitando a tela) não fecha.
      if (!event?.target && Date.now() - Number(menu.dataset.openedAt || 0) < 400) return
      if (!event?.target || !menu.contains(event.target)) menu.open = false
    })
  }
  document.addEventListener('click', closeMenus)
  window.addEventListener('scroll', () => closeMenus(), true)
  window.addEventListener('resize', () => closeMenus())
  window.setInterval(() => {
    if (getToken() && !document.hidden && !document.querySelector('dialog[open]')) void loadTickets()
  }, 60_000)
  $('[data-admin-logout]').addEventListener('click', () => {
    // Encerra a sessão também no servidor.
    if (getToken()) void api('/admin/auth/logout', { method: 'POST', body: '{}' }).catch(() => {})
    setToken(null)
    showLogin('Você saiu da área do administrador.')
  })
  const form = $('[data-admin-login-form]')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const status = $('[data-admin-login-status]')
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    status.textContent = 'Entrando…'
    try {
      const result = await api('/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      })
      // Segunda etapa: o servidor enviou um código para o e-mail.
      if (result.needCode) {
        const code = form.querySelector('[data-admin-code]')
        code.hidden = false
        code.querySelector('input').required = true
        code.querySelector('input').focus()
        button.textContent = 'Confirmar código'
        status.textContent = result.message
        return
      }
      setToken(result.token)
      form.reset()
      form.querySelector('[data-admin-code]').hidden = true
      form.querySelector('[data-admin-code] input').required = false
      button.textContent = 'Entrar'
      status.textContent = ''
      await showPanel()
    } catch (error) {
      status.textContent = error.message
      // Código errado ou vencido: volta à primeira etapa para pedir outro.
      const code = form.querySelector('[data-admin-code]')
      if (!code.hidden) {
        code.hidden = true
        code.querySelector('input').required = false
        code.querySelector('input').value = ''
        button.textContent = 'Entrar'
      }
    } finally {
      button.disabled = false
    }
  })
  document.querySelectorAll('[data-admin-go]').forEach((button) =>
    button.addEventListener('click', () => {
      if (button.dataset.adminGo === 'login')
        history.replaceState(null, '', location.pathname + LOGIN_HASH)
      showScreen(button.dataset.adminGo)
      document.querySelectorAll('[data-admin-login] [role="status"]').forEach((node) => {
        node.textContent = ''
      })
    }),
  )

  const forgot = $('[data-admin-forgot-form]')
  forgot.addEventListener('submit', async (event) => {
    event.preventDefault()
    const status = $('[data-admin-forgot-status]')
    const button = forgot.querySelector('[type="submit"]')
    button.disabled = true
    status.textContent = 'Enviando…'
    try {
      const result = await api('/admin/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: forgot.elements.email.value.trim() }),
      })
      status.textContent = result?.message || 'Pedido enviado.'
      // No computador, sem e-mail configurado, o servidor devolve o link direto.
      if (result?.resetUrl) {
        const open = el('a', 'button button--secondary', 'Abrir link de recuperação')
        open.href = result.resetUrl
        status.append(document.createElement('br'), open)
      }
      forgot.reset()
    } catch (error) {
      status.textContent = error.message
    } finally {
      button.disabled = false
    }
  })

  const reset = $('[data-admin-reset-form]')
  reset.addEventListener('submit', async (event) => {
    event.preventDefault()
    const status = $('[data-admin-reset-status]')
    const { password, confirm } = reset.elements
    if (password.value !== confirm.value) {
      status.textContent = 'As duas senhas não são iguais.'
      return
    }
    const button = reset.querySelector('[type="submit"]')
    button.disabled = true
    status.textContent = 'Salvando…'
    try {
      const result = await api('/admin/auth/reset', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken(), password: password.value }),
      })
      setToken(result.token)
      reset.reset()
      history.replaceState(null, '', location.pathname)
      await showPanel()
    } catch (error) {
      status.textContent = error.message
    } finally {
      button.disabled = false
    }
  })

  const openFromHash = () => {
    if (!resetToken()) return false
    setToken(null)
    $('[data-admin-shell]').hidden = true
    $('[data-admin-login]').hidden = false
    showScreen('nova-senha')
    return true
  }
  window.addEventListener('hashchange', openFromHash)
  if (openFromHash()) return
  if (getToken()) showPanel().catch(() => showLogin())
  else showLogin()
}

// App instalável "FARISA Admin" (ícone e cor próprios, separado do site e do
// FARISA Painel).
function initInstall() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {})
  })
  const buttons = [...document.querySelectorAll('[data-admin-install]')]
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  const show = (visible) =>
    buttons.forEach((button) => {
      button.hidden = !visible
    })
  if (standalone) {
    show(false)
    return
  }
  const isIos = /iPad|iPhone|iPod/u.test(navigator.userAgent)
  let prompt = null
  if (isIos) show(true)
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    prompt = event
    show(true)
  })
  window.addEventListener('appinstalled', () => {
    prompt = null
    show(false)
  })
  buttons.forEach((button) =>
    button.addEventListener('click', async () => {
      if (prompt) {
        const current = prompt
        prompt = null
        current.prompt()
        const choice = await current.userChoice.catch(() => null)
        if (choice?.outcome === 'accepted') show(false)
        return
      }
      const { box, form } = dialog({
        title: 'Instalar o painel',
        body: [
          el(
            'p',
            '',
            isIos
              ? 'No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.'
              : 'Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.',
          ),
        ],
        confirmLabel: 'Entendi',
        cancelLabel: '',
      })
      form.addEventListener('submit', () => box.close())
      box.showModal()
    }),
  )
}

initPasswordControls()
initInstall()
init()
