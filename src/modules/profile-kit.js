// Peças compartilhadas entre o painel do personal e a área do aluno:
// foto de perfil, central de notificações e pequenas contas de data.
import { initials } from './utils.js'

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000

export function parseDate(value) {
  if (!value) return null
  // "2026-10-01" sozinho vira meia-noite local (e não UTC, que no Brasil
  // cairia no dia anterior).
  const text = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(text)
    ? new Date(`${text}T00:00:00`)
    : new Date(text.includes('T') || text.includes('Z') ? text : `${text.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

// Dias inteiros entre hoje e a data (negativo = já passou).
export function daysUntil(date, now = new Date()) {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY)
}

export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime()

export const shortDate = (date) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)

export const timeOf = (date) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)

export const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

/* ------------------------------------------------------------------ */
/* Foto de perfil                                                      */
/* ------------------------------------------------------------------ */

// Recorta a foto no centro, em quadrado, e reduz para 256 px em JPEG. Fica
// com uns 20–40 KB, pequena o bastante para ir junto com os dados da conta.
export async function imageFileToAvatar(file, size = 256) {
  if (!file || !/^image\//u.test(file.type || ''))
    throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).')
  if (file.size > 15 * 1024 * 1024) throw new Error('A foto pode ter no máximo 15 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size, size)
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    )
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    throw new Error('Não consegui abrir essa imagem. Tente outra foto.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Mostra a foto dentro do elemento (ou as iniciais, se não houver foto).
export function paintAvatar(element, { name, avatar }) {
  if (!element) return
  element.replaceChildren()
  element.classList.toggle('has-photo', Boolean(avatar))
  if (avatar) {
    const image = document.createElement('img')
    image.src = avatar
    image.alt = ''
    element.append(image)
  } else element.textContent = initials(name || '?')
}

// Campo de foto usado nos dois formulários de perfil. Devolve um objeto que
// sabe dizer qual foto salvar: undefined = não mexeu, null = removeu.
export function avatarField(container, { name, avatar }) {
  let current = avatar || null
  let changed = false
  container.classList.add('avatar-field')
  container.innerHTML = `<span class="avatar avatar--xl" data-avatar-preview></span>
    <div class="avatar-field-actions">
      <label class="button button--secondary">Escolher foto<input type="file" accept="image/*" hidden data-avatar-input></label>
      <button class="button button--secondary" type="button" data-avatar-remove>Remover foto</button>
      <small data-avatar-status>JPG, PNG ou WebP. A foto é recortada em quadrado.</small>
    </div>`
  const preview = container.querySelector('[data-avatar-preview]')
  const remove = container.querySelector('[data-avatar-remove]')
  const status = container.querySelector('[data-avatar-status]')
  const paint = () => {
    paintAvatar(preview, { name, avatar: current })
    remove.hidden = !current
  }
  container.querySelector('[data-avatar-input]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    status.textContent = 'Preparando a foto…'
    try {
      current = await imageFileToAvatar(file)
      changed = true
      status.textContent = 'Foto pronta. Clique em Salvar para guardar.'
    } catch (error) {
      status.textContent = error.message
    }
    paint()
  })
  remove.addEventListener('click', () => {
    current = null
    changed = true
    status.textContent = 'A foto será removida quando você salvar.'
    paint()
  })
  paint()
  return {
    value: () => (changed ? current : undefined),
    setName: (value) => {
      name = value
      paint()
    },
  }
}

/* ------------------------------------------------------------------ */
/* Central de notificações                                             */
/* ------------------------------------------------------------------ */
// Cada notificação: { id, tone: 'info'|'warn'|'danger'|'success', icon,
// title, detail, href?, onClick? }. O id muda quando o assunto muda (ex.:
// "vence em 7 dias" → "vence amanhã"), e aí ela volta a contar como nova.
// O que já foi visto fica guardado só neste navegador.

function readSeen(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'))
  } catch {
    return new Set()
  }
}
function writeSeen(key, ids) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids].slice(-300)))
  } catch {
    /* navegador sem armazenamento: as notificações só não ficam marcadas */
  }
}

export function createNotificationCenter({ button, storageKey, title = 'Notificações' }) {
  let items = []
  let seen = readSeen(storageKey)
  const dot = button.querySelector('span') || button.appendChild(document.createElement('span'))
  dot.classList.add('notification-count')
  button.setAttribute('aria-haspopup', 'dialog')
  button.setAttribute('aria-expanded', 'false')

  const panel = document.createElement('section')
  panel.className = 'notification-panel'
  panel.hidden = true
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', title)
  panel.innerHTML = `<header><strong>${title}</strong><button type="button" class="notification-mark" data-mark-all>Marcar todas como lidas</button></header><ol data-list></ol>`
  document.body.append(panel)
  const list = panel.querySelector('[data-list]')

  const unread = () => items.filter((item) => !seen.has(item.id))

  function paintBadge() {
    const count = unread().length
    dot.hidden = count === 0
    dot.textContent = count > 9 ? '9+' : String(count || '')
    button.setAttribute('aria-label', count ? `${title}: ${count} nova(s)` : title)
  }

  function paintList() {
    if (!items.length) {
      const empty = document.createElement('li')
      empty.className = 'notification-empty'
      empty.textContent = 'Tudo em dia. Nenhuma notificação agora.'
      list.replaceChildren(empty)
      return
    }
    list.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement('li')
        li.className = `notification-item notification-item--${item.tone || 'info'}`
        if (!seen.has(item.id)) li.classList.add('is-unread')
        const link = document.createElement(item.href || item.onClick ? 'a' : 'div')
        if (item.href) link.href = item.href
        if (item.onClick) {
          if (!item.href) link.href = '#'
          link.addEventListener('click', (event) => {
            if (!item.href) event.preventDefault()
            item.onClick()
          })
        }
        if (item.href || item.onClick) link.addEventListener('click', close)
        const icon = document.createElement('span')
        icon.className = 'notification-icon'
        icon.textContent = item.icon || '•'
        const body = document.createElement('span')
        body.className = 'notification-body'
        const strong = document.createElement('strong')
        strong.textContent = item.title
        body.append(strong)
        if (item.detail) {
          const small = document.createElement('small')
          small.textContent = item.detail
          body.append(small)
        }
        link.append(icon, body)
        li.append(link)
        return li
      }),
    )
  }

  function place() {
    const rect = button.getBoundingClientRect()
    const width = Math.min(380, window.innerWidth - 16)
    panel.style.width = `${width}px`
    panel.style.top = `${rect.bottom + 8}px`
    panel.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`
  }

  function markAllSeen() {
    items.forEach((item) => seen.add(item.id))
    writeSeen(storageKey, seen)
    paintBadge()
  }

  function open() {
    paintList()
    place()
    panel.hidden = false
    button.setAttribute('aria-expanded', 'true')
    // Abriu = viu. A lista continua destacando as novas até fechar.
    markAllSeen()
  }
  function close() {
    if (panel.hidden) return
    panel.hidden = true
    button.setAttribute('aria-expanded', 'false')
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation()
    if (panel.hidden) open()
    else close()
  })
  panel.querySelector('[data-mark-all]').addEventListener('click', () => {
    markAllSeen()
    paintList()
  })
  document.addEventListener('click', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })
  window.addEventListener('resize', () => !panel.hidden && place())
  window.addEventListener('hashchange', close)

  return {
    update(next) {
      items = next
      // Esquece ids antigos que não existem mais, para não crescer à toa.
      const alive = new Set(items.map((item) => item.id))
      if ([...seen].some((id) => !alive.has(id)) && seen.size > 200) {
        seen = new Set([...seen].filter((id) => alive.has(id)))
        writeSeen(storageKey, seen)
      }
      paintBadge()
      if (!panel.hidden) paintList()
    },
    close,
  }
}
