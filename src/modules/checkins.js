// Página "Check-ins" do painel do personal: um cartão por check-in semanal,
// com energia/sono em barrinhas, dor em destaque e resposta direto no cartão.
// Também mostra o histórico de check-ins do aluno na página Evolução.
import { getData } from './state.js'
import { saveCheckinFeedback, syncRemoteData } from './api-client.js'
import { showToast } from './utils.js'
import { paintAvatar, parseDate } from './profile-kit.js'
import { allStudentsFolder, emptyLine, normalize, plural } from './student-folders.js'

const dateTime = (date) =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

const tone = (value) => (value >= 4 ? 'good' : value === 3 ? 'mid' : 'low')

// "Dor" preenchida com algo que não seja "não", "nenhuma", "zero"…
function hasPain(text) {
  const clean = String(text || '').trim().toLocaleLowerCase('pt-BR')
  if (!clean) return false
  return !/^(n[aã]o|nenhum[a]?|nada|zero|0|sem dor(es)?|-|ok)\.?$/u.test(clean)
}

function scale(label, value) {
  const row = document.createElement('div')
  row.className = `checkin-scale checkin-scale--${tone(Number(value))}`
  const name = document.createElement('span')
  name.textContent = label
  const bars = document.createElement('span')
  bars.className = 'checkin-scale-bars'
  bars.setAttribute('aria-label', `${label}: ${value} de 5`)
  for (let i = 1; i <= 5; i += 1) {
    const bar = document.createElement('i')
    if (i <= Number(value)) bar.className = 'is-on'
    bars.append(bar)
  }
  const number = document.createElement('strong')
  number.textContent = `${value}/5`
  row.append(name, bars, number)
  return row
}

const studentOf = (checkin) =>
  (getData().students || []).find(
    (student) =>
      String(student.id) === String(checkin.studentId) || student.name === checkin.student,
  )

function checkinCard(checkin, { compact = false } = {}) {
  const card = document.createElement('article')
  card.className = `checkin-card${checkin.trainerFeedback ? ' is-answered' : ''}`
  card.dataset.checkinId = checkin.id

  const head = document.createElement('header')
  const avatar = document.createElement('span')
  avatar.className = 'avatar'
  const student = studentOf(checkin)
  paintAvatar(avatar, { name: checkin.student, avatar: student?.avatar })
  const who = document.createElement('div')
  const name = document.createElement('strong')
  name.textContent = checkin.student
  const when = document.createElement('small')
  const created = parseDate(checkin.createdAt)
  when.textContent = created ? dateTime(created) : ''
  who.append(name, when)
  const status = document.createElement('span')
  status.className = `checkin-status ${checkin.trainerFeedback ? 'checkin-status--done' : 'checkin-status--wait'}`
  status.textContent = checkin.trainerFeedback ? 'Respondido' : 'Aguardando resposta'
  head.append(...(compact ? [who, status] : [avatar, who, status]))

  const scales = document.createElement('div')
  scales.className = 'checkin-scales'
  scales.append(scale('Energia', checkin.energy), scale('Sono', checkin.sleep))

  card.append(head, scales)

  if (hasPain(checkin.pain)) {
    const pain = document.createElement('p')
    pain.className = 'checkin-pain'
    pain.textContent = `⚠ Dor ou desconforto: ${checkin.pain}`
    card.append(pain)
  } else if (checkin.pain) {
    const pain = document.createElement('p')
    pain.className = 'checkin-note-line'
    pain.textContent = `Dor ou desconforto: ${checkin.pain}`
    card.append(pain)
  }

  const week = document.createElement('blockquote')
  week.className = 'checkin-week'
  week.textContent = checkin.notes || 'O aluno não escreveu sobre a semana.'
  if (!checkin.notes) week.classList.add('is-empty')
  card.append(week)

  // Resposta do personal.
  const form = document.createElement('form')
  form.className = 'checkin-reply'
  const label = document.createElement('label')
  label.className = 'field'
  label.innerHTML = '<span>Sua resposta para o aluno</span>'
  const textarea = document.createElement('textarea')
  textarea.name = 'feedback'
  textarea.rows = compact ? 2 : 3
  textarea.maxLength = 2000
  textarea.placeholder = 'Ex.: Ótima semana! Vamos manter a carga e cuidar do sono.'
  textarea.defaultValue = checkin.trainerFeedback || ''
  label.append(textarea)
  const actions = document.createElement('div')
  actions.className = 'checkin-reply-actions'
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'button button--primary'
  save.textContent = checkin.trainerFeedback ? 'Atualizar resposta' : 'Enviar resposta'
  const hint = document.createElement('small')
  hint.textContent = 'O aluno vê a resposta na área dele e recebe um aviso no sininho.'
  actions.append(save, hint)
  form.append(label, actions)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const text = textarea.value.trim()
    if (!text) {
      textarea.focus()
      hint.textContent = 'Escreva uma resposta antes de enviar.'
      return
    }
    save.disabled = true
    save.textContent = 'Enviando…'
    try {
      await saveCheckinFeedback(checkin.id, text)
      // Já salvo: deixa de contar como "digitando" para a lista se atualizar.
      textarea.defaultValue = text
      textarea.blur()
      await syncRemoteData()
      showToast(`Resposta enviada para ${checkin.student}.`)
    } catch (error) {
      hint.textContent = error.message
      save.disabled = false
      save.textContent = checkin.trainerFeedback ? 'Atualizar resposta' : 'Enviar resposta'
    }
  })
  card.append(form)
  return card
}

