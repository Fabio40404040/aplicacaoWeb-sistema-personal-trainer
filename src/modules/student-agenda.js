// Área do aluno → "Minha agenda": próximos atendimentos (online ou
// presenciais), botão para entrar na chamada, cancelamento dentro do prazo e
// agendamento nos horários livres do personal, respeitando o plano.
const weekdayShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const longDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
const hourFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const JOIN_BEFORE_MS = 15 * 60_000

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}
const modalityLabel = (modality) =>
  modality === 'online' ? 'Online' : modality === 'both' ? 'Online ou presencial' : 'Presencial'
const statusLabel = {
  pending: 'Aguardando confirmação',
  scheduled: 'Confirmado',
  completed: 'Realizado',
  cancelled: 'Cancelado',
}
const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1)

function appointmentRow(item, { request, reload, settings }) {
  const start = new Date(item.startsAt)
  const end = new Date(item.endsAt)
  const now = Date.now()
  const row = el('article', `student-agenda-item student-agenda-item--${item.status}`)
  const date = el('div', 'student-agenda-date')
  date.append(
    el('small', '', capitalize(weekdayShort.format(start).replace('.', ''))),
    el('strong', '', dayMonth.format(start)),
  )
  const info = el('div', 'student-agenda-info')
  const title = el('strong', '', item.service)
  const meta = el('small', '', `${hourFmt.format(start)}–${hourFmt.format(end)}`)
  const chips = el('div', 'student-agenda-chips')
  chips.append(
    el('span', `agenda-chip agenda-chip--${item.modality === 'online' ? 'online' : 'presencial'}`, modalityLabel(item.modality)),
    el('span', `agenda-chip agenda-chip--status-${item.status}`, statusLabel[item.status] || ''),
  )
  info.append(title, meta, chips)
  if (item.modality !== 'online' && item.location)
    info.append(el('small', 'student-agenda-place', `📍 ${item.location}`))
  const actions = el('div', 'student-agenda-actions')
  const upcoming = ['pending', 'scheduled'].includes(item.status)
  if (upcoming && item.status === 'scheduled' && item.modality === 'online') {
    const open = now >= start.getTime() - JOIN_BEFORE_MS && now <= end.getTime()
    if (item.meetingUrl && open) {
      const join = el('a', 'button button--primary', 'Entrar na chamada')
      join.href = item.meetingUrl
      join.target = '_blank'
      join.rel = 'noopener'
      actions.append(join)
    } else {
      actions.append(
        el(
          'small',
          'student-agenda-hint',
          item.meetingUrl
            ? 'O botão da chamada aparece 15 min antes.'
            : 'O personal envia o link da chamada antes do horário.',
        ),
      )
    }
  }
  if (upcoming && item.canCancel) {
    const cancel = el('button', 'button button--secondary', 'Cancelar')
    cancel.type = 'button'
    cancel.addEventListener('click', async () => {
      if (!window.confirm(`Cancelar ${item.service} de ${longDate.format(start)} às ${hourFmt.format(start)}?`))
        return
      cancel.disabled = true
      cancel.textContent = 'Cancelando…'
      try {
        await request(`booking/${item.id}/cancel`, {})
        await reload()
      } catch (error) {
        cancel.disabled = false
        cancel.textContent = 'Cancelar'
        window.alert(error.message)
      }
    })
    actions.append(cancel)
  } else if (upcoming && settings?.cancelHours) {
    actions.append(
      el('small', 'student-agenda-hint', `Para cancelar com menos de ${settings.cancelHours}h, fale com o personal.`),
    )
  }
  row.append(date, info, actions)
  return row
}

// ---------- janela "Agendar atendimento"
let dialog
function ensureDialog() {
  if (dialog?.isConnected) return dialog
  dialog = el('dialog', 'student-booking-dialog')
  dialog.innerHTML = `<form method="dialog" class="student-booking">
    <header><div><span class="eyebrow eyebrow--blue">Minha agenda</span><h2>Agendar atendimento</h2></div>
    <button class="icon-button" type="button" data-booking-close aria-label="Fechar">×</button></header>
    <div class="student-booking-body">
      <section><h3>1. Tipo de atendimento</h3><div class="booking-services" data-booking-services></div></section>
      <section data-booking-modality-wrap hidden><h3>2. Como prefere?</h3>
        <div class="booking-toggle" data-booking-modality>
          <button type="button" data-value="presencial">📍 Presencial</button>
          <button type="button" data-value="online">💻 Online (vídeo)</button>
        </div></section>
      <section><h3 data-booking-step-day>2. Dia e horário</h3>
        <div class="booking-days" data-booking-days></div>
        <div class="booking-times" data-booking-times></div></section>
      <label class="field"><span>Observação para o personal (opcional)</span>
        <textarea name="notes" rows="2" maxlength="500" placeholder="Ex.: quero revisar a técnica do agachamento"></textarea></label>
      <p class="booking-summary" data-booking-summary></p>
      <p role="status" data-booking-status></p>
    </div>
    <footer><button class="button button--secondary" type="button" data-booking-close>Voltar</button>
      <button class="button button--primary" type="submit" data-booking-submit disabled>Confirmar agendamento</button></footer>
  </form>`
  document.body.append(dialog)
  dialog.querySelectorAll('[data-booking-close]').forEach((button) =>
    button.addEventListener('click', () => dialog.close()),
  )
  return dialog
}

