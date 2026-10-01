// Página "Agenda": visão da semana (segunda a domingo) com os atendimentos
// presenciais, e ações em cada um (editar, concluir, cancelar, excluir).
import { getData, updateData } from './state.js'
import { persistRecord, removeRecord, syncRemoteData } from './api-client.js'
import { askConfirm, showToast } from './utils.js'
import { bookingConfig, openBookingConfig } from './agenda-settings.js'

let weekOffset = 0 // 0 = semana atual, -1 = anterior, 1 = próxima…

const DAY = 86_400_000
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
function mondayOf(date) {
  const day = startOfDay(date)
  const shift = (day.getDay() + 6) % 7 // segunda = 0
  return new Date(day.getTime() - shift * DAY)
}
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime()
const fmt = (options) => new Intl.DateTimeFormat('pt-BR', options)
const hour = fmt({ hour: '2-digit', minute: '2-digit' })
const dayName = fmt({ weekday: 'long' })
const dayNumber = fmt({ day: '2-digit', month: '2-digit' })
const rangeLabel = fmt({ day: '2-digit', month: 'short' })
const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const statusLabel = {
  pending: 'Aguardando confirmação',
  scheduled: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

// Abre o "Novo atendimento" (a mesma janela do Painel) já com a data escolhida.
function openNewAppointment(date) {
  const trigger = document.querySelector('[data-route="painel"] [data-open-modal="appointment"]')
  if (!trigger) return
  trigger.click()
  if (date)
    queueMicrotask(() => {
      const form = document.querySelector('[data-form="appointment"]')
      if (form?.elements.date) form.elements.date.value = isoDate(date)
      form?.elements.time?.focus()
    })
}

async function changeStatus(item, status) {
  const record = {
    student: item.student,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    service: item.service,
    location: item.location || '',
    notes: item.notes || '',
    modality: item.modality || 'presencial',
    meetingUrl: item.meetingUrl || '',
    serviceId: item.serviceId || null,
    status,
  }
  updateData((data) => {
    const current = (data.appointments || []).find((entry) => entry.id === item.id)
    if (current) current.status = status
  })
  try {
    await persistRecord('appointments', record, item.id)
    await syncRemoteData()
    showToast(
      status === 'completed'
        ? 'Atendimento concluído.'
        : status === 'cancelled'
          ? item.status === 'pending'
            ? 'Pedido recusado. O horário voltou a ficar livre.'
            : 'Atendimento cancelado.'
          : item.status === 'pending'
            ? `Confirmado! ${item.student} já vê na agenda dele.`
            : 'Atendimento reaberto.',
    )
  } catch (error) {
    showToast(error.message)
    await syncRemoteData()
  }
}

async function removeAppointment(item) {
  const ok = await askConfirm({
    eyebrow: 'Agenda',
    title: 'Excluir atendimento?',
    message: `O atendimento de ${item.student} sai da agenda.`,
    note: 'Esta ação não pode ser desfeita.',
  })
  if (!ok) return
  updateData((data) => {
    data.appointments = (data.appointments || []).filter((entry) => entry.id !== item.id)
  })
  try {
    await removeRecord('appointments', item.id)
    showToast('Atendimento excluído.')
  } catch (error) {
    showToast(error.message)
  }
}

function actionButton(label, title, onClick, extra = '') {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `agenda-action ${extra}`.trim()
  button.textContent = label
  button.title = title
  button.setAttribute('aria-label', title)
  button.addEventListener('click', onClick)
  return button
}

const weekdayShort = fmt({ weekday: 'short' })
const longDay = fmt({ weekday: 'long', day: '2-digit', month: 'long' })
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)
let selectedDay = null // Date do dia aberto na lista

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