// Um bloco por aluno: o check-in mais recente fica à vista e os anteriores
// ficam guardados numa lista que abre ao clicar (e continua aberta quando a
// página se atualiza sozinha).
const openHistories = new Set()
function studentBlock(items, { compact = false, key } = {}) {
  const block = document.createElement('section')
  block.className = 'checkin-student'
  const [latest, ...older] = items
  block.append(checkinCard(latest, { compact }))
  if (older.length) {
    const history = document.createElement('details')
    history.className = 'checkin-history'
    history.open = openHistories.has(key)
    history.addEventListener('toggle', () => {
      if (history.open) openHistories.add(key)
      else openHistories.delete(key)
    })
    const summary = document.createElement('summary')
    const pending = older.filter((item) => !item.trainerFeedback).length
    summary.textContent = `Check-ins anteriores de ${latest.student} (${older.length})`
    if (pending) {
      const mark = document.createElement('b')
      mark.textContent = ` · ${pending} sem resposta`
      summary.append(mark)
    }
    const list = document.createElement('div')
    list.className = 'checkin-history-list'
    list.append(...older.map((item) => checkinCard(item, { compact: true })))
    history.append(summary, list)
    block.append(history)
  }
  return block
}

function groupByStudent(checkins) {
  const groups = new Map()
  checkins.forEach((checkin) => {
    const key = String(checkin.studentId || checkin.student)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(checkin)
  })
  // Mais recente primeiro dentro de cada aluno; alunos pelo check-in mais novo.
  const time = (item) => parseDate(item.createdAt)?.getTime() || 0
  return [...groups.entries()]
    .map(([key, items]) => [key, items.sort((a, b) => time(b) - time(a))])
    .sort((a, b) => time(b[1][0]) - time(a[1][0]))
}

// Não redesenha enquanto você digita uma resposta (a lista se atualiza sozinha).
function isTyping(container) {
  const active = document.activeElement
  if (active && container.contains(active) && active.tagName === 'TEXTAREA') return true
  return [...container.querySelectorAll('textarea')].some(
    (field) => field.value !== field.defaultValue,
  )
}

let checkinAllOpen = false
const openCheckinStudents = new Set()

