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
  detail.textContent = [item.service, item.modality === 'online' ? '' : item.location]
    .filter(Boolean)
    .join(' · ')
  const chips = document.createElement('div')
  chips.className = 'agenda-chips'
  const modality = document.createElement('span')
  modality.className = `agenda-chip agenda-chip--${item.modality === 'online' ? 'online' : 'presencial'}`
  modality.textContent = item.modality === 'online' ? '💻 Online' : '📍 Presencial'
  chips.append(modality)
  if (item.source === 'student') {
    const by = document.createElement('span')
    by.className = 'agenda-chip agenda-chip--student'
    by.textContent = 'Agendado pelo aluno'
    chips.append(by)
  }
  const status = document.createElement('span')
  status.className = 'agenda-status'
  status.textContent = current ? 'Agora' : past ? 'Aguardando conclusão' : statusLabel[item.status] || 'Agendado'
  const actions = document.createElement('div')
  actions.className = 'agenda-actions'
  if (item.modality === 'online' && item.meetingUrl && ['scheduled', 'pending'].includes(item.status)) {
    const join = document.createElement('a')
    join.className = 'agenda-action agenda-action--join'
    join.href = item.meetingUrl
    join.target = '_blank'
    join.rel = 'noopener'
    join.textContent = '▶'
    join.title = 'Abrir a chamada de vídeo'
    join.setAttribute('aria-label', join.title)
    actions.append(join)
  }
  actions.append(
    actionButton('✎', 'Editar atendimento', () =>
      window.dispatchEvent(new CustomEvent('farisa:edit-appointment', { detail: item.id })),
    ),
  )
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
    actions.append(actionButton('↺', 'Voltar para agendado', () => changeStatus(item, 'scheduled')))
  }
  actions.append(
    actionButton('×', 'Excluir atendimento', () => removeAppointment(item), 'agenda-action--delete'),
  )
  card.append(time, name, detail, chips, status, actions)
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
