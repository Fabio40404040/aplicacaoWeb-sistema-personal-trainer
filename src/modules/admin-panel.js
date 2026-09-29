// Painel do administrador da plataforma (o dono do SaaS).
// O item "Administração" só aparece no menu quando o servidor confirma que a
// conta logada é de administrador (GET /api/admin/trainers responde 200).
import { fetchAdminTrainers } from './api-client.js'
import { paintAvatar } from './profile-kit.js'

let trainers = []
let loading = false

const dateTime = (value) => {
  if (!value) return null
  const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'))
  return Number.isNaN(date.getTime()) ? null : date
}
const formatDay = (value) =>
  dateTime(value)?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) ||
  '—'
function formatLastLogin(value) {
  const date = dateTime(value)
  if (!date) return 'Ainda não registrado'
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Ontem'
  if (days < 30) return `Há ${days} dias`
  return formatDay(value)
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function createNavLink() {
  if (document.querySelector('[data-route-link="admin"]')) return
  const nav = document.querySelector('[data-route-link="evolucao"]')?.parentElement
  if (!nav) return
  const link = el('a', 'nav-link nav-link--admin')
  link.href = '#admin'
  link.dataset.routeLink = 'admin'
  link.dataset.adminLink = ''
  link.hidden = true
  link.innerHTML = '<svg><use href="#icon-lock"></use></svg><span>Administração</span>'
  nav.append(link)
}

function createPage() {
  if (document.querySelector('[data-route="admin"]')) return
  const main = document.querySelector('.main-content')
  if (!main) return
  const page = el('section', 'page')
  page.dataset.route = 'admin'
  page.innerHTML = `
    <div class="page-heading">
      <div>
        <span class="eyebrow eyebrow--blue">Plataforma FARISA</span>
        <h1>Administração</h1>
        <p>Personal trainers cadastrados na plataforma e o uso de cada um.</p>
      </div>
    </div>
    <div class="stats-grid admin-stats">
      <article class="stat-card"><div class="stat-icon stat-icon--blue"><svg><use href="#icon-lock"></use></svg></div>
        <div><span>Personais</span><strong data-admin-stat="trainers">—</strong><small class="trend">Contas cadastradas</small></div></article>
      <article class="stat-card"><div class="stat-icon stat-icon--cyan"><svg><use href="#icon-users"></use></svg></div>
        <div><span>Alunos</span><strong data-admin-stat="students">—</strong><small class="trend">Somando todos os personais</small></div></article>
      <article class="stat-card"><div class="stat-icon stat-icon--green"><svg><use href="#icon-check"></use></svg></div>
        <div><span>Alunos com acesso</span><strong data-admin-stat="active">—</strong><small class="trend">Liberados agora</small></div></article>
      <article class="stat-card"><div class="stat-icon stat-icon--violet"><svg><use href="#icon-activity"></use></svg></div>
        <div><span>Ativos em 30 dias</span><strong data-admin-stat="recent">—</strong><small class="trend">Personais que entraram</small></div></article>
    </div>
    <article class="panel content-panel">
      <div class="toolbar">
        <label class="search-box"><svg><use href="#icon-search"></use></svg><input type="search" placeholder="Buscar personal por nome ou e-mail" data-admin-search /></label>
      </div>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr><th>Personal</th><th>Alunos</th><th>Fichas</th><th>Cadastro</th><th>Último acesso</th></tr></thead>
          <tbody data-admin-trainers></tbody>
        </table>
      </div>
      <div class="empty-state" data-admin-empty hidden>
        <svg><use href="#icon-users"></use></svg>
        <h3>Nenhum personal encontrado</h3>
        <p data-admin-empty-text>Tente outro termo de busca.</p>
      </div>
    </article>`
  main.append(page)
  page.querySelector('[data-admin-search]').addEventListener('input', render)
}

function render() {
  const body = document.querySelector('[data-admin-trainers]')
  if (!body) return
  const recentLimit = Date.now() - 30 * 86_400_000
  const stat = (key, value) => {
    const node = document.querySelector(`[data-admin-stat="${key}"]`)
    if (node) node.textContent = String(value)
  }
  stat('trainers', trainers.length)
  stat('students', trainers.reduce((sum, item) => sum + item.students, 0))
  stat('active', trainers.reduce((sum, item) => sum + item.activeStudents, 0))
  stat(
    'recent',
    trainers.filter((item) => (dateTime(item.lastLoginAt)?.getTime() || 0) >= recentLimit).length,
  )

  const query = (document.querySelector('[data-admin-search]')?.value || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
  const list = trainers.filter((item) =>
    `${item.name} ${item.email}`.toLocaleLowerCase('pt-BR').includes(query),
  )
  body.replaceChildren(
    ...list.map((trainer) => {
      const row = document.createElement('tr')
      const person = el('td')
      const cell = el('div', 'person-cell')
      const avatar = el('span', 'avatar')
      paintAvatar(avatar, trainer)
      const info = el('div')
      const name = el('strong', '', trainer.name)
      if (trainer.isOwner) name.append(' ', el('span', 'admin-badge', 'Dono do site'))
      info.append(name, el('small', '', trainer.email))
      cell.append(avatar, info)
      person.append(cell)

      const students = el('td')
      students.append(el('strong', '', String(trainer.students)))
      const limit = trainer.studentLimit ? ` de ${trainer.studentLimit}` : ''
      students.append(el('small', 'admin-muted', `${trainer.activeStudents} com acesso${limit ? ` · limite${limit}` : ''}`))

      row.append(
        person,
        students,
        el('td', '', String(trainer.workouts)),
        el('td', '', formatDay(trainer.createdAt)),
        el('td', '', formatLastLogin(trainer.lastLoginAt)),
      )
      return row
    }),
  )
  const empty = document.querySelector('[data-admin-empty]')
  if (empty) empty.hidden = list.length > 0
}

async function refresh() {
  if (loading) return
  loading = true
  const link = document.querySelector('[data-admin-link]')
  try {
    trainers = await fetchAdminTrainers()
    if (link) link.hidden = false
    render()
  } catch {
    // Não é administrador (403) ou está sem sessão: o item some do menu.
    trainers = []
    if (link) link.hidden = true
    if (location.hash === '#admin') location.hash = '#painel'
  } finally {
    loading = false
  }
}

export function initAdminPanel() {
  createNavLink()
  createPage()
  window.addEventListener('farisa:data-changed', refresh)
  window.addEventListener('hashchange', () => {
    if (location.hash === '#admin') refresh()
  })
  window.addEventListener('farisa:session-expired', () => {
    const link = document.querySelector('[data-admin-link]')
    if (link) link.hidden = true
  })
}
