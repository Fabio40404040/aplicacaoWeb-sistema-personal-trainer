// Agenda do personal: configuração dos horários livres, tipos de atendimento
// (online/presencial), quanto cada plano dá direito por mês, folgas e regras
// do agendamento feito pelo aluno. Também completa a janela "Novo
// atendimento" com modalidade, link da chamada e duração de cada tipo.
import { fetchBookingConfig, saveBookingConfig } from './api-client.js'
import { showToast } from './utils.js'
import { getData } from './state.js'

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const MODALITY_OPTIONS = [
  ['both', 'Online e presencial'],
  ['presencial', 'Só presencial'],
  ['online', 'Só online'],
]
const PLAN_ORDER = ['ready', 'basic', 'premium', 'athlete']

let config = null
let loading = null

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}
const toTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const toMinutes = (value) => {
  const [h, m] = String(value || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : 0
}
const selectOf = (name, options, selected) => {
  const select = el('select')
  select.name = name
  options.forEach(([value, label]) => {
    const option = el('option', '', label)
    option.value = value
    select.append(option)
  })
  select.value = selected
  return select
}

export function bookingConfig() {
  return config
}

export async function loadBookingConfig(force = false) {
  if (config && !force) return config
  if (loading) return loading
  loading = fetchBookingConfig()
    .then((result) => {
      config = result
      window.dispatchEvent(new CustomEvent('farisa:booking-config', { detail: config }))
      return config
    })
    .catch(() => null)
    .finally(() => {
      loading = null
    })
  return loading
}

// ---------- janela "Novo atendimento"
function syncAppointmentForm(form, { fillDefaults = false } = {}) {
  if (!form) return
  const online = form.elements.modality?.value === 'online'
  const location = form.querySelector('[data-appointment-location]')
  const link = form.querySelector('[data-appointment-link]')
  if (location) location.hidden = online
  if (link) link.hidden = !online
  if (fillDefaults && config?.settings) {
    if (online && !form.elements.meetingUrl.value)
      form.elements.meetingUrl.value = config.settings.defaultMeetingUrl || ''
    if (!online && !form.elements.location.value)
      form.elements.location.value = config.settings.defaultAddress || ''
  }
}

function paintServiceOptions(form, keep) {
  const select = form?.querySelector('[data-appointment-services]')
  if (!select || !config?.services?.length) return
  const current = keep ?? select.value
  const options = config.services
    .filter((service) => service.active)
    .map((service) => {
      const option = el('option', '', service.name)
      option.value = service.name
      option.dataset.serviceId = service.id
      option.dataset.duration = String(service.durationMin)
      option.dataset.modality = service.modality
      return option
    })
  const extra = el('option', '', 'Orientação técnica')
  extra.value = 'Orientação técnica'
  options.push(extra)
  if (current && !options.some((option) => option.value === current)) {
    const legacy = el('option', '', current)
    legacy.value = current
    options.unshift(legacy)
  }
  select.replaceChildren(...options)
  if (current) select.value = current
}

// Aviso de horário ocupado na janela "Novo atendimento".
let editingId = null
function checkConflict(form) {
  let warning = form.querySelector('[data-appointment-conflict]')
  if (!warning) {
    warning = el('p', 'appointment-conflict')
    warning.dataset.appointmentConflict = ''
    form.querySelector('.modal-body')?.prepend(warning)
  }
  const date = form.elements.date?.value
  const time = form.elements.time?.value
  if (!date || !time) {
    warning.hidden = true
    return
  }
  const start = new Date(`${date}T${time}:00`)
  const end = new Date(start.getTime() + (Number(form.elements.duration.value) || 60) * 60_000)
  const hourFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const clashes = (getData().appointments || []).filter(
    (item) =>
      item.id !== editingId &&
      ['scheduled', 'pending'].includes(item.status) &&
      new Date(item.startsAt) < end &&
      new Date(item.endsAt) > start,
  )
  warning.hidden = !clashes.length
  warning.textContent = clashes.length
    ? `⚠ Horário ocupado: ${clashes
        .map((item) => `${item.student} (${hourFmt.format(new Date(item.startsAt))}–${hourFmt.format(new Date(item.endsAt))})`)
        .join(', ')}. Você ainda pode salvar se for proposital.`
    : ''
}

function enhanceAppointmentForm() {
  const form = document.querySelector('[data-form="appointment"]')
  if (!form || form.dataset.bookingReady) return
  form.dataset.bookingReady = '1'
  ;['date', 'time', 'duration'].forEach((name) => {
    form.elements[name]?.addEventListener('input', () => checkConflict(form))
    form.elements[name]?.addEventListener('change', () => checkConflict(form))
  })
  const select = form.querySelector('[data-appointment-services]')
  select?.addEventListener('change', () => {
    const option = select.selectedOptions[0]
    if (!option?.dataset.serviceId) return
    const duration = form.elements.duration
    if ([...duration.options].some((item) => item.value === option.dataset.duration))
      duration.value = option.dataset.duration
    if (option.dataset.modality === 'online' || option.dataset.modality === 'presencial')
      form.elements.modality.value = option.dataset.modality
    syncAppointmentForm(form, { fillDefaults: true })
  })
  form.elements.modality?.addEventListener('change', () =>
    syncAppointmentForm(form, { fillDefaults: true }),
  )
  form.closest('dialog')?.addEventListener('close', () =>
    queueMicrotask(() => syncAppointmentForm(form)),
  )
  // Abrir "Novo atendimento": tipos do personal + local/link padrão.
  document.addEventListener(
    'click',
    (event) => {
      if (!event.target.closest('[data-open-modal="appointment"]')) return
      editingId = null
      paintServiceOptions(form)
      queueMicrotask(() => {
        syncAppointmentForm(form, { fillDefaults: true })
        checkConflict(form)
      })
    },
    true,
  )
  window.addEventListener('farisa:appointment-form-filled', (event) => {
    editingId = event.detail?.id || null
    queueMicrotask(() => checkConflict(form))
    paintServiceOptions(form, event.detail?.service)
    form.elements.modality.value = event.detail?.modality || 'presencial'
    form.elements.meetingUrl.value = event.detail?.meetingUrl || ''
    syncAppointmentForm(form)
  })
  window.addEventListener('farisa:booking-config', () => paintServiceOptions(form))
  syncAppointmentForm(form)
}

// ---------- janela "Configurar agenda"
let dialog
function field(label, input, hint) {
  const wrap = el('label', 'field')
  wrap.append(el('span', '', label), input)
  if (hint) wrap.append(el('small', 'field-hint', hint))
  return wrap
}
function numberInput(name, value, min, max) {
  const input = el('input')
  input.type = 'number'
  input.name = name
  input.min = String(min)
  input.max = String(max)
  input.value = String(value)
  return input
}

function ruleRow(rule = { startMin: 8 * 60, endMin: 12 * 60, modality: 'both' }) {
  const row = el('div', 'booking-rule')
  const start = el('input')
  start.type = 'time'
  start.value = toTime(rule.startMin)
  start.dataset.role = 'start'
  const end = el('input')
  end.type = 'time'
  end.value = toTime(rule.endMin)
  end.dataset.role = 'end'
  const modality = selectOf('modality', MODALITY_OPTIONS, rule.modality)
  modality.dataset.role = 'modality'
  const remove = el('button', 'icon-button booking-remove', '×')
  remove.type = 'button'
  remove.title = 'Remover faixa'
  remove.addEventListener('click', () => row.remove())
  row.append(start, el('span', 'booking-rule-sep', 'às'), end, modality, remove)
  return row
}

function dayBlock(weekday, rules) {
  const block = el('div', 'booking-day-config')
  block.dataset.weekday = String(weekday)
  const head = el('div', 'booking-day-head')
  head.append(el('strong', '', WEEKDAYS[weekday]))
  const add = el('button', 'button button--secondary booking-add-range', '+ faixa')
  add.type = 'button'
  const list = el('div', 'booking-rule-list')
  add.addEventListener('click', () => {
    const last = [...list.querySelectorAll('[data-role="end"]')].at(-1)
    const start = last ? toMinutes(last.value) + 60 : 8 * 60
    list.append(ruleRow({ startMin: Math.min(start, 22 * 60), endMin: Math.min(start + 4 * 60, 23 * 60), modality: 'both' }))
  })
  head.append(add)
  rules.forEach((rule) => list.append(ruleRow(rule)))
  if (!rules.length) list.append(el('small', 'booking-day-off', 'Sem atendimento'))
  const observer = new MutationObserver(() => {
    const off = list.querySelector('.booking-day-off')
    const hasRules = list.querySelector('.booking-rule')
    if (hasRules && off) off.remove()
    if (!hasRules && !off) list.append(el('small', 'booking-day-off', 'Sem atendimento'))
  })
  observer.observe(list, { childList: true })
  block.append(head, list)
  return block
}

function serviceRow(service = { name: '', modality: 'both', durationMin: 60, description: '', active: true }) {
  const row = el('div', 'booking-service-row')
  if (service.id) row.dataset.id = service.id
  const name = el('input')
  name.name = 'name'
  name.value = service.name
  name.placeholder = 'Ex.: Consulta por vídeo'
  name.maxLength = 80
  const modality = selectOf('modality', [
    ['both', 'Online ou presencial'],
    ['presencial', 'Presencial'],
    ['online', 'Online'],
  ], service.modality)
  const duration = selectOf(
    'duration',
    [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '60 min'], [75, '75 min'], [90, '90 min'], [120, '2 h']].map(
      ([value, label]) => [String(value), label],
    ),
    String(service.durationMin),
  )
  if (!duration.value) duration.value = '60'
  const description = el('input')
  description.name = 'description'
  description.value = service.description || ''
  description.placeholder = 'O que acontece neste atendimento (o aluno vê)'
  description.maxLength = 300
  const active = el('label', 'booking-check')
  const activeBox = el('input')
  activeBox.type = 'checkbox'
  activeBox.name = 'active'
  activeBox.checked = service.active !== false
  active.append(activeBox, el('span', '', 'Ativo'))
  const remove = el('button', 'icon-button booking-remove', '×')
  remove.type = 'button'
  remove.title = 'Excluir tipo de atendimento'
  remove.addEventListener('click', () => {
    row.remove()
    paintQuotaTable()
  })
  name.addEventListener('input', () => paintQuotaTable())
  row.append(name, modality, duration, active, remove, description)
  return row
}

