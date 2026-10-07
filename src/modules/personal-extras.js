// Painel do personal: perfil (topo à direita), cartão do plano (quantos
// alunos cabem) e central de notificações (sininho).
import { getData } from './state.js'
import { saveTrainerProfile, syncRemoteData } from './api-client.js'
import { showToast } from './utils.js'
import {
  avatarField,
  createNotificationCenter,
  daysUntil,
  paintAvatar,
  parseDate,
  sameDay,
  shortDate,
  timeOf,
} from './profile-kit.js'

const DEFAULT_LIMIT = 60

const profileOf = () => getData().profile || null

// Alunos que ocupam vaga: todos, menos os cancelados.
const countedStudents = () =>
  (getData().students || []).filter((student) => student.accessStatus !== 'cancelled')

/* ------------------------------------------------------------------ */
/* Topo: foto e nome                                                   */
/* ------------------------------------------------------------------ */

function paintTopbar() {
  const box = document.querySelector('.topbar .profile')
  if (!box) return
  const profile = profileOf()
  const name = profile?.name || box.querySelector('strong')?.textContent || 'Personal'
  paintAvatar(box.querySelector('.avatar'), { name, avatar: profile?.avatar })
  box.querySelector('strong').textContent = name
  box.querySelector('small').textContent = profile?.cref
    ? `Personal trainer · CREF ${profile.cref}`
    : 'Personal trainer'
}

/* ------------------------------------------------------------------ */
/* Cartão do plano                                                     */
/* ------------------------------------------------------------------ */

// Limite de alunos do plano; 0 no plano = sem limite.
const limitOf = (profile) =>
  profile?.planManaged ? Number(profile.studentLimit) || Infinity : Number(profile?.studentLimit) || DEFAULT_LIMIT

function paintCapacity() {
  const card = document.querySelector('.sidebar .capacity')
  if (!card) return
  const profile = profileOf()
  const limit = limitOf(profile)
  const total = countedStudents().length
  if (!Number.isFinite(limit)) {
    card.querySelector('span').textContent = profile?.planName || 'Plano'
    card.querySelector('small').textContent = `${total} aluno(s) · sem limite`
    const meter = card.querySelector('progress, .meter span, .capacity-bar span')
    if (meter?.tagName === 'PROGRESS') meter.value = 0
    else if (meter) meter.style.width = '0%'
    card.classList.remove('capacity--warn', 'capacity--full')
    return
  }
  const free = Math.max(0, limit - total)
  const ratio = total / limit
  card.querySelector('span').textContent = profile?.planName || 'Plano profissional'
  card.querySelector('small').textContent =
    total >= limit
      ? `${total} de ${limit} alunos · plano completo`
      : `${total} de ${limit} alunos · ${free === 1 ? 'falta 1 vaga' : `faltam ${free} vagas`}`
  const bar = card.querySelector('progress')
  bar.max = limit
  bar.value = Math.min(total, limit)
  bar.textContent = `${total} de ${limit}`
  card.classList.toggle('capacity--warn', ratio >= 0.9 && ratio < 1)
  card.classList.toggle('capacity--full', ratio >= 1)
}

/* ------------------------------------------------------------------ */
/* Janela de perfil                                                    */
/* ------------------------------------------------------------------ */

let profileDialog = null