function openBooking(booking, { request, reload }) {
  const box = ensureDialog()
  const form = box.querySelector('form')
  const servicesBox = box.querySelector('[data-booking-services]')
  const modalityWrap = box.querySelector('[data-booking-modality-wrap]')
  const modalityBox = box.querySelector('[data-booking-modality]')
  const daysBox = box.querySelector('[data-booking-days]')
  const timesBox = box.querySelector('[data-booking-times]')
  const summary = box.querySelector('[data-booking-summary]')
  const status = box.querySelector('[data-booking-status]')
  const submit = box.querySelector('[data-booking-submit]')
  const stepDay = box.querySelector('[data-booking-step-day]')
  const state = { service: null, modality: 'presencial', days: [], day: null, slot: null, loading: 0 }
  form.reset()
  status.textContent = ''

  const paintSummary = () => {
    submit.disabled = !(state.service && state.slot)
    summary.textContent =
      state.service && state.slot
        ? `${state.service.name} · ${state.service.modality === 'both' ? modalityLabel(state.modality) : modalityLabel(state.service.modality)} · ${capitalize(longDate.format(new Date(state.slot.startsAt)))} às ${state.slot.time}`
        : ''
  }
  const paintTimes = () => {
    timesBox.replaceChildren()
    const day = state.days.find((item) => item.date === state.day)
    if (!day) return
    day.slots.forEach((slot) => {
      const button = el('button', `booking-time${state.slot?.startsAt === slot.startsAt ? ' is-active' : ''}`, slot.time)
      button.type = 'button'
      button.addEventListener('click', () => {
        state.slot = slot
        paintTimes()
        paintSummary()
      })
      timesBox.append(button)
    })
  }
  const paintDays = () => {
    daysBox.replaceChildren()
    if (!state.days.length) {
      daysBox.append(el('p', 'booking-empty', 'Sem horários livres nos próximos dias para esta opção.'))
      return
    }
    state.days.forEach((day) => {
      const date = new Date(`${day.date}T12:00:00`)
      const button = el('button', `booking-day${state.day === day.date ? ' is-active' : ''}`)
      button.type = 'button'
      button.append(
        el('small', '', capitalize(weekdayShort.format(date).replace('.', ''))),
        el('strong', '', dayMonth.format(date)),
        el('span', '', `${day.slots.length} horário${day.slots.length === 1 ? '' : 's'}`),
      )
      button.addEventListener('click', () => {
        state.day = day.date
        state.slot = null
        paintDays()
        paintTimes()
        paintSummary()
      })
      daysBox.append(button)
    })
  }
  const loadSlots = async () => {
    const ticket = ++state.loading
    state.days = []
    state.day = null
    state.slot = null
    daysBox.replaceChildren(el('p', 'booking-empty', 'Buscando horários livres…'))
    timesBox.replaceChildren()
    paintSummary()
    try {
      const result = await request(
        `booking/slots?service=${encodeURIComponent(state.service.id)}&modality=${state.modality}`,
      )
      if (ticket !== state.loading) return
      state.days = result.days || []
      state.day = state.days[0]?.date || null
      paintDays()
      paintTimes()
    } catch (error) {
      daysBox.replaceChildren(el('p', 'booking-empty', error.message))
    }
  }
  const paintModality = () => {
    const both = state.service?.modality === 'both'
    modalityWrap.hidden = !both
    stepDay.textContent = both ? '3. Dia e horário' : '2. Dia e horário'
    modalityBox.querySelectorAll('button').forEach((button) =>
      button.classList.toggle('is-active', button.dataset.value === state.modality),
    )
  }
  modalityBox.querySelectorAll('button').forEach((button) => {
    button.onclick = () => {
      state.modality = button.dataset.value
      paintModality()
      void loadSlots()
    }
  })

  servicesBox.replaceChildren()
  const bookable = booking.services.filter((service) => service.remaining === null || service.remaining > 0)
  booking.services.forEach((service) => {
    const available = service.remaining === null || service.remaining > 0
    const card = el('button', 'booking-service')
    card.type = 'button'
    card.disabled = !available
    card.append(
      el('strong', '', service.name),
      el('small', '', `${service.durationMin} min · ${modalityLabel(service.modality)}`),
      el(
        'span',
        'booking-quota',
        service.remaining === null
          ? 'Ilimitado no seu plano'
          : available
            ? `${service.remaining} de ${service.perMonth} disponível este mês`
            : 'Já utilizado este mês',
      ),
    )
    if (service.description) card.title = service.description
    card.addEventListener('click', () => {
      state.service = service
      state.modality = service.modality === 'online' ? 'online' : 'presencial'
      servicesBox.querySelectorAll('.booking-service').forEach((node) => node.classList.toggle('is-active', node === card))
      paintModality()
      void loadSlots()
    })
    servicesBox.append(card)
  })
  if (bookable.length === 1) servicesBox.querySelector('.booking-service:not([disabled])')?.click()
  else {
    paintModality()
    daysBox.replaceChildren(el('p', 'booking-empty', 'Escolha o tipo de atendimento para ver os horários.'))
    timesBox.replaceChildren()
    paintSummary()
  }

  form.onsubmit = async (event) => {
    event.preventDefault()
    if (!state.service || !state.slot) return
    submit.disabled = true
    submit.textContent = 'Agendando…'
    status.textContent = ''
    try {
      const created = await request('booking', {
        serviceId: state.service.id,
        modality: state.modality,
        startsAt: state.slot.startsAt,
        notes: form.elements.notes.value,
      })
      box.close()
      await reload()
      window.alert(
        created.status === 'pending'
          ? 'Pedido enviado! Você será avisado quando o personal confirmar.'
          : 'Agendado! O atendimento já está na sua agenda.',
      )
    } catch (error) {
      status.textContent = error.message
      if (/ocupado/u.test(error.message)) void loadSlots()
    } finally {
      submit.textContent = 'Confirmar agendamento'
      paintSummary()
    }
  }
  box.showModal()
}

