// Área do aluno: foto/perfil e central de notificações (sininho) no topo
// do painel do aluno.
import {
  WEEKDAYS,
  avatarField,
  createNotificationCenter,
  daysUntil,
  paintAvatar,
  parseDate,
  shortDate,
  timeOf,
} from './profile-kit.js'

let center = null
let latest = null
let options = null
let dialog = null

function ensureTopbar() {
  const card = document.querySelector('.student-access-card--panel')
  if (!card) return null
  let bar = card.querySelector('[data-student-topbar]')
  if (bar) return bar
  bar = document.createElement('div')
  bar.className = 'student-topbar'
  bar.dataset.studentTopbar = ''
  bar.innerHTML = `<button class="student-profile-chip" type="button" data-student-profile-open title="Abrir meu perfil">
      <span class="avatar" data-student-avatar></span>
      <span class="student-profile-chip-text"><strong data-student-chip-name></strong><small>Meu perfil</small></span>
    </button>
    <button class="icon-button notification-button student-bell" type="button" aria-label="Notificações">
      <svg><use href="#icon-bell"></use></svg><span></span>
    </button>`
  const eyebrow = card.querySelector('.eyebrow')
  if (eyebrow) eyebrow.before(bar)
  else card.prepend(bar)
  bar.querySelector('[data-student-profile-open]').addEventListener('click', openProfileDialog)
  center = createNotificationCenter({
    button: bar.querySelector('.student-bell'),
    storageKey: 'farisa-student-notifications-seen',
  })
  return bar
}

function scrollToCheckin() {
  const target = document.getElementById('student-checkin')
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target.querySelector('input')?.focus({ preventScroll: true })
}