function openProfileDialog(focusField) {
  const profile = profileOf()
  if (!profile) {
    showToast('Perfil indisponível: rode a migração 018 do banco (npm run dev faz isso sozinho).')
    return
  }
  if (!profileDialog) {
    profileDialog = document.createElement('dialog')
    profileDialog.className = 'modal profile-modal'
    document.body.append(profileDialog)
  }
  profileDialog.innerHTML = `<form method="dialog" data-trainer-profile>
    <header><div><span class="eyebrow eyebrow--blue">Meu perfil</span><h2>Perfil do personal</h2></div>
      <button class="icon-button" type="submit" value="cancel" formnovalidate aria-label="Fechar">×</button></header>
    <div class="modal-body">
      <div data-avatar-slot></div>
      <label class="field"><span>Nome</span><input name="name" required maxlength="120"></label>
      <label class="field"><span>E-mail de acesso</span><input name="email" disabled></label>
      <div class="field-grid">
        <label class="field"><span>Telefone / WhatsApp</span><input name="phone" maxlength="30" placeholder="(00) 00000-0000"></label>
        <label class="field"><span>CREF</span><input name="cref" maxlength="30" placeholder="000000-G/UF"></label>
      </div>
      <label class="field"><span>Sobre você</span><textarea name="bio" rows="3" maxlength="500" placeholder="Formação, especialidades…"></textarea></label>
      <div class="profile-plan-fields">
        <strong>Plano e vagas</strong>
        <small data-capacity-hint></small>
        <a href="#assinatura" data-plan-link>Ver minha assinatura e mudar de plano →</a>
      </div>
      <p role="status" data-profile-status></p>
    </div>
    <footer><button class="button button--secondary" type="submit" value="cancel" formnovalidate>Cancelar</button>
      <button class="button button--primary" type="submit" value="save">Salvar perfil</button></footer>
  </form>`
  const form = profileDialog.querySelector('form')
  const photo = avatarField(profileDialog.querySelector('[data-avatar-slot]'), profile)
  form.elements.name.value = profile.name || ''
  form.elements.email.value = profile.email || ''
  form.elements.phone.value = profile.phone || ''
  form.elements.cref.value = profile.cref || ''
  form.elements.bio.value = profile.bio || ''
  const hint = form.querySelector('[data-capacity-hint]')
  const paintHint = () => {
    const total = countedStudents().length
    const limit = limitOf(profile)
    hint.textContent = Number.isFinite(limit)
      ? `${profile.planName || 'Plano'}: ${total} de ${limit} alunos.`
      : `${profile.planName || 'Plano'}: ${total} aluno(s), sem limite.`
  }
  paintHint()
  form.querySelector('[data-plan-link]').addEventListener('click', () => profileDialog.close())
  form.elements.name.addEventListener('input', () => photo.setName(form.elements.name.value))
  form.addEventListener('submit', async (event) => {
    if (event.submitter?.value !== 'save') return
    event.preventDefault()
    if (!form.reportValidity()) return
    const status = form.querySelector('[data-profile-status]')
    const button = event.submitter
    button.disabled = true
    status.textContent = 'Salvando…'
    try {
      const avatar = photo.value()
      await saveTrainerProfile({
        name: form.elements.name.value,
        phone: form.elements.phone.value,
        cref: form.elements.cref.value,
        bio: form.elements.bio.value,
        ...(avatar === undefined ? {} : { avatar }),
      })
      await syncRemoteData()
      profileDialog.close()
      showToast('Perfil atualizado.')
    } catch (error) {
      status.textContent = error.message
    } finally {
      button.disabled = false
    }
  })
  profileDialog.showModal()
  if (focusField) form.elements[focusField]?.focus()
}

/* ------------------------------------------------------------------ */
/* Notificações do personal                                            */
/* ------------------------------------------------------------------ */