function quotaSelect(value) {
  const options = [['0', '—'], ...[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => [String(n), `${n}/mês`]), ['-1', 'Ilimitado']]
  const select = selectOf('quota', options, String(value ?? 0))
  if (!select.value) select.value = '0'
  return select
}

// Guarda o que já foi escolhido na tabela ao redesenhar.
function currentQuotaValues() {
  const values = new Map()
  dialog?.querySelectorAll('[data-quota-plan]').forEach((select) => {
    values.set(`${select.dataset.quotaPlan}:${select.dataset.quotaService}`, select.value)
  })
  return values
}

function paintQuotaTable(source) {
  const table = dialog?.querySelector('[data-booking-quotas]')
  if (!table) return
  const previous = source ? null : currentQuotaValues()
  const quotas = new Map(
    (source || []).map((quota) => [`${quota.planCode}:${quota.serviceId}`, String(quota.perMonth)]),
  )
  const plans = (config?.plans || [])
    .slice()
    .sort((a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code))
  const rows = [...dialog.querySelectorAll('.booking-service-row')]
  const head = el('tr')
  head.append(el('th', '', 'Atendimento'), ...plans.map((plan) => el('th', '', plan.name)))
  const body = rows.map((row, index) => {
    if (!row.dataset.key) row.dataset.key = row.dataset.id || `novo-${Date.now()}-${index}`
    const key = row.dataset.key
    const tr = el('tr')
    tr.append(el('td', '', row.querySelector('[name="name"]').value || 'Novo atendimento'))
    plans.forEach((plan) => {
      const id = `${plan.code}:${key}`
      const value = previous?.get(id) ?? quotas.get(id) ?? '0'
      const select = quotaSelect(value)
      select.dataset.quotaPlan = plan.code
      select.dataset.quotaService = key
      const td = el('td')
      td.append(select)
      tr.append(td)
    })
    return tr
  })
  const thead = el('thead')
  thead.append(head)
  const tbody = el('tbody')
  tbody.append(...body)
  table.replaceChildren(thead, tbody)
}

