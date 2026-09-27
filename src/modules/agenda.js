// Página "Agenda": visão da semana (segunda a domingo) com os atendimentos
// presenciais, e ações em cada um (editar, concluir, cancelar, excluir).
import { getData, updateData } from './state.js'
import { persistRecord, removeRecord, syncRemoteData } from './api-client.js'
import { askConfirm, showToast } from './utils.js'

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

const statusLabel = { scheduled: 'Agendado', completed: 'Concluído', cancelled: 'Cancelado' }

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
    status,
  }
  updateData((data) => {
    const current = (data.appointments || []).find((entry) => entry.id === item.id)
    if (current) current.status = status
  })
  try {
    await persistRecord('appointments', record, item.id)
    await syncRemoteData()
    showToast(status === 'completed' ? 'Atendimento concluído.' : status === 'cancelled' ? 'Atendimento cancelado.' : 'Atendimento reaberto.')
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

function appointmentCard(item, now) {
  const start = new Date(item.startsAt)
  const end = new Date(item.endsAt)
  const current = item.status === 'scheduled' && now >= start && now <= end
  const past = item.status === 'scheduled' && end < now
  const card = document.createElement('article')
  card.className = `agenda-item agenda-item--${item.status}${current ? ' is-now' : ''}${past ? ' is-past' : ''}`
  const time = document.createElement('time')
  time.textContent = `${hour.format(start)}–${hour.format(end)}`
  const name = document.createElement('strong')
  name.textContent = item.student
  const detail = document.createElement('small')
  detail.textContent = [item.service, item.location].filter(Boolean).join(' · ')
  const status = document.createElement('span')
  status.className = 'agenda-status'
  status.textContent = current ? 'Agora' : past ? 'Aguardando conclusão' : statusLabel[item.status] || 'Agendado'
  const actions = document.createElement('div')
  actions.className = 'agenda-actions'
  actions.append(
    actionButton('✎', 'Editar atendimento', () =>
      window.dispatchEvent(new CustomEvent('farisa:edit-appointment', { detail: item.id })),
    ),
  )
  if (item.status === 'scheduled') {
    actions.append(
      actionButton('✓', 'Marcar como concluído', () => changeStatus(item, 'completed'), 'agenda-action--done'),
      actionButton('⊘', 'Cancelar atendimento', () => changeStatus(item, 'cancelled'), 'agenda-action--cancel'),
    )
  } else {
    actions.append(actionButton('↺', 'Voltar para agendado', () => changeStatus(item, 'scheduled')))
  }
  actions.append(
    actionButton('×', 'Excluir atendimento', () => removeAppointment(item), 'agenda-action--delete'),
  )
  card.append(time, name, detail, status, actions)
  if (item.notes) {
    const notes = document.createElement('p')
    notes.className = 'agenda-notes'
    notes.textContent = item.notes
    card.append(notes)
  }
  return card
}

function renderAgenda() {
  const week = document.querySelector('[data-agenda-week]')
  if (!week) return
  const now = new Date()
  const monday = new Date(mondayOf(now).getTime() + weekOffset * 7 * DAY)
  const days = [...Array(7)].map((_, index) => new Date(monday.getTime() + index * DAY))
  const sunday = days[6]
  document.querySelector('[data-agenda-range]').textContent =
    `${rangeLabel.format(monday)} – ${rangeLabel.format(sunday)} ${sunday.getFullYear()}`
  const appointments = (getData().appointments || [])
    .map((item) => ({ item, start: new Date(item.startsAt) }))
    .filter(({ start }) => !Number.isNaN(start.getTime()))
    .sort((a, b) => a.start - b.start)
  const inWeek = appointments.filter(
    ({ start }) => start >= monday && start < new Date(sunday.getTime() + DAY),
  )
  const active = inWeek.filter(({ item }) => item.status !== 'cancelled')
  document.querySelector('[data-agenda-summary]').textContent = active.length
    ? `${active.length} atendimento${active.length === 1 ? '' : 's'} nesta semana`
    : 'Semana sem atendimentos'
  week.replaceChildren(
    ...days.map((day) => {
      const column = document.createElement('section')
      column.className = `agenda-day${sameDay(day, now) ? ' is-today' : ''}${startOfDay(day) < startOfDay(now) ? ' is-past' : ''}`
      const head = document.createElement('header')
      const title = document.createElement('div')
      const weekday = document.createElement('strong')
      weekday.textContent = dayName.format(day)
      const date = document.createElement('small')
      date.textContent = sameDay(day, now) ? `${dayNumber.format(day)} · hoje` : dayNumber.format(day)
      title.append(weekday, date)
      const add = document.createElement('button')
      add.type = 'button'
      add.className = 'agenda-add'
      add.textContent = '+'
      add.title = `Novo atendimento em ${dayNumber.format(day)}`
      add.setAttribute('aria-label', add.title)
      add.addEventListener('click', () => openNewAppointment(day))
      head.append(title, add)
      const list = document.createElement('div')
      list.className = 'agenda-day-list'
      const items = inWeek.filter(({ start }) => sameDay(start, day))
      if (!items.length) {
        const empty = document.createElement('p')
        empty.className = 'agenda-empty'
        empty.textContent = 'Livre'
        list.append(empty)
      } else items.forEach(({ item }) => list.append(appointmentCard(item, now)))
      column.append(head, list)
      return column
    }),
  )
}

function paintMenuCount() {
  const badge = document.querySelector('[data-agenda-count]')
  if (!badge) return
  const now = new Date()
  const today = (getData().appointments || []).filter(
    (item) => item.status === 'scheduled' && sameDay(new Date(item.startsAt), now),
  ).length
  badge.hidden = today === 0
  badge.textContent = String(today)
  badge.title = `${today} atendimento(s) hoje`
}

export function initAgenda() {
  const refresh = () => {
    renderAgenda()
    paintMenuCount()
  }
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
    renderAgenda()
  })
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