function trainerNotifications() {
  const data = getData()
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 86_400_000)
  const students = data.students || []
  const byId = new Map(students.map((student) => [String(student.id), student]))
  const items = []

  // Alunos que ajustaram a carga de algum exercício nos últimos 7 dias.
  ;(data.workouts || []).forEach((workout) => {
    let list = workout.exercisePrescriptions
    if (!Array.isArray(list)) {
      try {
        list = JSON.parse(workout.exercisePrescriptionsJson || '[]')
      } catch {
        list = []
      }
    }
    const changed = list.filter(
      (item) => item.loadBy === 'student' && item.loadAt && now - new Date(item.loadAt) < 7 * 86_400_000,
    )
    if (!changed.length) return
    const latest = changed.map((item) => item.loadAt).sort().pop()
    items.push({
      id: `carga:${workout.id}:${latest}`,
      tone: 'info',
      icon: '🏋️',
      title: `${workout.student || 'Aluno'} ajustou ${changed.length === 1 ? 'a carga de 1 exercício' : `a carga de ${changed.length} exercícios`}`,
      detail: `${workout.name} · ${changed
        .slice(0, 3)
        .map((item) => `${item.name}: ${item.load}`)
        .join(' · ')}`,
      href: '#treinos',
    })
  })

  // Recados que os alunos deixaram ao concluir o treino (últimos 7 dias).
  ;(data.trainingNotes || [])
    .filter((item) => item.note && now - new Date(item.createdAt) < 7 * 86_400_000)
    .slice(0, 10)
    .forEach((item) => {
      const [, month, day] = String(item.day || '').split('-')
      items.push({
        id: `recado:${item.studentId}:${item.day}:${item.createdAt}`,
        tone: 'info',
        icon: '💬',
        title: `${item.student || 'Aluno'} concluiu o treino${day ? ` de ${day}/${month}` : ''} e deixou um recado`,
        detail: item.note,
        href: '#alunos',
      })
    })

  // Um aluno tentou entrar pela página e o plano estava cheio (últimos 7 dias).
  const blockedDay = window.farisaBilling?.seatBlockedAt
  if (blockedDay)
    items.push({
      id: `vaga:${blockedDay}`,
      tone: 'warn',
      icon: '🚪',
      title: 'Um aluno tentou se cadastrar e não havia vaga',
      detail: 'Seu plano está cheio. Abra uma vaga ou assine o Ilimitado para não perder alunos.',
      href: '#assinatura',
    })

  // Agenda de hoje e de amanhã.
  ;(data.appointments || [])
    .filter((item) => item.status === 'scheduled')
    .map((item) => ({ item, start: parseDate(item.startsAt) }))
    .filter(({ start }) => start && (sameDay(start, now) || sameDay(start, tomorrow)))
    .sort((a, b) => a.start - b.start)
    .forEach(({ item, start }) => {
      const today = sameDay(start, now)
      if (today && parseDate(item.endsAt) < now) return
      items.push({
        id: `agenda:${item.id}:${item.startsAt}`,
        tone: today ? 'info' : 'neutral',
        icon: '📅',
        title: `${today ? 'Hoje' : 'Amanhã'} às ${timeOf(start)} · ${item.student}`,
        detail: [item.service, item.modality === 'online' ? 'Online' : item.location]
          .filter(Boolean)
          .join(' · '),
        href: '#agenda',
      })
    })

  // Pedidos de agendamento feitos pelo aluno (aguardando sua confirmação).
  ;(data.appointments || [])
    .filter((item) => item.status === 'pending')
    .forEach((item) => {
      const start = parseDate(item.startsAt)
      if (!start || start < now) return
      items.push({
        id: `pedido:${item.id}`,
        tone: 'warn',
        icon: '🗓️',
        title: `${item.student} pediu ${item.service}`,
        detail: `${shortDate(start)} às ${timeOf(start)} · ${item.modality === 'online' ? 'Online' : 'Presencial'} · Confirme ou recuse na Agenda.`,
        href: '#agenda',
      })
    })

  // Alunos esperando liberação de acesso.
  students
    .filter(
      (student) =>
        student.accessStatus !== 'cancelled' &&
        (student.accessStatus !== 'active' ||
          !['paid', 'waived'].includes(student.paymentStatus)),
    )
    .forEach((student) =>
      items.push({
        id: `liberar:${student.id}:${student.accessStatus}:${student.paymentStatus}`,
        tone: 'warn',
        icon: '🔓',
        title: `${student.name} aguarda liberação`,
        detail:
          student.paymentStatus === 'pending'
            ? 'Pagamento pendente. Confirme o pagamento ou use "Liberar acesso".'
            : 'Acesso ainda não liberado.',
        href: '#alunos',
      }),
    )

  // Planos vencendo em até 30 dias (ou já vencidos).
  students
    .filter(
      (student) =>
        student.accessStatus === 'active' &&
        student.accessType !== 'permanent' &&
        student.accessExpiresAt,
    )
    .forEach((student) => {
      const expires = parseDate(student.accessExpiresAt)
      if (!expires) return
      const days = daysUntil(expires, now)
      if (days > 30) return
      const stage = days < 0 ? 'vencido' : days <= 1 ? '1' : days <= 7 ? '7' : '30'
      items.push({
        id: `vence:${student.id}:${student.accessExpiresAt}:${stage}`,
        tone: days < 0 ? 'danger' : days <= 7 ? 'warn' : 'info',
        icon: '💳',
        title:
          days < 0
            ? `Plano de ${student.name} venceu em ${shortDate(expires)}`
            : days === 0
              ? `Plano de ${student.name} vence hoje`
              : `Plano de ${student.name} vence em ${days} dia${days === 1 ? '' : 's'}`,
        detail: `Vencimento: ${shortDate(expires)}. Combine a renovação com o aluno.`,
        href: '#alunos',
      })
    })

  // Check-ins recebidos nos últimos 14 dias e ainda sem resposta.
  ;(data.checkins || [])
    .filter((checkin) => !checkin.trainerFeedback)
    .forEach((checkin) => {
      const created = parseDate(checkin.createdAt)
      if (!created || daysUntil(created, now) < -14) return
      items.push({
        id: `checkin:${checkin.id}`,
        tone: 'info',
        icon: '📝',
        title: `${checkin.student} enviou o check-in semanal`,
        detail: `Energia ${checkin.energy}/5 · Sono ${checkin.sleep}/5${checkin.pain ? ` · Dor: ${checkin.pain}` : ''} · ${shortDate(created)}`,
        href: '#checkins',
      })
    })

  // Alunos ativos sem ficha publicada.
  const withWorkout = new Set(
    (data.workouts || [])
      .filter((workout) => workout.publishedAt)
      .map((workout) => String(workout.studentId || workout.student)),
  )
  students
    .filter(
      (student) =>
        student.accessStatus === 'active' &&
        student.planCode !== 'ready' &&
        !withWorkout.has(String(student.id)) &&
        !withWorkout.has(student.name),
    )
    .forEach((student) =>
      items.push({
        id: `ficha:${student.id}`,
        tone: 'warn',
        icon: '🏋️',
        title: `${student.name} ainda não tem ficha publicada`,
        detail: 'Monte e publique a ficha para o aluno começar a treinar.',
        href: '#treinos',
      }),
    )

  // Reavaliação: ativos sem avaliação nos últimos 90 dias.
  const lastAssessment = new Map()
  ;(data.assessments || []).forEach((assessment) => {
    const date = parseDate(assessment.assessedAt)
    const key = String(assessment.studentId || assessment.student)
    if (date && (!lastAssessment.get(key) || date > lastAssessment.get(key)))
      lastAssessment.set(key, date)
  })
  const overdue = students.filter((student) => {
    if (student.accessStatus !== 'active' || !['basic', 'premium', 'athlete'].includes(student.planCode))
      return false
    const last = lastAssessment.get(String(student.id)) || lastAssessment.get(student.name)
    return !last || daysUntil(last, now) < -90
  })
  if (overdue.length)
    items.push({
      id: `avaliacao:${overdue.map((student) => student.id).sort().join(',')}:${now.getFullYear()}-${now.getMonth()}`,
      tone: 'neutral',
      icon: '📋',
      title:
        overdue.length === 1
          ? `${overdue[0].name} está sem avaliação há mais de 90 dias`
          : `${overdue.length} alunos sem avaliação há mais de 90 dias`,
      detail: overdue.slice(0, 4).map((student) => student.name).join(', ') + (overdue.length > 4 ? '…' : ''),
      href: '#avaliacoes',
    })

  // Vagas do plano.
  const profile = profileOf()
  const limit = limitOf(profile)
  const total = countedStudents().length
  if (total >= limit * 0.9)
    items.push({
      id: `vagas:${total}:${limit}`,
      tone: total >= limit ? 'danger' : 'warn',
      icon: '👥',
      title: total >= limit ? 'Seu plano está completo' : `Restam ${limit - total} vaga(s) no seu plano`,
      detail: `${total} de ${limit} alunos. Veja as opções em Minha assinatura.`,
      onClick: () => { location.hash = '#assinatura' },
    })

  const weight = { danger: 0, warn: 1, info: 2, neutral: 3 }
  return items.sort((a, b) => weight[a.tone] - weight[b.tone])
}