function blockRow(block = {}) {
  const row = el('div', 'booking-block-row')
  const start = el('input')
  start.type = 'date'
  start.dataset.role = 'start'
  const end = el('input')
  end.type = 'date'
  end.dataset.role = 'end'
  const iso = (value) => {
    if (!value) return ''
    const date = new Date(value)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  start.value = iso(block.startsAt)
  end.value = block.endsAt ? iso(new Date(new Date(block.endsAt).getTime() - 1)) : ''
  const reason = el('input')
  reason.placeholder = 'Motivo (ex.: férias, feriado)'
  reason.value = block.reason || ''
  reason.dataset.role = 'reason'
  const remove = el('button', 'icon-button booking-remove', '×')
  remove.type = 'button'
  remove.title = 'Remover folga'
  remove.addEventListener('click', () => row.remove())
  row.append(start, el('span', 'booking-rule-sep', 'até'), end, reason, remove)
  return row
}

function ensureDialog() {
  if (dialog?.isConnected) return dialog
  dialog = el('dialog', 'modal booking-config-dialog')
  dialog.dataset.modal = 'booking-config'
  dialog.innerHTML = `<form method="dialog" class="booking-config">
    <header><div><span class="eyebrow eyebrow--blue">Agenda online e presencial</span><h2>Configurar agenda</h2></div>
      <button class="icon-button" type="button" data-booking-close aria-label="Fechar">×</button></header>
    <div class="modal-body booking-config-body">
      <section class="booking-config-section">
        <h3>Agendamento pelo aluno</h3>
        <div class="booking-switches" data-booking-switches></div>
        <div class="field-grid booking-config-grid" data-booking-rules-grid></div>
        <div class="field-grid" data-booking-defaults></div>
      </section>
      <section class="booking-config-section">
        <h3>Horários livres da semana</h3>
        <p class="booking-help">O aluno só vê os horários dentro destas faixas que não estejam ocupados por outro atendimento ou folga. Use “Só presencial” para os períodos em que você está na academia e “Só online” para os de chamada.</p>
        <div class="booking-week" data-booking-week></div>
      </section>
      <section class="booking-config-section">
        <h3>Tipos de atendimento</h3>
        <p class="booking-help">“Online ou presencial” deixa o aluno escolher como prefere.</p>
        <div class="booking-service-list" data-booking-services></div>
        <button class="button button--secondary" type="button" data-booking-add-service>+ Tipo de atendimento</button>
      </section>
      <section class="booking-config-section">
        <h3>Quanto cada plano dá direito por mês</h3>
        <p class="booking-help">“—” = o aluno desse plano não agenda este atendimento pelo app (você ainda pode marcar para ele). Treinos presenciais costumam ficar “—” e ser vendidos à parte.</p>
        <div class="booking-quota-wrap"><table class="booking-quota-table" data-booking-quotas></table></div>
      </section>
      <section class="booking-config-section">
        <h3>Folgas, férias e feriados</h3>
        <div class="booking-block-list" data-booking-blocks></div>
        <button class="button button--secondary" type="button" data-booking-add-block>+ Folga</button>
      </section>
      <p role="status" data-booking-config-status></p>
    </div>
    <footer><button class="button button--secondary" type="button" data-booking-close>Cancelar</button>
      <button class="button button--primary" type="submit">Salvar agenda</button></footer>
  </form>`
  document.body.append(dialog)
  dialog.querySelectorAll('[data-booking-close]').forEach((button) =>
    button.addEventListener('click', () => dialog.close()),
  )
  dialog.querySelector('[data-booking-add-service]').addEventListener('click', () => {
    dialog.querySelector('[data-booking-services]').append(serviceRow())
    paintQuotaTable()
  })
  dialog.querySelector('[data-booking-add-block]').addEventListener('click', () =>
    dialog.querySelector('[data-booking-blocks]').append(blockRow()),
  )
  dialog.querySelector('form').addEventListener('submit', submitConfig)
  return dialog
}

function switchRow(name, label, hint, checked) {
  const wrap = el('label', 'booking-switch')
  const input = el('input')
  input.type = 'checkbox'
  input.name = name
  input.checked = checked
  const text = el('span')
  text.append(el('strong', '', label), el('small', '', hint))
  wrap.append(input, text)
  return wrap
}

function fillDialog() {
  const box = ensureDialog()
  const s = config.settings
  box.querySelector('[data-booking-switches]').replaceChildren(
    switchRow('enabled', 'Alunos podem agendar pelo app', 'Mostra o botão “Agendar atendimento” na área do aluno.', s.enabled),
    switchRow('autoConfirm', 'Confirmar automaticamente', 'Desligado: cada pedido fica “Aguardando confirmação” até você aceitar.', s.autoConfirm),
  )
  box.querySelector('[data-booking-rules-grid]').replaceChildren(
    field('Antecedência mínima (horas)', numberInput('minNoticeHours', s.minNoticeHours, 0, 168), 'Ex.: 12 = o aluno não marca para daqui a menos de 12h.'),
    field('Cancelar até (horas antes)', numberInput('cancelHours', s.cancelHours, 0, 168), 'Depois disso, só falando com você.'),
    field('Agenda aberta por (dias)', numberInput('horizonDays', s.horizonDays, 7, 90), 'Até quantos dias à frente o aluno vê.'),
  )
  const address = el('input')
  address.name = 'defaultAddress'
  address.value = s.defaultAddress || ''
  address.placeholder = 'Academia, rua e número'
  const meeting = el('input')
  meeting.name = 'defaultMeetingUrl'
  meeting.type = 'url'
  meeting.value = s.defaultMeetingUrl || ''
  meeting.placeholder = 'https://meet.google.com/xxx-xxxx-xxx'
  box.querySelector('[data-booking-defaults]').replaceChildren(
    field('Endereço dos atendimentos presenciais', address),
    field('Link fixo da sua sala de vídeo', meeting, 'Google Meet, Zoom ou outro. Vai em todo atendimento online (você pode trocar em cada um).'),
  )
  const week = box.querySelector('[data-booking-week]')
  week.replaceChildren(
    ...WEEK_ORDER.map((weekday) =>
      dayBlock(weekday, config.rules.filter((rule) => rule.weekday === weekday)),
    ),
  )
  box.querySelector('[data-booking-services]').replaceChildren(...config.services.map((service) => serviceRow(service)))
  paintQuotaTable(config.quotas)
  box.querySelector('[data-booking-blocks]').replaceChildren(...config.blocks.map((block) => blockRow(block)))
  box.querySelector('[data-booking-config-status]').textContent = ''
}

async function submitConfig(event) {
  event.preventDefault()
  const form = event.currentTarget
  const status = dialog.querySelector('[data-booking-config-status]')
  const button = form.querySelector('[type="submit"]')
  const rules = []
  let invalid = ''
  dialog.querySelectorAll('.booking-day-config').forEach((day) => {
    day.querySelectorAll('.booking-rule').forEach((row) => {
      const startMin = toMinutes(row.querySelector('[data-role="start"]').value)
      const endMin = toMinutes(row.querySelector('[data-role="end"]').value)
      if (endMin <= startMin) invalid = `Em ${WEEKDAYS[Number(day.dataset.weekday)]}, o fim da faixa precisa ser depois do início.`
      rules.push({
        weekday: Number(day.dataset.weekday),
        startMin,
        endMin,
        modality: row.querySelector('[data-role="modality"]').value,
      })
    })
  })
  const services = [...dialog.querySelectorAll('.booking-service-row')].map((row) => ({
    id: row.dataset.id || null,
    key: row.dataset.key,
    name: row.querySelector('[name="name"]').value,
    modality: row.querySelector('[name="modality"]').value,
    durationMin: Number(row.querySelector('[name="duration"]').value),
    description: row.querySelector('[name="description"]').value,
    active: row.querySelector('[name="active"]').checked,
  }))
  if (services.some((service) => !service.name.trim())) invalid = 'Dê um nome a cada tipo de atendimento.'
  // Tipos novos ganham um id aqui para a cota por plano apontar para eles.
  services.forEach((service) => {
    if (!service.id) service.id = crypto.randomUUID().replace(/-/gu, '')
  })
  const idByKey = new Map(services.map((service) => [service.key, service.id]))
  const quotas = [...dialog.querySelectorAll('[data-quota-plan]')]
    .map((select) => ({
      planCode: select.dataset.quotaPlan,
      serviceId: idByKey.get(select.dataset.quotaService),
      perMonth: Number(select.value),
    }))
    .filter((quota) => quota.serviceId && quota.perMonth !== 0)
  const blocks = [...dialog.querySelectorAll('.booking-block-row')]
    .map((row) => {
      const start = row.querySelector('[data-role="start"]').value
      const end = row.querySelector('[data-role="end"]').value || start
      if (!start) return null
      const startsAt = new Date(`${start}T00:00:00`)
      const endsAt = new Date(new Date(`${end}T00:00:00`).getTime() + 86_400_000)
      return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason: row.querySelector('[data-role="reason"]').value }
    })
    .filter(Boolean)
  if (invalid) {
    status.textContent = invalid
    return
  }
  const formEl = dialog.querySelector('form')
  const payload = {
    settings: {
      enabled: formEl.elements.enabled.checked,
      autoConfirm: formEl.elements.autoConfirm.checked,
      minNoticeHours: Number(formEl.elements.minNoticeHours.value),
      cancelHours: Number(formEl.elements.cancelHours.value),
      horizonDays: Number(formEl.elements.horizonDays.value),
      defaultAddress: formEl.elements.defaultAddress.value,
      defaultMeetingUrl: formEl.elements.defaultMeetingUrl.value,
    },
    services: services.map(({ key, ...service }) => service),
    quotas,
    rules,
    blocks,
  }
  button.disabled = true
  button.textContent = 'Salvando…'
  status.textContent = ''
  try {
    const saved = await saveBookingConfig(payload)
    config = { ...saved, plans: config.plans }
    window.dispatchEvent(new CustomEvent('farisa:booking-config', { detail: config }))
    dialog.close()
    showToast(
      payload.settings.enabled
        ? 'Agenda salva. Os alunos já podem agendar pelo app.'
        : 'Agenda salva. O agendamento pelo aluno está desligado.',
    )
  } catch (error) {
    status.textContent = error.message
  } finally {
    button.disabled = false
    button.textContent = 'Salvar agenda'
  }
}

export async function openBookingConfig() {
  const loaded = await loadBookingConfig(true)
  if (!loaded) {
    showToast('Não foi possível abrir a configuração da agenda. Confira se a migração 023 foi aplicada.')
    return
  }
  fillDialog()
  dialog.showModal()
}

export function initAgendaSettings() {
  enhanceAppointmentForm()
  document.querySelectorAll('[data-agenda-config]').forEach((button) =>
    button.addEventListener('click', () => void openBookingConfig()),
  )
  // Carrega a configuração quando o painel já tem sessão.
  const tryLoad = () => {
    if (!config && sessionStorage.getItem('farisa-coach-api-token')) void loadBookingConfig()
  }
  window.addEventListener('farisa:data-changed', tryLoad)
  tryLoad()
}