function studentNotifications(data) {
  const now = new Date()
  const items = []
  const access = data.access || {}
  const profile = data.profile || {}

  // Pagamento / liberação.
  if (!access.active)
    items.push({
      id: `acesso:${access.status}:${access.paymentStatus}`,
      tone: 'warn',
      icon: '🔓',
      title:
        access.paymentStatus === 'pending'
          ? 'Conclua o pagamento para liberar seu acesso'
          : 'Seu acesso está aguardando liberação do personal',
      detail: `Plano escolhido: ${access.planName || 'Consultoria'}.`,
      href: '#painel-aluno',
    })

  // Plano perto de vencer.
  const expires = access.accessType !== 'permanent' ? parseDate(access.expiresAt) : null
  if (expires) {
    const days = daysUntil(expires, now)
    if (days <= 30) {
      const stage = days < 0 ? 'vencido' : days <= 1 ? '1' : days <= 7 ? '7' : '30'
      items.push({
        id: `vence:${access.expiresAt}:${stage}`,
        tone: days < 0 ? 'danger' : days <= 7 ? 'warn' : 'info',
        icon: '💳',
        title:
          days < 0
            ? `Seu plano venceu em ${shortDate(expires)}`
            : days === 0
              ? 'Seu plano vence hoje'
              : `Seu plano vence em ${days} dia${days === 1 ? '' : 's'}`,
        detail: `Vencimento: ${shortDate(expires)}. Renove com o personal para não perder o acesso.`,
        href: '#painel-aluno',
      })
    }
  }

  // Check-in semanal (planos Premium e Atleta).
  if (access.active && (access.features || []).includes('checkins')) {
    const weekday = Number.isInteger(profile.checkinWeekday) ? profile.checkinWeekday : 1
    const last = parseDate(data.checkins?.[0]?.createdAt)
    const daysSince = last ? -daysUntil(last, now) : null
    const sentThisWeek = daysSince !== null && daysSince < 6
    // Número da semana (conta a partir de um domingo fixo), para o lembrete
    // voltar a aparecer como novo a cada semana.
    const weekKey = Math.floor(daysUntil(now, new Date(2020, 0, 5)) / 7)
    if (!sentThisWeek) {
      if (now.getDay() === weekday)
        items.push({
          id: `checkin-hoje:${weekKey}`,
          tone: 'warn',
          icon: '📝',
          title: 'Hoje é dia do seu check-in semanal',
          detail: 'Conte ao personal como foi sua semana: energia, sono e dores.',
          onClick: scrollToCheckin,
        })
      else if (daysSince === null || daysSince >= 8)
        items.push({
          id: `checkin-atrasado:${weekKey}`,
          tone: 'danger',
          icon: '📝',
          title: 'Seu check-in semanal está atrasado',
          detail: last
            ? `Último envio em ${shortDate(last)}. Seu dia de check-in é ${WEEKDAYS[weekday]}.`
            : `Você ainda não enviou nenhum. Seu dia de check-in é ${WEEKDAYS[weekday]}.`,
          onClick: scrollToCheckin,
        })
      else if ((now.getDay() + 1) % 7 === weekday)
        items.push({
          id: `checkin-amanha:${weekKey}`,
          tone: 'info',
          icon: '📝',
          title: 'Amanhã é dia do seu check-in semanal',
          detail: 'Separe um minutinho para contar como foi a semana.',
          onClick: scrollToCheckin,
        })
    }
  }

  // Resposta do personal no check-in.
  ;(data.checkins || [])
    .filter((checkin) => checkin.trainerFeedback)
    .forEach((checkin) => {
      const created = parseDate(checkin.createdAt)
      if (!created || daysUntil(created, now) < -21) return
      items.push({
        id: `resposta:${checkin.id}:${checkin.trainerFeedback.length}`,
        tone: 'success',
        icon: '💬',
        title: 'O personal respondeu seu check-in',
        detail: checkin.trainerFeedback,
        onClick: scrollToCheckin,
      })
    })

  // Atendimentos marcados (hoje, amanhã e próximos 7 dias).
  ;(data.appointments || []).forEach((appointment) => {
    const start = parseDate(appointment.startsAt)
    if (!start) return
    if (appointment.status === 'cancelled') {
      items.push({
        id: `agenda-cancelada:${appointment.id}`,
        tone: 'danger',
        icon: '⊘',
        title: `O personal cancelou: ${appointment.service}`,
        detail: `Era ${shortDate(start)} às ${timeOf(start)}. Agende outro horário em Minha agenda.`,
        onClick: () =>
          document.querySelector('#student-agenda')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      })
      return
    }
    const days = daysUntil(start, now)
    if (days < 0 || days > 7) return
    if (days === 0 && parseDate(appointment.endsAt) < now) return
    items.push({
      id: `agenda:${appointment.id}:${appointment.startsAt}:${appointment.status}`,
      tone: days === 0 ? 'warn' : 'info',
      icon: appointment.modality === 'online' ? '💻' : '📅',
      title: `${days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : shortDate(start)} às ${timeOf(start)} · ${appointment.service}`,
      detail:
        appointment.status === 'pending'
          ? 'Aguardando confirmação do personal.'
          : appointment.modality === 'online'
            ? 'Online · o botão “Entrar na chamada” aparece em Minha agenda.'
            : appointment.location || 'Atendimento presencial com o personal.',
      onClick: () =>
        document.querySelector('#student-agenda')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    })
  })

  // Ficha nova publicada (últimos 7 dias).
  ;(data.workouts || []).forEach((workout) => {
    const published = parseDate(workout.publishedAt)
    if (!published || daysUntil(published, now) < -7) return
    items.push({
      id: `ficha:${workout.id}:${workout.publishedAt}`,
      tone: 'success',
      icon: '🏋️',
      title: `Nova ficha publicada: ${workout.name}`,
      detail: 'Já está disponível aqui e em PDF.',
      href: '#painel-aluno',
    })
  })

  // Avaliação física nova (últimos 14 dias).
  ;(data.assessments || []).forEach((assessment) => {
    const date = parseDate(assessment.assessedAt)
    if (!date || daysUntil(date, now) < -14) return
    items.push({
      id: `avaliacao:${assessment.id}`,
      tone: 'success',
      icon: '📋',
      title: 'Nova avaliação física disponível',
      detail: `${assessment.protocol || 'Avaliação'} de ${shortDate(date)}.`,
      href: '#painel-aluno',
    })
  })

  // Aniversário.
  const birth = parseDate(profile.birthDate)
  if (birth && birth.getDate() === now.getDate() && birth.getMonth() === now.getMonth())
    items.push({
      id: `aniversario:${now.getFullYear()}`,
      tone: 'success',
      icon: '🎉',
      title: `Feliz aniversário, ${String(data.name || '').split(' ')[0]}!`,
      detail: 'Toda a equipe FARISA deseja um ótimo dia e muitos treinos.',
    })

  const weight = { danger: 0, warn: 1, success: 2, info: 3, neutral: 4 }
  return items.sort((a, b) => weight[a.tone] - weight[b.tone])
}