/* ------------------------------------------------------------------ */

export function initPersonalExtras() {
  const bell = document.querySelector('.topbar .notification-button')
  const center = bell
    ? createNotificationCenter({ button: bell, storageKey: 'farisa-personal-notifications-seen' })
    : null

  const profileBox = document.querySelector('.topbar .profile')
  if (profileBox) {
    profileBox.setAttribute('role', 'button')
    profileBox.tabIndex = 0
    profileBox.title = 'Abrir meu perfil'
    profileBox.classList.add('profile--clickable')
    profileBox.addEventListener('click', () => openProfileDialog())
    profileBox.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openProfileDialog()
      }
    })
  }
  const capacity = document.querySelector('.sidebar .capacity')
  if (capacity) {
    capacity.setAttribute('role', 'button')
    capacity.tabIndex = 0
    capacity.title = 'Ver minha assinatura'
    capacity.classList.add('capacity--clickable')
    capacity.addEventListener('click', () => { location.hash = '#assinatura' })
    capacity.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        location.hash = '#assinatura'
      }
    })
  }

  const refresh = () => {
    paintTopbar()
    paintCapacity()
    center?.update(trainerNotifications())
  }
  window.addEventListener('farisa:data-changed', refresh)
  window.addEventListener('farisa:billing-loaded', refresh)
  // A agenda muda com o relógio (atendimento que já passou, virada do dia).
  window.setInterval(refresh, 5 * 60_000)
  refresh()
}