// Uma linha por atendimento: horário | aluno e atendimento | situação | ações.
function appointmentRow(item, now, { showDate = false } = {}) {
  const start = new Date(item.startsAt)
  const end = new Date(item.endsAt)
  const current = item.status === 'scheduled' && now >= start && now <= end
  const past = item.status === 'scheduled' && end < now
  const row = el(
    'article',
    `agenda-row agenda-row--${item.status}${current ? ' is-now' : ''}${past ? ' is-past' : ''}`,
  )
  const time = el('div', 'agenda-row-time')
  if (showDate) time.append(el('small', 'agenda-row-date', `${capitalize(weekdayShort.format(start).replace('.', ''))} ${dayNumber.format(start)}`))
  time.append(el('strong', '', hour.format(start)), el('small', '', `até ${hour.format(end)}`))

  const main = el('div', 'agenda-row-main')
  const name = el('strong', 'agenda-row-name', item.student)
  const detail = el(
    'small',
    'agenda-row-detail',
    [item.service, item.modality === 'online' ? '' : item.location].filter(Boolean).join(' · '),
  )
  const chips = el('div', 'agenda-chips')
  chips.append(
    el(
      'span',
      `agenda-chip agenda-chip--${item.modality === 'online' ? 'online' : 'presencial'}`,
      item.modality === 'online' ? '💻 Online' : '📍 Presencial',
    ),
  )
  if (item.source === 'student') chips.append(el('span', 'agenda-chip agenda-chip--student', 'Agendado pelo aluno'))
  main.append(name, detail, chips)
  if (item.notes) main.append(el('p', 'agenda-notes', item.notes))

  const status = el(
    'span',
    `agenda-chip agenda-chip--status-${current ? 'now' : past ? 'late' : item.status}`,
    current ? 'Agora' : past ? 'Concluir?' : statusLabel[item.status] || 'Confirmado',
  )

  const actions = el('div', 'agenda-actions')
  if (item.modality === 'online' && item.meetingUrl && ['scheduled', 'pending'].includes(item.status)) {
    const join = el('a', 'agenda-action agenda-action--join', '▶')
    join.href = item.meetingUrl
    join.target = '_blank'
    join.rel = 'noopener'
    join.title = 'Abrir a chamada de vídeo'
    join.setAttribute('aria-label', join.title)
    actions.append(join)
  }
  if (item.status === 'pending') {
    actions.append(
      actionButton('✓', 'Confirmar pedido', () => changeStatus(item, 'scheduled'), 'agenda-action--done'),
      actionButton('⊘', 'Recusar pedido', () => changeStatus(item, 'cancelled'), 'agenda-action--cancel'),
    )
  } else if (item.status === 'scheduled') {
    actions.append(
      actionButton('✓', 'Marcar como concluído', () => changeStatus(item, 'completed'), 'agenda-action--done'),
      actionButton('⊘', 'Cancelar atendimento', () => changeStatus(item, 'cancelled'), 'agenda-action--cancel'),
    )
  } else {
    actions.append(actionButton('↺', 'Voltar para confirmado', () => changeStatus(item, 'scheduled')))
  }
  actions.append(
    actionButton('✎', 'Editar atendimento', () =>
      window.dispatchEvent(new CustomEvent('farisa:edit-appointment', { detail: item.id })),
    ),
    actionButton('×', 'Excluir atendimento', () => removeAppointment(item), 'agenda-action--delete'),
  )
  const side = el('div', 'agenda-row-side')
  side.append(status, actions)
  row.append(time, main, side)
  return row
}

function matchesFilter(item, filter) {
  if (filter === 'online') return item.modality === 'online'
  if (filter === 'presencial') return item.modality !== 'online'
  if (filter === 'pending') return item.status === 'pending'
  return true
}

