// Área do administrador da plataforma (/admin). Página separada do site:
// login próprio (conta de administrador, não de personal) e código que só é
// baixado por quem abre /admin.
import './admin.css'
import { paintAvatar } from '../modules/profile-kit.js'
import { initPasswordControls } from '../modules/password-controls.js'

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
const PLAN_NAMES = { trial: 'Teste grátis', start: 'Start', pro: 'Pro', elite: 'Elite' }
let tickets = []
let openTicket = null

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
      if (trainer.openTickets)
        status.append(el('small', 'admin-alert', `${trainer.openTickets} chamado(s) aberto(s)`))
      const students = el('td')
      students.append(el('strong', '', String(trainer.students)))
      const limit = trainer.studentLimit ? ` · limite ${trainer.studentLimit}` : ''
      students.append(el('small', 'admin-muted', `${trainer.activeStudents} com acesso${limit}`))
      if (trainer.revenue30Cents)
        students.append(el('small', 'admin-muted', `${money(trainer.revenue30Cents)} em 30 dias`))
      const actions = el('td', 'admin-actions')
      const menu = el('details', 'admin-menu')
      const summary = el('summary', 'button button--secondary', 'Ações ▾')
      const items = el('div', 'admin-menu-list')
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
      action('Definir plano / vencimento', setPlan)
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
  $('[data-admin-empty]').hidden = list.length > 0
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
  close.type = 'submit'
  close.value = 'cancel'
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
    cancel.type = 'submit'
    cancel.value = 'cancel'
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
  const grid2 = el('div', 'field-grid')
  grid2.append(
    field('Plano na plataforma', 'planName', { value: trainer?.planName || 'Plano profissional' }),
    field('Limite de alunos', 'studentLimit', { type: 'number', value: trainer?.studentLimit || 60 }),
  )
  body.push(grid, grid2)
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
    const option = el('option', '', `${plan.name}${plan.studentLimit ? ` · até ${plan.studentLimit} alunos` : ''}`)
    option.value = plan.code
    select.append(option)
  })
  select.value = trainer.saasPlan || 'trial'
  const planField = el('label', 'field')
  planField.append(el('span', '', 'Plano'), select)
  const expires = trainer.saasExpiresAt ? toDate(trainer.saasExpiresAt) : null
  const dateValue = expires
    ? `${expires.getFullYear()}-${String(expires.getMonth() + 1).padStart(2, '0')}-${String(expires.getDate()).padStart(2, '0')}`
    : ''
  const { box, form, status, ok } = dialog({
    title: `Plano de ${trainer.name}`,
    body: [
      el('p', '', 'Use para dar cortesia, estender o teste ou corrigir um pagamento feito fora do sistema.'),
      planField,
      field('Válido até (vazio = sem vencimento)', 'expiresAt', { type: 'date', value: dateValue }),
    ],
    confirmLabel: 'Salvar plano',
  })
  run(form, ok, status, async (values) => {
    await api(`/admin/trainers/${trainer.id}/plan`, { method: 'POST', body: JSON.stringify(values) })
    box.close()
    await reload()
  })
  box.showModal()
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
      if (plan.isTrial) price.append(el('small', 'admin-muted', 'Grátis (14 dias)'))
      else price.append(input('price', (plan.priceCents / 100).toFixed(2), 'number'))
      const limit = el('td')
      limit.append(input('studentLimit', plan.studentLimit, 'number'))
      const desc = el('td')
      desc.append(input('description', plan.description))
      const active = el('td')
      const box = input('active', '', 'checkbox')
      box.checked = plan.active
      active.append(box)
      tr.append(name, price, limit, desc, active)
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
    description: tr.querySelector('[name="description"]').value,
    active: tr.querySelector('[name="active"]').checked,
  }))
  status.textContent = 'Salvando…'
  try {
    await api('/admin/saas-plans', { method: 'PUT', body: JSON.stringify({ plans }) })
    status.textContent = 'Planos salvos. Os novos valores já aparecem para os personais.'
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
  if (!tickets.length) list.append(el('p', 'support-muted', 'Nenhum chamado ainda.'))
  tickets.forEach((ticket) => {
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
    list.append(item)
  })
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
  trainer_plan_set: 'Plano definido',
  saas_plans_updated: 'Planos editados',
  support_replied: 'Resposta de suporte',
  support_closed: 'Chamado encerrado',
  support_open: 'Chamado reaberto',
}
async function renderAudit() {
  const rows = (await api('/admin/audit').catch(() => [])) || []
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
          const td = el('td', 'admin-muted', 'Nenhuma ação registrada ainda.')
          td.colSpan = 5
          tr.append(td)
          return tr
        })()]),
  )
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
  $('[data-admin-search]').addEventListener('input', render)
  $('[data-admin-filter]').addEventListener('change', render)
  $('[data-admin-new-trainer]').addEventListener('click', () => openTrainerForm())
  $('[data-admin-save-plans]').addEventListener('click', savePlans)
  document.querySelectorAll('[data-admin-tab]').forEach((tab) =>
    tab.addEventListener('click', () => showTab(tab.dataset.adminTab)),
  )
  window.setInterval(() => {
    if (getToken() && !document.hidden && !document.querySelector('dialog[open]')) void loadTickets()
  }, 60_000)
  $('[data-admin-logout]').addEventListener('click', () => {
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
      setToken(result.token)
      form.reset()
      status.textContent = ''
      await showPanel()
    } catch (error) {
      status.textContent = error.message
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
      window.alert(
        isIos
          ? 'No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.'
          : 'Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.',
      )
    }),
  )
}

initPasswordControls()
initInstall()
init()