function renderCheckinsPage() {
  const list = document.querySelector('[data-checkin-list]')
  const statusFilter = document.querySelector('[data-checkin-filter-status]')
  if (!list || !statusFilter) return
  if (isTyping(list)) return
  const checkins = getData().checkins || []
  const query = normalize(document.querySelector('[data-checkin-search]')?.value)
  const status = statusFilter.value
  const visible = checkins.filter(
    (checkin) =>
      (!query || normalize(checkin.student).includes(query)) &&
      (status === 'all' ||
        (status === 'pending' && !checkin.trainerFeedback) ||
        (status === 'answered' && checkin.trainerFeedback)),
  )
  const groups = groupByStudent(visible)
  const waiting = visible.filter((checkin) => !checkin.trainerFeedback).length
  const { folder, body } = allStudentsFolder({
    meta: `${plural(groups.length, 'aluno', 'alunos')} · ${plural(visible.length, 'check-in', 'check-ins')}${waiting ? ` · ${waiting} aguardando resposta` : ''}`,
    open: Boolean(query) || checkinAllOpen,
    onToggle: (open) => {
      if (!query) checkinAllOpen = open
    },
  })
  list.replaceChildren(folder)
  if (!groups.length) {
    body.append(
      emptyLine(
        query
          ? 'Nenhum check-in encontrado para essa busca.'
          : status === 'pending'
            ? 'Nenhum check-in aguardando resposta. Tudo em dia! 🎉'
            : 'Nenhum check-in por aqui ainda.',
      ),
    )
    return
  }
  body.append(
    ...groups.map(([key, items]) => {
      const group = document.createElement('details')
      group.className = 'assessment-group checkin-group'
      group.open = Boolean(query) || openCheckinStudents.has(key)
      group.addEventListener('toggle', () => {
        if (query) return
        if (group.open) openCheckinStudents.add(key)
        else openCheckinStudents.delete(key)
      })
      const summary = document.createElement('summary')
      const avatar = document.createElement('span')
      avatar.className = 'avatar'
      paintAvatar(avatar, { name: items[0].student, avatar: studentOf(items[0])?.avatar })
      const info = document.createElement('div')
      info.className = 'assessment-group-info'
      const name = document.createElement('strong')
      name.textContent = items[0].student
      const meta = document.createElement('small')
      const pending = items.filter((item) => !item.trainerFeedback).length
      const last = parseDate(items[0].createdAt)
      meta.textContent = `${plural(items.length, 'check-in', 'check-ins')}${last ? ` · último em ${last.toLocaleDateString('pt-BR')}` : ''}`
      info.append(name, meta)
      summary.append(avatar, info)
      if (pending) {
        const badge = document.createElement('span')
        badge.className = 'checkin-status checkin-status--wait'
        badge.textContent = `${pending} sem resposta`
        summary.append(badge)
      }
      const inner = document.createElement('div')
      inner.className = 'checkin-list checkin-list--single checkin-group-body'
      inner.append(studentBlock(items, { key: `page:${key}` }))
      group.append(summary, inner)
      return group
    }),
  )
}

function paintMenuCount() {
  const badge = document.querySelector('[data-checkin-count]')
  if (!badge) return
  const pending = (getData().checkins || []).filter((checkin) => !checkin.trainerFeedback).length
  badge.hidden = pending === 0
  badge.textContent = String(pending)
  badge.title = `${pending} check-in(s) aguardando resposta`
}

// Evolução: histórico de check-ins do aluno escolhido.
function renderProgressCheckins() {
  const page = document.querySelector('[data-route="evolucao"]')
  const select = document.querySelector('[data-progress-student]')
  if (!page || !select) return
  let panel = page.querySelector('[data-progress-checkins]')
  if (!panel) {
    panel = document.createElement('article')
    panel.className = 'panel progress-checkins'
    panel.dataset.progressCheckins = ''
    page.append(panel)
  }
  if (isTyping(panel)) return
  const name = select.value
  const student = (getData().students || []).find((item) => item.name === name)
  const history = (getData().checkins || []).filter(
    (checkin) =>
      checkin.student === name || (student && String(checkin.studentId) === String(student.id)),
  )
  const heading = document.createElement('div')
  heading.className = 'panel-heading'
  heading.innerHTML = '<div><h2>Check-ins semanais</h2><p></p></div>'
  heading.querySelector('p').textContent = history.length
    ? `${history.length} check-in(s) de ${name || 'aluno'}. O mais recente fica à vista; os anteriores ficam guardados logo abaixo.`
    : `${name || 'Este aluno'} ainda não enviou check-in.`
  const list = document.createElement('div')
  list.className = 'checkin-list checkin-list--single'
  if (history.length)
    list.append(
      studentBlock(groupByStudent(history)[0][1], {
        compact: true,
        key: `progress:${student?.id || name}`,
      }),
    )
  panel.replaceChildren(heading, list)
}

export function initCheckins() {
  const refresh = () => {
    paintMenuCount()
    renderCheckinsPage()
    renderProgressCheckins()
  }
  document.querySelector('[data-checkin-filter-status]')?.addEventListener('change', () => {
    document.querySelector('[data-checkin-list]')?.replaceChildren()
    renderCheckinsPage()
  })
  document.querySelector('[data-checkin-search]')?.addEventListener('input', () => {
    document.querySelector('[data-checkin-list]')?.replaceChildren()
    renderCheckinsPage()
  })
  document.querySelector('[data-progress-student]')?.addEventListener('change', () => {
    document.querySelector('[data-progress-checkins]')?.replaceChildren()
    renderProgressCheckins()
  })
  window.addEventListener('farisa:data-changed', refresh)
  refresh()
}