function openProfileDialog() {
  if (!latest) return
  if (!latest.profile) {
    const status = document.querySelector('[data-student-panel-status]')
    if (status)
      status.textContent =
        'O perfil ainda não está disponível. Avise o personal para atualizar o sistema.'
    return
  }
  if (!dialog) {
    dialog = document.createElement('dialog')
    dialog.className = 'modal profile-modal'
    document.body.append(dialog)
  }
  const data = latest
  const hasCheckins = (data.access?.features || []).includes('checkins')
  dialog.innerHTML = `<form method="dialog">
    <header><div><span class="eyebrow eyebrow--blue">Meu perfil</span><h2>Perfil do aluno</h2></div>
      <button class="icon-button" type="submit" value="cancel" aria-label="Fechar">×</button></header>
    <div class="modal-body">
      <div data-avatar-slot></div>
      <label class="field"><span>Nome</span><input name="name" required maxlength="140"></label>
      <label class="field"><span>E-mail de acesso</span><input name="email" disabled></label>
      <div class="field-grid">
        <label class="field"><span>Telefone / WhatsApp</span><input name="phone" maxlength="30" placeholder="(00) 00000-0000"></label>
        <label class="field"><span>Data de nascimento</span><input name="birthDate" type="date"></label>
      </div>
      <label class="field" ${hasCheckins ? '' : 'hidden'}><span>Dia do meu check-in semanal</span>
        <select name="checkinWeekday">${WEEKDAYS.map((day, index) => `<option value="${index}">${day}</option>`).join('')}</select>
        <small>Nesse dia o sininho lembra você de enviar o check-in.</small></label>
      <p role="status" data-profile-status></p>
    </div>
    <footer><button class="button button--secondary" type="submit" value="cancel">Cancelar</button>
      <button class="button button--primary" type="submit" value="save">Salvar perfil</button></footer>
  </form>`
  const form = dialog.querySelector('form')
  const photo = avatarField(dialog.querySelector('[data-avatar-slot]'), {
    name: data.name,
    avatar: data.profile.avatar,
  })
  form.elements.name.value = data.name || ''
  form.elements.email.value = data.email || ''
  form.elements.phone.value = data.profile.phone || ''
  form.elements.birthDate.value = data.profile.birthDate || ''
  form.elements.checkinWeekday.value = String(data.profile.checkinWeekday ?? 1)
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
      await options.request('profile', {
        name: form.elements.name.value,
        phone: form.elements.phone.value,
        birthDate: form.elements.birthDate.value,
        checkinWeekday: Number(form.elements.checkinWeekday.value),
        ...(avatar === undefined ? {} : { avatar }),
      })
      dialog.close()
      await options.reload()
    } catch (error) {
      status.textContent = error.message
    } finally {
      button.disabled = false
    }
  })
  dialog.showModal()
}

// Chamado pela área do aluno sempre que os dados chegam do servidor.
export function renderStudentExtras(data, { request, reload }) {
  latest = data
  options = { request, reload }
  const bar = ensureTopbar()
  if (!bar) return
  bar.hidden = false
  paintAvatar(bar.querySelector('[data-student-avatar]'), {
    name: data.name,
    avatar: data.profile?.avatar,
  })
  bar.querySelector('[data-student-chip-name]').textContent = data.name || 'Aluno'
  center?.update(studentNotifications(data))
}

export function hideStudentExtras() {
  latest = null
  center?.close()
  center?.update([])
  const bar = document.querySelector('[data-student-topbar]')
  if (bar) bar.hidden = true
}