// ---------- cartão "Minha agenda"
export async function renderStudentAgenda(card, { request, reload }) {
  card.id = 'student-agenda'
  card.classList.add('student-agenda', 'student-card--wide')
  const head = el('div', 'student-agenda-head')
  const title = el('div')
  title.append(el('h2', '', 'Minha agenda'), el('p', 'student-agenda-sub', 'Atendimentos online e presenciais com o seu personal.'))
  head.append(title)
  const body = el('div', 'student-agenda-body')
  body.append(el('p', 'student-agenda-hint', 'Carregando sua agenda…'))
  card.replaceChildren(head, body)

  let booking
  try {
    booking = await request('booking')
  } catch (error) {
    body.replaceChildren(el('p', 'student-agenda-hint', error.message))
    return
  }
  const options = { request, reload, settings: booking.settings }
  const canBook =
    booking.enabled &&
    booking.services.some((service) => service.remaining === null || service.remaining > 0)
  if (booking.enabled && booking.services.length) {
    const button = el('button', 'button button--primary', '+ Agendar atendimento')
    button.type = 'button'
    button.disabled = !canBook
    button.addEventListener('click', () => openBooking(booking, { request, reload }))
    head.append(button)
  }

  body.replaceChildren()
  if (booking.services.length) {
    const quotas = el('div', 'student-agenda-quotas')
    booking.services.forEach((service) => {
      const chip = el('span', 'student-agenda-quota')
      chip.append(
        el('strong', '', service.name),
        el(
          'small',
          '',
          service.remaining === null
            ? 'ilimitado'
            : `${service.remaining} de ${service.perMonth} disponível`,
        ),
      )
      quotas.append(chip)
    })
    body.append(quotas)
  }

  const upcoming = booking.appointments.filter((item) => ['pending', 'scheduled'].includes(item.status))
  const past = booking.appointments
    .filter((item) => !['pending', 'scheduled'].includes(item.status))
    .reverse()
  if (upcoming.length) {
    const list = el('div', 'student-agenda-list')
    upcoming.forEach((item) => list.append(appointmentRow(item, options)))
    body.append(list)
  } else {
    body.append(
      el(
        'p',
        'student-agenda-empty',
        booking.reason === 'disabled'
          ? 'Nenhum atendimento marcado. O personal ainda não abriu horários para agendamento pelo app — quando abrir, o botão “Agendar” aparece aqui.'
          : !booking.services.length
            ? 'Nenhum atendimento marcado. Seu plano não inclui agendamentos pelo app; fale com o personal para marcar.'
            : 'Nenhum atendimento marcado. Use “Agendar atendimento” para escolher um horário livre.',
      ),
    )
  }
  if (past.length) {
    const history = el('details', 'student-agenda-history')
    history.append(el('summary', '', `Atendimentos anteriores (${past.length})`))
    const list = el('div', 'student-agenda-list')
    past.forEach((item) => list.append(appointmentRow(item, options)))
    history.append(list)
    body.append(history)
  }
}