function renderAgenda() {
  const board = document.querySelector('[data-agenda-week]')
  if (!board) return
  const now = new Date()
  const monday = new Date(mondayOf(now).getTime() + weekOffset * 7 * DAY)
  const days = [...Array(7)].map((_, index) => new Date(monday.getTime() + index * DAY))
  const sunday = days[6]
  document.querySelector('[data-agenda-range]').textContent =
    `${rangeLabel.format(monday)} – ${rangeLabel.format(sunday)} ${sunday.getFullYear()}`
  const query = (document.querySelector('[data-agenda-search]')?.value || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
  const filter = document.querySelector('[data-agenda-filter]')?.value || 'all'
  const all = (getData().appointments || [])
    .map((item) => ({ item, start: new Date(item.startsAt) }))
    .filter(({ start }) => !Number.isNaN(start.getTime()))
    .filter(({ item }) => matchesFilter(item, filter))
    .sort((a, b) => a.start - b.start)
  const inWeek = all.filter(({ start }) => start >= monday && start < new Date(sunday.getTime() + DAY))
  const active = inWeek.filter(({ item }) => item.status !== 'cancelled')
  document.querySelector('[data-agenda-summary]').textContent = active.length
    ? `${active.length} atendimento${active.length === 1 ? '' : 's'} nesta semana`
    : 'Semana sem atendimentos'

  // Busca por aluno: mostra todos os atendimentos dele (dos últimos 30 dias em diante).
  if (query) {
    const from = new Date(now.getTime() - 30 * DAY)
    const found = all.filter(
      ({ item, start }) => start >= from && item.student.toLocaleLowerCase('pt-BR').includes(query),
    )
    const panel = el('section', 'agenda-day-panel')
    const head = el('header', 'agenda-day-panel-head')
    head.append(
      el('strong', '', `Resultado da busca`),
      el('small', '', found.length ? `${found.length} atendimento${found.length === 1 ? '' : 's'}` : 'Nenhum atendimento encontrado'),
    )
    const list = el('div', 'agenda-day-rows')
    found.forEach(({ item }) => list.append(appointmentRow(item, now, { showDate: true })))
    panel.append(head, list)
    board.replaceChildren(panel)
    return
  }

  if (!selectedDay || !days.some((day) => sameDay(day, selectedDay))) {
    selectedDay =
      days.find((day) => sameDay(day, now)) ||
      days.find((day) => inWeek.some(({ start }) => sameDay(start, day))) ||
      days[0]
  }

  // Faixa com os 7 dias: toque no dia para ver os horários dele, em ordem.
  const strip = el('div', 'agenda-strip')
  days.forEach((day) => {
    const items = inWeek.filter(({ start }) => sameDay(start, day))
    const count = items.filter(({ item }) => item.status !== 'cancelled').length
    const pending = items.some(({ item }) => item.status === 'pending')
    const button = el(
      'button',
      `agenda-strip-day${sameDay(day, now) ? ' is-today' : ''}${sameDay(day, selectedDay) ? ' is-selected' : ''}${startOfDay(day) < startOfDay(now) ? ' is-past' : ''}`,
    )
    button.type = 'button'
    button.append(
      el('small', '', capitalize(weekdayShort.format(day).replace('.', ''))),
      el('strong', '', dayNumber.format(day)),
      el('span', `agenda-strip-count${count ? ' has-items' : ''}${pending ? ' has-pending' : ''}`, count ? `${count} ${count === 1 ? 'aluno' : 'alunos'}` : 'Livre'),
    )
    button.setAttribute('aria-pressed', String(sameDay(day, selectedDay)))
    button.addEventListener('click', () => {
      selectedDay = day
      renderAgenda()
    })
    strip.append(button)
  })

  const items = inWeek.filter(({ start }) => sameDay(start, selectedDay))
  const panel = el('section', 'agenda-day-panel')
  const head = el('header', 'agenda-day-panel-head')
  const title = el('div')
  const dayCount = items.filter(({ item }) => item.status !== 'cancelled').length
  title.append(
    el('strong', '', `${capitalize(longDay.format(selectedDay))}${sameDay(selectedDay, now) ? ' · hoje' : ''}`),
    el('small', '', dayCount ? `${dayCount} atendimento${dayCount === 1 ? '' : 's'} em ordem de horário` : 'Nenhum atendimento neste dia'),
  )
  const add = el('button', 'button button--secondary', '+ Atendimento neste dia')
  add.type = 'button'
  const day = selectedDay
  add.addEventListener('click', () => openNewAppointment(day))
  head.append(title, add)
  const list = el('div', 'agenda-day-rows')
  if (!items.length) list.append(el('p', 'agenda-empty', 'Dia livre.'))
  else items.forEach(({ item }) => list.append(appointmentRow(item, now)))
  panel.append(head, list)
  board.replaceChildren(strip, panel)
  // No celular a faixa rola de lado: deixa o dia escolhido à vista.
  const chosen = strip.querySelector('.is-selected')
  if (chosen && strip.scrollWidth > strip.clientWidth)
    strip.scrollLeft = chosen.offsetLeft - strip.clientWidth / 2 + chosen.clientWidth / 2
}

// Pedidos de agendamento esperando sua resposta (no topo da Agenda).
function renderPending() {
  const box = document.querySelector('[data-agenda-pending]')
  if (!box) return
  const now = new Date()
  const pending = (getData().appointments || [])
    .filter((item) => item.status === 'pending' && new Date(item.endsAt) >= now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
  box.hidden = !pending.length
  if (!pending.length) return box.replaceChildren()
  const title = document.createElement('strong')
  title.textContent = `🗓️ ${pending.length} pedido${pending.length === 1 ? '' : 's'} de agendamento aguardando sua confirmação`
  const list = document.createElement('div')
  list.className = 'agenda-pending-list'
  pending.forEach((item) => {
    const start = new Date(item.startsAt)
    const row = document.createElement('div')
    row.className = 'agenda-pending-item'
    const info = document.createElement('span')
    info.textContent = `${item.student} · ${item.service} · ${item.modality === 'online' ? 'Online' : 'Presencial'} · ${dayName.format(start)}, ${dayNumber.format(start)} às ${hour.format(start)}`
    const accept = document.createElement('button')
    accept.type = 'button'
    accept.className = 'button button--primary'
    accept.textContent = 'Confirmar'
    accept.addEventListener('click', () => changeStatus(item, 'scheduled'))
    const decline = document.createElement('button')
    decline.type = 'button'
    decline.className = 'button button--secondary'
    decline.textContent = 'Recusar'
    decline.addEventListener('click', () => changeStatus(item, 'cancelled'))
    row.append(info, accept, decline)
    list.append(row)
  })
  box.replaceChildren(title, list)
}

// Dica enquanto o agendamento pelo aluno está desligado.
function renderSetupHint() {
  const box = document.querySelector('[data-agenda-setup-hint]')
  if (!box) return
  const config = bookingConfig()
  box.hidden = !config || config.settings.enabled
  if (box.hidden) return
  box.replaceChildren()
  const text = document.createElement('span')
  text.textContent =
    'Seus alunos ainda não agendam pelo app. Defina seus horários livres, os atendimentos online/presenciais e quanto cada plano dá direito — leva 2 minutos.'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--primary'
  button.textContent = 'Configurar agora'
  button.addEventListener('click', () => void openBookingConfig())
  box.append(text, button)
}

function paintMenuCount() {
  const badge = document.querySelector('[data-agenda-count]')
  if (!badge) return
  const now = new Date()
  const today = (getData().appointments || []).filter(
    (item) => item.status === 'scheduled' && sameDay(new Date(item.startsAt), now),
  ).length
  const pending = (getData().appointments || []).filter(
    (item) => item.status === 'pending' && new Date(item.endsAt) >= now,
  ).length
  const total = today + pending
  badge.hidden = total === 0
  badge.textContent = String(total)
  badge.title = `${today} atendimento(s) hoje${pending ? ` · ${pending} pedido(s) aguardando confirmação` : ''}`
}

export function initAgenda() {
  const refresh = () => {
    renderAgenda()
    renderPending()
    renderSetupHint()
    paintMenuCount()
  }
  window.addEventListener('farisa:booking-config', renderSetupHint)
  document.querySelector('[data-agenda-prev]')?.addEventListener('click', () => {
    weekOffset -= 1
    renderAgenda()
  })
  document.querySelector('[data-agenda-next]')?.addEventListener('click', () => {
    weekOffset += 1
    renderAgenda()
  })
  document.querySelector('[data-agenda-today]')?.addEventListener('click', () => {
    weekOffset = 0
    selectedDay = new Date()
    renderAgenda()
  })
  document.querySelector('[data-agenda-search]')?.addEventListener('input', renderAgenda)
  document.querySelector('[data-agenda-filter]')?.addEventListener('change', renderAgenda)
  document.querySelector('[data-agenda-new]')?.addEventListener('click', () => {
    const now = new Date()
    const target = weekOffset === 0 ? now : new Date(mondayOf(now).getTime() + weekOffset * 7 * DAY)
    openNewAppointment(target)
  })
  window.addEventListener('farisa:data-changed', refresh)
  // O "agora" e o contador de hoje mudam com o relógio.
  window.setInterval(refresh, 5 * 60_000)
  refresh()
}
