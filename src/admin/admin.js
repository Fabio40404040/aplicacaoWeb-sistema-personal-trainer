// Área do administrador da plataforma (/admin). Página separada do site:
// login próprio (conta de administrador, não de personal) e código que só é
// baixado por quem abre /admin.
import './admin.css'
import { paintAvatar } from '../modules/profile-kit.js'

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

function render() {
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
    trainers.filter((item) => (toDate(item.lastLoginAt)?.getTime() || 0) >= recentLimit).length,
  )
  const query = ($('[data-admin-search]').value || '').trim().toLocaleLowerCase('pt-BR')
  const list = trainers.filter((item) =>
    `${item.name} ${item.email}`.toLocaleLowerCase('pt-BR').includes(query),
  )
  $('[data-admin-trainers]').replaceChildren(
    ...list.map((trainer) => {
      const row = document.createElement('tr')
      const person = el('td')
      const cell = el('div', 'person-cell')
      const avatar = el('span', 'avatar')
      paintAvatar(avatar, trainer)
      const info = el('div')
      const name = el('strong', '', trainer.name)
      if (trainer.isOwner) name.append(' ', el('span', 'admin-badge', 'Primeiro personal'))
      info.append(name, el('small', '', trainer.email))
      cell.append(avatar, info)
      person.append(cell)
      const students = el('td')
      students.append(el('strong', '', String(trainer.students)))
      const limit = trainer.studentLimit ? ` · limite de ${trainer.studentLimit}` : ''
      students.append(el('small', 'admin-muted', `${trainer.activeStudents} com acesso${limit}`))
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
  $('[data-admin-empty]').hidden = list.length > 0
}

function showLogin(message = '') {
  $('[data-admin-shell]').hidden = true
  $('[data-admin-login]').hidden = false
  $('[data-admin-login-status]').textContent = message
}

async function showPanel() {
  const me = await api('/admin/me')
  $('[data-admin-user]').textContent = me?.name || me?.email || ''
  $('[data-admin-login]').hidden = true
  $('[data-admin-shell]').hidden = false
  trainers = (await api('/admin/trainers')) || []
  render()
}

function init() {
  $('[data-admin-search]').addEventListener('input', render)
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
  if (getToken()) showPanel().catch(() => showLogin())
  else showLogin()
}

init()
