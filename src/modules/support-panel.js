// Painel do personal → "Falar com o suporte": chamados com o dono da
// plataforma (FARISA). Também mostra a faixa "Modo suporte" quando o dono
// abriu este painel pelo FARISA Admin.
import {
  createSupportTicket,
  fetchSupportTicket,
  fetchSupportTickets,
  replySupportTicket,
} from './api-client.js'
import { showToast } from './utils.js'

const CATEGORIES = {
  duvida: 'Dúvida',
  problema: 'Problema / erro',
  pagamento: 'Pagamentos',
  conta: 'Minha conta',
  sugestao: 'Sugestão',
}
const STATUS = { open: 'Aguardando suporte', answered: 'Respondido', closed: 'Encerrado' }
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}
const when = (value) => {
  const raw = String(value || '')
  const date = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const GROUPS = [
  { key: 'answered', label: 'Respondidos pelo suporte', statuses: ['answered'], open: true },
  { key: 'open', label: 'Aguardando o suporte', statuses: ['open'], open: true },
  { key: 'closed', label: 'Encerrados', statuses: ['closed'], open: false },
]
const groupOpen = {}
let tickets = []
let openId = null
let creating = false

function paintBadge() {
  const badge = document.querySelector('[data-support-count]')
  if (!badge) return
  const unread = tickets.filter((ticket) => ticket.unread).length
  badge.hidden = !unread
  badge.textContent = String(unread)
  badge.title = `${unread} resposta(s) nova(s) do suporte`
}

async function load() {
  if (!sessionStorage.getItem('farisa-coach-api-token')) return
  try {
    tickets = await fetchSupportTickets()
  } catch {
    tickets = []
  }
  paintBadge()
  if (location.hash === '#suporte') render()
}

function newTicketForm() {
  const form = el('form', 'panel support-form')
  form.innerHTML = `<h2>Novo chamado</h2>
    <div class="field-grid">
      <label class="field"><span>Assunto</span><input name="subject" required minlength="3" maxlength="120" placeholder="Ex.: Aluno não recebe o e-mail de senha"></label>
      <label class="field"><span>Tipo</span><select name="category">${Object.entries(CATEGORIES)
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join('')}</select></label>
    </div>
    <label class="field"><span>Mensagem</span><textarea name="message" rows="5" required minlength="5" maxlength="5000"
      placeholder="Conte o que aconteceu, em qual tela e, se for o caso, o nome do aluno."></textarea></label>
    <p role="status"></p>
    <div class="support-actions"><button class="button button--secondary" type="button" data-cancel>Cancelar</button>
      <button class="button button--primary" type="submit">Enviar ao suporte</button></div>`
  form.querySelector('[data-cancel]').addEventListener('click', () => {
    creating = false
    render()
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    try {
      const created = await createSupportTicket(Object.fromEntries(new FormData(form)))
      creating = false
      openId = created.id
      showToast('Chamado enviado. Você será avisado quando respondermos.')
      await load()
      render()
    } catch (error) {
      form.querySelector('[role="status"]').textContent = error.message
      button.disabled = false
    }
  })
  return form
}

async function conversation(id) {
  const box = el('section', 'panel support-thread')
  box.append(el('p', 'support-muted', 'Carregando conversa…'))
  try {
    const ticket = await fetchSupportTicket(id)
    const head = el('header', 'support-thread-head')
    const title = el('div')
    title.append(
      el('strong', '', ticket.subject),
      el('small', '', `${CATEGORIES[ticket.category] || ticket.category} · aberto em ${when(ticket.createdAt)}`),
    )
    head.append(title, el('span', `support-status support-status--${ticket.status}`, STATUS[ticket.status]))
    const list = el('div', 'support-messages')
    ticket.messages.forEach((message) => {
      const bubble = el('div', `support-bubble support-bubble--${message.author}`)
      bubble.append(
        el('small', '', `${message.author === 'admin' ? 'Suporte FARISA' : 'Você'} · ${when(message.createdAt)}`),
        el('p', '', message.body),
      )
      list.append(bubble)
    })
    const reply = el('form', 'support-reply')
    reply.innerHTML = `<label class="field"><span>${ticket.status === 'closed' ? 'Reabrir com uma nova mensagem' : 'Responder'}</span>
      <textarea name="body" rows="3" required maxlength="5000"></textarea></label>
      <div class="support-actions"><button class="button button--primary" type="submit">Enviar</button></div>`
    reply.addEventListener('submit', async (event) => {
      event.preventDefault()
      const button = reply.querySelector('[type="submit"]')
      button.disabled = true
      try {
        await replySupportTicket(id, reply.elements.body.value)
        await load()
        render()
      } catch (error) {
        showToast(error.message)
        button.disabled = false
      }
    })
    box.replaceChildren(head, list, reply)
    list.scrollTop = list.scrollHeight
    // Ler a conversa zera o aviso.
    const item = tickets.find((ticket) => ticket.id === id)
    if (item?.unread) {
      item.unread = false
      paintBadge()
    }
  } catch (error) {
    box.replaceChildren(el('p', 'support-muted', error.message))
  }
  return box
}

async function render() {
  const root = document.querySelector('[data-support-root]')
  if (!root) return
  const list = el('aside', 'panel support-list')
  list.append(el('h2', '', 'Meus chamados'))
  if (!tickets.length) list.append(el('p', 'support-muted', 'Nenhum chamado ainda. Use “Novo chamado” para falar com a gente.'))
  const ticketButton = (ticket) => {
    const item = el('button', `support-item${ticket.id === openId ? ' is-active' : ''}${ticket.unread ? ' is-unread' : ''}`)
    item.type = 'button'
    item.append(
      el('strong', '', ticket.subject),
      el('small', '', `${STATUS[ticket.status]} · ${when(ticket.updatedAt)}`),
    )
    item.addEventListener('click', () => {
      openId = ticket.id
      creating = false
      render()
    })
    return item
  }
  // Chamados agrupados por situação; cada grupo abre e fecha.
  GROUPS.forEach((group) => {
    const items = tickets.filter((ticket) => group.statuses.includes(ticket.status))
    if (!items.length) return
    const details = el('details', 'support-folder')
    details.open = groupOpen[group.key] ?? (group.open || items.some((ticket) => ticket.id === openId))
    details.addEventListener('toggle', () => {
      groupOpen[group.key] = details.open
    })
    const summary = el('summary')
    summary.append(el('span', '', group.label), el('small', '', String(items.length)))
    details.append(summary, ...items.map(ticketButton))
    list.append(details)
  })
  const main = creating
    ? newTicketForm()
    : openId
      ? await conversation(openId)
      : (() => {
          const empty = el('section', 'panel support-empty')
          empty.append(
            el('strong', '', 'Como podemos ajudar?'),
            el('p', 'support-muted', 'Abra um chamado e descreva o que precisa. Você recebe a resposta aqui, com aviso no menu, e por e-mail.'),
          )
          return empty
        })()
  root.replaceChildren(list, main)
}

function supportBanner() {
  const name = sessionStorage.getItem('farisa-support-mode')
  if (!name || document.querySelector('[data-support-banner]')) return
  const bar = el('div', 'support-mode-banner')
  bar.dataset.supportBanner = ''
  bar.append(el('span', '', `🛟 Modo suporte — você está no painel de ${name}. Tudo o que fizer aqui fica registrado.`))
  const exit = el('button', 'button button--secondary', 'Encerrar acesso')
  exit.type = 'button'
  exit.addEventListener('click', () => {
    ;['farisa-support-mode', 'farisa-coach-api-token', 'farisa-coach-session-v2', 'farisa-coach-data-v1'].forEach((key) =>
      sessionStorage.removeItem(key),
    )
    window.close()
    location.replace('/personal/#acesso-farisa')
  })
  bar.append(exit)
  document.body.prepend(bar)
  document.body.classList.add('has-support-banner')
}

export function initSupportPanel() {
  supportBanner()
  document.querySelector('[data-support-new]')?.addEventListener('click', () => {
    creating = true
    openId = null
    render()
  })
  window.addEventListener('hashchange', () => {
    if (location.hash === '#suporte') void load()
  })
  window.addEventListener('farisa:data-changed', () => {
    if (!tickets.length) void load()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void load()
  })
  window.setInterval(() => void load(), 120_000)
  void load()
}
