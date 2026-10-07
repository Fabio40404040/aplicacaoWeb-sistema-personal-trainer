import {
  deleteExerciseVideo,
  deleteMuscleGroup,
  loadExerciseGifFrame,
  loadExerciseVideo,
  persistReadyProgram,
  setReadyProgramSitePreview,
  persistRecord,
  removeReadyProgram,
  syncRemoteData,
  updateStudentAccess,
  uploadExerciseVideo,
} from './api-client.js'
import { downloadWorkoutPdf } from './workout-pdf.js'
import { quickReleaseAccess } from './dashboard.js'
import { getData } from './state.js'
import { exerciseCatalog } from '../data/exercises.js'
import { exerciseVideoLibrary, legGroupNames, muscleGroups } from '../data/library.js'
import { askConfirm, exerciseGroups, showToast } from './utils.js'
import {
  exerciseGifThumb,
  filesFromDrop,
  groupFromFolder,
  openGifPicker,
  openVideoLightbox,
} from './exercise-gifs.js'

const billingCycleLabels = {
  monthly: 'mensal',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  annual: 'anual',
  permanent: 'permanente',
}
// Preços em reais. Valores padrão; a página do personal (site-brand.js) troca
// pelos preços que ele definiu em "Meu site" (evento farisa:site-plans).
const consultingPrices = { ready: 49.9, basic: 99.9, premium: 149.9, athlete: 199.9 }
const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})
const mediaExerciseCatalog = [
  ...exerciseCatalog,
  ...exerciseVideoLibrary.map((item) => ({
    ...item,
    mediaType: 'video',
    mediaUrl: item.videoUrl,
    animationClip: '',
  })),
]
const legMuscleGroups = ['Pernas', ...legGroupNames]

function workoutCatalogGroups(exercises) {
  const knownGroups = new Set([...muscleGroups.map((group) => group.name), 'Pernas'])
  const groups = muscleGroups
    .filter((group) => !legMuscleGroups.includes(group.name))
    .map((group) => ({ ...group, memberNames: [group.name] }))
  const abdomenIndex = groups.findIndex((group) => group.name === 'Abdômen')
  groups.splice(abdomenIndex + 1, 0, {
    id: 'pernas',
    name: 'Pernas',
    memberNames: legMuscleGroups,
  })
  // Um exercício pode ter mais de um grupo (ex.: quadríceps e glúteos):
  // percorre cada nome separadamente, não a string toda.
  exercises.forEach((exercise) => {
    exerciseGroups(exercise)
      .filter((name) => !knownGroups.has(name))
      .forEach((name) => {
        if (groups.some((group) => group.name === name)) return
        groups.push({ id: name, name, memberNames: [name] })
      })
  })
  // Pastas criadas por você aparecem também aqui, mesmo ainda vazias.
  ;(getData().customGroups || []).forEach((item) => {
    if (groups.some((group) => group.name === item.name)) return
    groups.push({ id: item.id, name: item.name, memberNames: [item.name] })
  })
  return groups
}

function field(label, html) {
  const wrapper = document.createElement('label')
  wrapper.className = 'field'
  wrapper.innerHTML = `<span>${label}</span>${html}`
  return wrapper
}

function enhanceRegistration() {
  const form = document.querySelector('[data-student-form="register"]')
  if (!form || form.elements.planCode) return
  const password = form.querySelector('input[name="password"]')?.closest('label')
  const plan = field(
    'Plano desejado',
    `<select name="planCode"><option value="ready">Treinos Prontos — R$ 49,90 — acesso permanente</option><option value="basic" selected>Consultoria Básica</option><option value="premium">Consultoria Premium</option><option value="athlete">Performance Atleta</option></select>`,
  )
  const billingCycle = field(
    'Período da consultoria',
    `<select name="billingCycle"><option value="monthly" selected>Mensal — sem desconto</option><option value="quarterly">Trimestral — recomendado, 5% de desconto</option><option value="semiannual">Semestral — 10% de desconto</option><option value="annual">Anual — melhor valor, 15% de desconto</option></select>`,
  )
  const channel = field('Forma de pagamento', '<select name="paymentChannel"></select>')
  const paymentTitle = document.createElement('span')
  paymentTitle.className = 'registration-payment-title'
  paymentTitle.textContent = 'Etapas da contratação'
  const paymentArea = document.createElement('section')
  paymentArea.className = 'registration-payment'
  paymentArea.dataset.registrationPayment = ''
  const insertionPoint =
    form.querySelector('#student-password-requirements')?.nextElementSibling ||
    password.nextElementSibling
  form.insertBefore(plan, insertionPoint)
  form.insertBefore(billingCycle, insertionPoint)
  form.insertBefore(channel, insertionPoint)
  form.insertBefore(paymentTitle, insertionPoint)
  form.insertBefore(paymentArea, insertionPoint)

  paymentArea.innerHTML = `<div class="pix-payment-content"><p><strong>1.</strong> Crie o pré-cadastro com seus dados e o plano escolhido.</p><p><strong>2.</strong> Na próxima tela, escolha PIX ou cartão de crédito.</p><p><strong>3.</strong> O acesso aos treinos será liberado somente após a aprovação do pagamento.</p></div>`

  function updateContractOptions() {
    const select = channel.querySelector('select')
    const selectedPlan = plan.querySelector('select').value
    select.innerHTML = '<option value="webapp">Pagamento online após o pré-cadastro</option>'
    channel.hidden = true
    paymentTitle.hidden = false
    form.querySelector('[type="submit"]').textContent = 'Criar pré-cadastro'
    if (selectedPlan === 'ready') {
      // Pagamento único: o período não se aplica (o servidor grava "permanente").
      billingCycle.hidden = true
      billingCycle.querySelector('select').disabled = true
    } else {
      const monthlyPrice = consultingPrices[selectedPlan]
      const billingSelect = billingCycle.querySelector('select')
      billingSelect.options[0].textContent = `Mensal — ${money.format(monthlyPrice)}, sem desconto`
      billingSelect.options[1].textContent = `Trimestral — ${money.format(monthlyPrice * 3 * 0.95)}, recomendado (5% off)`
      billingSelect.options[2].textContent = `Semestral — ${money.format(monthlyPrice * 6 * 0.9)} (10% off)`
      billingSelect.options[3].textContent = `Anual — ${money.format(monthlyPrice * 12 * 0.85)} (15% off)`
      billingCycle.hidden = false
      billingSelect.disabled = false
      // Nunca fica em branco: sem escolha válida, mostra o primeiro (Mensal).
      if (!['monthly', 'quarterly', 'semiannual', 'annual'].includes(billingSelect.value)) billingSelect.value = 'monthly'
    }
  }
  // "Treinos Prontos" mostra o preço do personal no próprio nome da opção.
  // Cada opção mostra o preço do plano (os mesmos valores dos cartões).
  const PLAN_LABELS = { basic: 'Consultoria Básica', premium: 'Consultoria Premium', athlete: 'Performance Atleta' }
  function paintReadyOption() {
    const option = plan.querySelector('option[value="ready"]')
    if (option) option.textContent = `Treinos Prontos — ${money.format(consultingPrices.ready)} — acesso permanente`
    Object.entries(PLAN_LABELS).forEach(([code, label]) => {
      const item = plan.querySelector(`option[value="${code}"]`)
      if (item) item.textContent = `${label} — ${money.format(consultingPrices[code])}/mês`
    })
  }
  paintReadyOption()
  window.addEventListener('farisa:site-plans', (event) => {
    ;(event.detail || []).forEach((item) => {
      if (item.code in consultingPrices) consultingPrices[item.code] = Number(item.priceCents) / 100
    })
    paintReadyOption()
    updateContractOptions()
  })
  plan.querySelector('select').addEventListener('change', updateContractOptions)
  const requestedPlan = new URLSearchParams(location.hash.split('?')[1] || '').get('plan')
  if ([...plan.querySelector('select').options].some((option) => option.value === requestedPlan))
    plan.querySelector('select').value = requestedPlan
  updateContractOptions()
}

function createAppointmentDialog() {
  if (document.querySelector('[data-modal="appointment"]')) return
  const dialog = document.createElement('dialog')
  dialog.className = 'modal'
  dialog.dataset.modal = 'appointment'
  const today = new Date().toISOString().slice(0, 10)
  dialog.innerHTML = `<form method="dialog" data-form="appointment"><header><div><span class="eyebrow eyebrow--blue">Agenda · online e presencial</span><h2>Novo atendimento</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Fechar">×</button></header><div class="modal-body"><label class="field"><span>Aluno</span><select name="student" data-student-options required></select></label><div class="field-grid"><label class="field"><span>Atendimento</span><select name="service" data-appointment-services><option>Avaliação física</option><option>Consulta por vídeo</option><option>Reavaliação</option><option>Treino presencial</option><option>Orientação técnica</option></select></label><label class="field"><span>Modalidade</span><select name="modality" data-appointment-modality><option value="presencial">📍 Presencial</option><option value="online">💻 Online (vídeo)</option></select></label></div><div class="field-grid"><label class="field"><span>Data</span><input name="date" type="date" value="${today}" required></label><label class="field"><span>Horário</span><input name="time" type="time" required></label></div><div class="field-grid"><label class="field"><span>Duração</span><select name="duration"><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60" selected>1 hora</option><option value="90">1h30</option><option value="120">2 horas</option></select></label><label class="field"><span>Situação</span><select name="status"><option value="scheduled">Confirmado</option><option value="pending">Aguardando confirmação</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></label></div><label class="field" data-appointment-location><span>Local</span><input name="location" placeholder="Academia ou endereço"></label><label class="field" data-appointment-link hidden><span>Link da chamada</span><input name="meetingUrl" type="url" placeholder="https://meet.google.com/..."><small class="field-hint">O aluno vê o botão “Entrar na chamada” 15 min antes.</small></label><label class="field"><span>Observações</span><textarea name="notes" rows="3"></textarea></label><p role="status"></p></div><footer><button class="button button--secondary" type="button" data-close-modal>Cancelar</button><button class="button button--primary" type="submit">Salvar atendimento</button></footer></form>`
  document.body.append(dialog)
}

const workoutSessionLetters = ['A', 'B', 'C', 'D', 'E', 'F']

function workoutSessionLabels(form) {
  return workoutSessionLetters.slice(0, form.workoutSessionCount || 1)
}

function renderWorkoutSessionTabs(form) {
  const tabs = form.querySelector('[data-workout-session-tabs]')
  const labels = workoutSessionLabels(form)
  tabs.replaceChildren(
    ...labels.map((label) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ready-session-tab'
      button.textContent = `Treino ${label}`
      button.classList.toggle('is-active', label === form.workoutActiveSession)
      button.addEventListener('click', () => {
        form.workoutActiveSession = label
        renderWorkoutWizard(form)
      })
      return button
    }),
  )
}

// ------------------------------------------------------------------
// Mídia do exercício dentro do montador de treino
// ------------------------------------------------------------------
// As bibliotecas continuam sendo o acervo, sempre ativas. Aqui, na hora de
// montar a ficha pronta ou personalizada, cada exercício escolhido mostra
// um seletor único "GIF ou Vídeo MP4": nem todo exercício tem vídeo
// cadastrado, então em vez de dois campos independentes (que forçam pensar
// em vídeo mesmo quando não existe um), você escolhe qual dos dois vai pra
// ficha e o PDF/área do aluno daquele exercício — escolher um substitui o
// outro.

function currentExercise(exerciseId) {
  return (getData().exercises || []).find(
    (item) => String(item.id) === String(exerciseId),
  )
}

async function saveExerciseMedia(exercise, patch, control) {
  const previous = control.disabled
  control.disabled = true
  try {
    await persistRecord('exercises', { ...exercise, ...patch }, exercise.id)
    await syncRemoteData()
    showToast('Mídia do exercício atualizada.')
    return true
  } catch (error) {
    showToast(error.message || 'Não foi possível salvar a mídia do exercício.')
    return false
  } finally {
    control.disabled = previous
  }
}

function videoPickerSelect(exercise) {
  const select = document.createElement('select')
  select.className = 'prescription-media-select'
  const none = document.createElement('option')
  none.value = ''
  none.textContent = 'Sem vídeo MP4'
  select.append(none)
  const videos = getData().exerciseVideos || []
  const groups = [...new Set(videos.map((video) => video.group || 'Outros'))].sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  )
  // O grupo do próprio exercício vem primeiro, que é onde você vai olhar.
  groups.sort((a, b) => {
    const mine = (name) => (exerciseGroups(exercise).includes(name) ? 0 : 1)
    return mine(a) - mine(b)
  })
  groups.forEach((groupName) => {
    const optgroup = document.createElement('optgroup')
    optgroup.label = groupName
    videos
      .filter((video) => (video.group || 'Outros') === groupName)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .forEach((video) => {
        const option = document.createElement('option')
        option.value = String(video.id)
        option.textContent = video.name
        optgroup.append(option)
      })
    if (optgroup.children.length) select.append(optgroup)
  })
  const current = exercise.videoId ? String(exercise.videoId) : ''
  select.value = current
  // Vídeo apagado da biblioteca: o select volta para "sem vídeo" em vez de
  // mostrar um vínculo que não existe mais.
  if (current && select.value !== current) select.value = ''
  return select
}

// Linha de mídia usada pelos dois montadores. `rerender` redesenha o
// assistente depois de salvar, para a miniatura/seleção aparecer na hora.
// O tipo ativo (GIF ou Vídeo) começa de acordo com o que o exercício já tem
// salvo, mas trocar de aba não salva nada sozinho — só troca qual seletor
// aparece. Salvar em um dos dois sempre limpa o outro no banco, pra nunca
// ficar um vínculo escondido que ninguém está vendo.
// Linha de mídia usada pelos dois montadores: o exercício pode ter GIF e
// vídeo MP4 ao mesmo tempo. O GIF vai para a ficha em PDF; o vídeo aparece
// para o aluno na área dele (botão "Ver vídeo"). Um não apaga o outro.
function prescriptionMediaRow(exerciseId, rerender) {
  const row = document.createElement('div')
  row.className = 'prescription-media'
  const exercise = currentExercise(exerciseId)
  if (!exercise) return row

  const gifPart = document.createElement('div')
  gifPart.className = 'prescription-media-body'
  const gifLabel = document.createElement('span')
  gifLabel.className = 'prescription-media-label'
  gifLabel.textContent = 'GIF (ficha e PDF)'
  const thumb = exerciseGifThumb(exercise, 'prescription-media-thumb')
  const chooseGif = document.createElement('button')
  chooseGif.type = 'button'
  chooseGif.className = 'button button--secondary prescription-media-button'
  chooseGif.textContent = exercise.gifId ? 'Trocar GIF' : 'Escolher GIF'
  chooseGif.addEventListener('click', async () => {
    const chosen = await openGifPicker(exercise)
    if (chosen === undefined) return
    if (await saveExerciseMedia(exercise, { gifId: chosen || null }, chooseGif)) rerender()
  })
  gifPart.append(
    gifLabel,
    thumb ||
      Object.assign(document.createElement('span'), {
        className: 'prescription-media-empty',
        textContent: 'Sem GIF',
      }),
    chooseGif,
  )

  const videoPart = document.createElement('div')
  videoPart.className = 'prescription-media-body'
  const videoLabel = document.createElement('span')
  videoLabel.className = 'prescription-media-label'
  videoLabel.textContent = 'Vídeo MP4 (área do aluno)'
  const select = videoPickerSelect(exercise)
  select.addEventListener('change', async () => {
    const value = select.value
    if (!(await saveExerciseMedia(exercise, { videoId: value || null }, select)))
      select.value = exercise.videoId ? String(exercise.videoId) : ''
    else rerender()
  })
  const watch = document.createElement('button')
  watch.type = 'button'
  watch.className = 'button button--secondary prescription-media-button'
  watch.textContent = '▶ Ver'
  watch.disabled = !select.value
  watch.addEventListener('click', () => {
    if (select.value) void openVideoLightbox(select.value, exercise.name)
  })
  videoPart.append(videoLabel, select, watch)

  row.append(gifPart, videoPart)
  return row
}

// Dentro do montador de ficha: cadastra um exercício novo naquele grupo sem
// fechar a ficha. Ao salvar, o catálogo aqui se atualiza sozinho.
function catalogAddButton(groupName) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--secondary catalog-add-button'
  button.textContent = '+ Novo exercício neste grupo'
  button.addEventListener('click', () =>
    window.dispatchEvent(
      new CustomEvent('farisa:new-exercise', { detail: groupName }),
    ),
  )
  return button
}

function renderWorkoutExerciseCatalog(form) {
  const catalog = form.querySelector('[data-workout-exercise-catalog]')
  const exercises = getData().exercises || []
  const groups = workoutCatalogGroups(exercises)
  catalog.replaceChildren(
    ...groups.map((group) => {
      const items = exercises
        .filter((exercise) =>
          exerciseGroups(exercise).some((name) => group.memberNames.includes(name)),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      const details = document.createElement('details')
      details.className = 'ready-exercise-group'
      const selectedCount = items.filter(
        (exercise) =>
          form.workoutPrescriptionMap.get(String(exercise.id))?.sessionLabel ===
          form.workoutActiveSession,
      ).length
      details.innerHTML = `<summary><strong></strong><span></span></summary><div class="ready-exercise-options"></div>`
      details.querySelector('summary strong').textContent = group.name
      paintGroupCount(
        details.querySelector('summary span'),
        items.length,
        selectedCount,
        `selecionado${selectedCount === 1 ? '' : 's'}`,
      )
      const options = details.querySelector('.ready-exercise-options')
      if (!items.length) options.textContent = 'Nenhum exercício cadastrado neste grupo.'
      options.append(catalogAddButton(group.name))
      items.forEach((exercise) => {
        const exerciseId = String(exercise.id)
        const assignment = form.workoutPrescriptionMap.get(exerciseId)
        const label = document.createElement('label')
        label.className = 'ready-exercise-option'
        label.innerHTML = `<input type="checkbox"><span><strong></strong><small></small></span>`
        const checkbox = label.querySelector('input')
        const thumb = exerciseGifThumb(exercise)
        if (thumb) checkbox.after(thumb)
        checkbox.checked = assignment?.sessionLabel === form.workoutActiveSession
        label.querySelector('strong').textContent = exercise.name
        label.querySelector('small').textContent = assignment
          ? assignment.sessionLabel === form.workoutActiveSession
            ? `${exercise.equipment || 'Sem equipamento'} · neste treino`
            : `${exercise.equipment || 'Sem equipamento'} · usado no Treino ${assignment.sessionLabel}`
          : exercise.equipment || 'Sem equipamento'
        checkbox.addEventListener('change', () => {
          const active = form.workoutActiveSession
          const current = form.workoutPrescriptionMap.get(exerciseId)
          if (checkbox.checked) {
            form.workoutPrescriptionMap.set(exerciseId, {
              ...(current || {}),
              exerciseId,
              sessionLabel: active,
              sets: current?.sets || '3',
              repetitions: current?.repetitions || '10-12',
              restSeconds: current?.restSeconds ?? '60',
              notes: current?.notes || '',
              // Entra no fim da lista, na ordem em que foi marcado.
              position:
                current?.sessionLabel === active && current?.position
                  ? current.position
                  : Math.max(
                      0,
                      ...[...form.workoutPrescriptionMap.values()].map(
                        (item) => Number(item.position) || 0,
                      ),
                    ) + 1,
            })
          } else if (current?.sessionLabel === active) {
            form.workoutPrescriptionMap.delete(exerciseId)
          }
          // Atualiza só este item e o contador do grupo, sem redesenhar a
          // lista: assim ela não rola de volta para o início.
          const now = form.workoutPrescriptionMap.get(exerciseId)
          label.querySelector('small').textContent = now
            ? now.sessionLabel === active
              ? `${exercise.equipment || 'Sem equipamento'} · neste treino`
              : `${exercise.equipment || 'Sem equipamento'} · usado no Treino ${now.sessionLabel}`
            : exercise.equipment || 'Sem equipamento'
          const count = items.filter(
            (item) => form.workoutPrescriptionMap.get(String(item.id))?.sessionLabel === active,
          ).length
          paintGroupCount(
            details.querySelector('summary span'),
            items.length,
            count,
            `selecionado${count === 1 ? '' : 's'}`,
          )
          renderWorkoutPrescriptionBuilder(form)
        })
        options.append(label)
      })
      return details
    }),
  )
}

function renderWorkoutPrescriptionBuilder(form) {
  const builder = form.querySelector('[data-workout-prescriptions]')
  if (!builder) return
  const selected = [...form.workoutPrescriptionMap.values()]
    .filter((item) => item.sessionLabel === form.workoutActiveSession)
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
  builder.replaceChildren()
  if (!selected.length) {
    const empty = document.createElement('p')
    empty.className = 'workout-builder-empty'
    empty.textContent = `Abra uma pasta muscular e escolha os exercícios do Treino ${form.workoutActiveSession}.`
    builder.append(empty)
    return
  }
  selected.forEach((current, index) => {
    const exercise = getData().exercises.find(
      (item) => String(item.id) === String(current.exerciseId),
    )
    const row = document.createElement('section')
    row.className = 'workout-prescription-row'
    row.dataset.workoutPrescription = ''
    row.dataset.exerciseId = current.exerciseId
    row.innerHTML = `<header><span></span><strong></strong><button class="remove-exercise-button" type="button" aria-label="Remover exercício">Remover</button></header><input name="prescriptionSession" type="hidden"><div class="field-grid field-grid--three"><label class="field"><span>Séries</span><input name="prescriptionSets" type="number" min="1" max="20" required></label><label class="field"><span>Repetições ou tempo</span><input name="prescriptionRepetitions" maxlength="40" required></label><label class="field"><span>Intervalo (segundos)</span><input name="prescriptionRestSeconds" type="number" min="0" max="1800" required></label></div><label class="field"><span>Carga</span><input name="prescriptionLoad" maxlength="20" placeholder="Ex.: 20 kg (o aluno também pode ajustar)"><small class="prescription-load-note" data-load-note hidden></small></label><label class="field"><span>Observação individual</span><input name="prescriptionNotes" maxlength="500" placeholder="Ex.: cadência controlada, última série até a falha"></label>`
    row.querySelector('header span').textContent = String(index + 1).padStart(2, '0')
    row.querySelector('header strong').textContent =
      `${exercise?.name || 'Exercício'} · ${exercise?.group || 'Grupo muscular'}`
    row.querySelector('[name="prescriptionSession"]').value = current.sessionLabel
    row.querySelector('[name="prescriptionSets"]').value = current.sets || 3
    row.querySelector('[name="prescriptionRepetitions"]').value = current.repetitions || '10-12'
    row.querySelector('[name="prescriptionRestSeconds"]').value = current.restSeconds ?? 60
    row.querySelector('[name="prescriptionNotes"]').value = current.notes || ''
    row.querySelector('[name="prescriptionLoad"]').value = current.load || ''
    // Quem mexeu na carga por último (o aluno ajusta pela área dele).
    if (current.load && current.loadBy) {
      const note = row.querySelector('[data-load-note]')
      const date = current.loadAt ? new Date(current.loadAt) : null
      const when =
        date && !Number.isNaN(date.getTime())
          ? ` em ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
          : ''
      note.textContent = current.loadBy === 'student' ? `Ajustada pelo aluno${when}.` : `Definida por você${when}.`
      // Evolução da carga deste exercício nesta ficha (a ficha é achada pela
      // data da última mudança, que é única).
      const listOf = (workout) => {
        if (Array.isArray(workout.exercisePrescriptions)) return workout.exercisePrescriptions
        try {
          return JSON.parse(workout.exercisePrescriptionsJson || '[]')
        } catch {
          return []
        }
      }
      const owner = (getData().workouts || []).find((workout) =>
        listOf(workout).some(
          (item) => String(item.exerciseId) === String(current.exerciseId) && item.loadAt === current.loadAt,
        ),
      )
      const trail = (getData().loadHistory?.[`${owner?.id}:${current.exerciseId}`] || []).map((item) => item.load)
      if (trail.length > 1) note.textContent += ` Evolução: ${trail.slice(-5).join(' → ')}.`
      note.classList.toggle('is-student', current.loadBy === 'student')
      note.hidden = false
    }
    row.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => {
        Object.assign(current, {
          sets: row.querySelector('[name="prescriptionSets"]').value,
          repetitions: row.querySelector('[name="prescriptionRepetitions"]').value,
          restSeconds: row.querySelector('[name="prescriptionRestSeconds"]').value,
          notes: row.querySelector('[name="prescriptionNotes"]').value,
          load: row.querySelector('[name="prescriptionLoad"]').value,
        })
      })
    })
    row.querySelector('.remove-exercise-button').addEventListener('click', () => {
      form.workoutPrescriptionMap.delete(String(current.exerciseId))
      renderWorkoutWizard(form)
    })
    row.append(
      prescriptionMediaRow(current.exerciseId, () => renderWorkoutWizard(form)),
    )
    builder.append(row)
  })
}

function renderWorkoutWizard(form) {
  renderWorkoutSessionTabs(form)
  renderWorkoutExerciseCatalog(form)
  renderWorkoutPrescriptionBuilder(form)
  form.querySelector('[data-workout-current-title]').textContent =
    `Montando Treino ${form.workoutActiveSession}`
  const add = form.querySelector('[data-workout-add-session]')
  const next = workoutSessionLetters[form.workoutSessionCount || 1]
  add.hidden = !next
  if (next) add.textContent = `+ Adicionar Treino ${next} / grupo muscular`
}

function resetWorkoutWizard(form, saved = []) {
  form.workoutPrescriptionMap = new Map(
    saved.map((item, index) => [
      String(item.exerciseId),
      {
        ...item,
        exerciseId: String(item.exerciseId),
        sessionLabel: item.sessionLabel || 'A',
        position: item.position || index + 1,
      },
    ]),
  )
  const highestSession = saved.reduce(
    (highest, item) =>
      Math.max(highest, workoutSessionLetters.indexOf(item.sessionLabel || 'A') + 1),
    1,
  )
  form.workoutSessionCount = highestSession
  form.workoutActiveSession = 'A'
  renderWorkoutWizard(form)
}

function enhanceWorkout() {
  const body = document.querySelector('[data-form="workout"] .modal-body')
  if (!body || body.querySelector('[data-workout-wizard]')) return
  body.closest('dialog').classList.add('modal--wide')
  const wizard = document.createElement('section')
  wizard.className = 'ready-workout-wizard'
  wizard.dataset.workoutWizard = ''
  wizard.innerHTML = `<div class="ready-session-tabs" data-workout-session-tabs></div><div class="ready-wizard-heading"><div><span class="eyebrow eyebrow--blue">Etapa atual</span><h3 data-workout-current-title></h3></div><p>Abra Peitoral, Costas, Ombros ou outro grupo e marque os exercícios deste treino.</p></div><div class="ready-exercise-catalog" data-workout-exercise-catalog></div><button class="button button--secondary workout-add-session" type="button" data-workout-add-session></button><div class="workout-prescription-builder" data-workout-prescriptions></div>`
  const publish = document.createElement('label')
  publish.className = 'check-field'
  publish.innerHTML = `<input name="published" type="checkbox" value="1"><span>Publicar esta ficha personalizada para o aluno selecionado</span>`
  body.append(wizard, publish)
  const form = body.closest('form')
  form.workoutPrescriptionMap = new Map()
  form.workoutSessionCount = 1
  form.workoutActiveSession = 'A'
  wizard.querySelector('[data-workout-add-session]').addEventListener('click', () => {
    if (form.workoutSessionCount >= workoutSessionLetters.length) return
    form.workoutSessionCount += 1
    form.workoutActiveSession = workoutSessionLetters[form.workoutSessionCount - 1]
    renderWorkoutWizard(form)
  })
  document
    .querySelectorAll('[data-open-modal="workout"]')
    .forEach((button) =>
      button.addEventListener('click', () => queueMicrotask(() => resetWorkoutWizard(form))),
    )
  resetWorkoutWizard(form)
}

function enhanceExercise() {
  const form = document.querySelector('[data-form="exercise"]')
  const body = form?.querySelector('.modal-body')
  if (!body || form.elements.mediaUrl) return
  const name = form.elements.name
  name.setAttribute('list', 'exercise-catalog-list')
  const list = document.createElement('datalist')
  list.id = 'exercise-catalog-list'
  mediaExerciseCatalog.forEach((item) => {
    const option = document.createElement('option')
    option.value = item.name
    list.append(option)
  })
  body.append(list)
  const extra = document.createElement('div')
  extra.innerHTML = `<div class="field-grid"><label class="field"><span>Dificuldade</span><select name="difficulty"><option>Iniciante</option><option selected>Intermediário</option><option>Avançado</option></select></label><label class="field"><span>Formato da mídia</span><select name="mediaType" data-media-type><option value="gif">GIF e vídeo MP4</option><option value="3d">Animação 3D</option></select></label></div><label class="field" data-media-3d><span>Arquivo 3D (URL)</span><input name="mediaUrl" placeholder="/models/exercises/exercicio.glb"></label><label class="field" data-media-3d><span>Nome da animação 3D</span><input name="animationClip" placeholder="Ex.: Squat"></label>`
  body.append(...extra.children)
  const picker = field('Selecionar da biblioteca de vídeos', '<select data-video-picker></select>')
  const pickerSelect = picker.querySelector('select')
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = exerciseVideoLibrary.length
    ? 'Escolha um exercício para preencher o formulário'
    : 'Nenhum MP4 cadastrado em src/data/library.js'
  pickerSelect.append(placeholder)
  muscleGroups.forEach((group) => {
    const items = exerciseVideoLibrary.filter((item) => item.group === group.name)
    if (!items.length) return
    const options = document.createElement('optgroup')
    options.label = group.name
    items.forEach((item) => {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = item.name
      options.append(option)
    })
    pickerSelect.append(options)
  })
  body.insertBefore(picker, body.firstElementChild)
  // O seletor antigo lê só os vídeos escritos à mão em src/data/library.js;
  // sem nenhum lá, ele só confunde — fica escondido.
  picker.hidden = !exerciseVideoLibrary.length
  setupExerciseMediaFields(form)
  const applyCatalogItem = (item) => {
    if (!item) return
    name.value = item.name
    ;['equipment', 'difficulty', 'mediaType', 'mediaUrl', 'animationClip', 'instructions'].forEach(
      (key) => {
        if (form.elements[key]) form.elements[key].value = item[key] || ''
      },
    )
    // 'group' não é mais um select único — marca a caixinha correspondente.
    if (item.group) {
      form.querySelectorAll('input[name="group"]').forEach((input) => {
        input.checked = input.value === item.group
      })
    }
  }
  pickerSelect.addEventListener('change', () =>
    applyCatalogItem(mediaExerciseCatalog.find((entry) => entry.id === pickerSelect.value)),
  )
  name.addEventListener('change', () => {
    applyCatalogItem(mediaExerciseCatalog.find((entry) => entry.name === name.value))
  })
}

// Formato da mídia do exercício: GIF, Vídeo MP4 ou Animação 3D. Cada
// formato mostra só os campos dele. O vídeo vem da Biblioteca de MP4.
function exerciseVideoSelect(form) {
  let wrapper = form.querySelector('[data-media-video]')
  if (!wrapper) {
    wrapper = document.createElement('div')
    wrapper.className = 'field'
    wrapper.dataset.mediaVideo = ''
    wrapper.innerHTML = `<span>Vídeo MP4</span>
      <div class="exercise-video-row">
        <select name="videoId"></select>
        <button class="button button--secondary" type="button" data-exercise-video-preview>▶ Ver vídeo</button>
        <label class="button button--secondary exercise-video-upload">Enviar MP4 do computador<input type="file" accept=".mp4,video/mp4" hidden data-exercise-video-file></label>
      </div>
      <progress data-exercise-video-progress hidden></progress>
      <small class="field-hint" data-exercise-video-status>Escolha um vídeo da Biblioteca de MP4 ou envie um novo do computador (MP4 de até 90 MB).</small>`
    const gifField = form.querySelector('[data-gif-field]')
    if (gifField) gifField.after(wrapper)
    else form.querySelector('.modal-body').append(wrapper)
    wrapper
      .querySelector('[data-exercise-video-file]')
      .addEventListener('change', (event) => uploadVideoFromExerciseForm(form, event.target))
    // Assistir o vídeo escolhido sem sair do formulário.
    const previewButton = wrapper.querySelector('[data-exercise-video-preview]')
    const selectElement = wrapper.querySelector('select')
    previewButton.addEventListener('click', () => {
      const chosen = selectElement.value
      if (!chosen) return
      const label = selectElement.selectedOptions[0]?.textContent || form.elements.name.value
      void openVideoLightbox(chosen, label)
    })
    selectElement.addEventListener('change', () => {
      previewButton.disabled = !selectElement.value
    })
  }
  const select = wrapper.querySelector('select')
  const current = select.value
  const checked = [...form.querySelectorAll('input[name="group"]:checked')].map((input) => input.value)
  const fresh = videoPickerSelect({ group: checked.join(', '), videoId: current })
  select.replaceChildren(...fresh.children)
  select.value = current
  const previewButton = wrapper.querySelector('[data-exercise-video-preview]')
  if (previewButton) previewButton.disabled = !select.value
  return wrapper
}

// Envia um MP4 direto do formulário do exercício. O vídeo vai para a
// Biblioteca de MP4 (no primeiro grupo marcado) e já fica escolhido aqui.
async function uploadVideoFromExerciseForm(form, input) {
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const status = form.querySelector('[data-exercise-video-status]')
  const bar = form.querySelector('[data-exercise-video-progress]')
  const group = form.querySelector('input[name="group"]:checked')?.value
  if (!group) {
    status.textContent = 'Marque o grupo muscular do exercício antes de enviar o vídeo.'
    return
  }
  if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.mp4')) {
    status.textContent = 'Escolha um arquivo .mp4.'
    return
  }
  const name =
    form.elements.name.value.trim() ||
    file.name.replace(/\.mp4$/iu, '').replace(/[-_+]+/gu, ' ').trim() ||
    'Exercício'
  const payload = new FormData()
  payload.append('video', file)
  payload.append('name', name)
  payload.append('group', group)
  payload.append('equipment', form.elements.equipment?.value || '')
  payload.append('difficulty', form.elements.difficulty?.value || 'Intermediário')
  payload.append('instructions', form.elements.instructions?.value || '')
  payload.append('published', '1')
  // Só na biblioteca: o exercício é este que você está cadastrando.
  payload.append('catalog', '0')
  const uploadButton = form.querySelector('.exercise-video-upload')
  uploadButton.classList.add('is-busy')
  bar.hidden = false
  bar.removeAttribute('value')
  status.textContent = `Enviando ${file.name}…`
  try {
    const saved = await uploadExerciseVideo(payload)
    await syncRemoteData()
    exerciseVideoSelect(form)
    if (saved?.id) form.elements.videoId.value = String(saved.id)
    form.elements.videoId.dispatchEvent(new Event('change'))
    status.textContent = `Vídeo "${saved?.name || name}" enviado e escolhido para este exercício.`
    showToast('Vídeo MP4 enviado para a biblioteca.')
  } catch (error) {
    status.textContent = error.message
  } finally {
    bar.hidden = true
    uploadButton.classList.remove('is-busy')
  }
}

function syncExerciseMediaFields(form) {
  const type = form.elements.mediaType
  if (!type) return
  const video = exerciseVideoSelect(form)
  // GIF e vídeo podem ficar juntos (GIF para a ficha/PDF, vídeo para a área
  // do aluno). Exercícios antigos ("imagem", "vídeo" ou sem formato) abrem
  // como "GIF e vídeo MP4"; os de 3D continuam 3D.
  if (!['gif', '3d'].includes(type.value)) type.value = 'gif'
  const mode = type.value
  form.querySelectorAll('[data-media-3d]').forEach((element) => (element.hidden = mode !== '3d'))
  const gifField = form.querySelector('[data-gif-field]')
  if (gifField) gifField.hidden = false
  video.hidden = false
}

function setupExerciseMediaFields(form) {
  form.elements.mediaType.addEventListener('change', () => syncExerciseMediaFields(form))
  // Ao abrir a janela (novo exercício ou edição), atualiza a lista de vídeos
  // e mostra os campos certos do formato salvo.
  const dialog = form.closest('dialog')
  if (dialog)
    new MutationObserver(() => {
      if (dialog.open) queueMicrotask(() => syncExerciseMediaFields(form))
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] })
  // A lista de vídeos fica sempre atualizada, para a edição de um exercício
  // já encontrar o vídeo dele na lista.
  exerciseVideoSelect(form)
  window.addEventListener('farisa:data-changed', () => exerciseVideoSelect(form))
  // Ao salvar, os campos de 3D só ficam guardados no formato Animação 3D.
  form.addEventListener(
    'submit',
    () => {
      const mode = form.elements.mediaType.value
      if (mode !== '3d') {
        if (form.elements.mediaUrl) form.elements.mediaUrl.value = ''
        if (form.elements.animationClip) form.elements.animationClip.value = ''
      }
    },
    true,
  )
}

// "18 exercícios · 6 selecionados": a parte dos selecionados vai em vermelho
// para destacar quantos exercícios já estão neste treino.
function paintGroupCount(target, total, selected, label) {
  target.replaceChildren(document.createTextNode(`${total} exercícios`))
  if (!selected) return
  const mark = document.createElement('b')
  mark.className = 'group-selected-count'
  mark.textContent = `${selected} ${label}`
  target.append(document.createTextNode(' · '), mark)
}

function configureMuscleGroupFields() {
  // Pastas criadas por você entram junto das do catálogo.
  const customNames = (getData().customGroups || []).map((item) => item.name)
  const values = [
    ...muscleGroups.map((group) => group.name),
    ...customNames.filter(
      (name) => !muscleGroups.some((group) => group.name === name),
    ),
  ]
  // Um exercício pode trabalhar mais de um grupo (ex.: afundo no smith =
  // quadríceps e glúteos), então isto é uma lista de caixas de marcar, não
  // um select de escolha única.
  const groupCheckboxes = document.querySelector('[data-group-checkboxes]')
  const filter = document.querySelector('[data-exercise-filter]')
  if (groupCheckboxes) {
    const previouslyChecked = new Set(
      [...groupCheckboxes.querySelectorAll('input:checked')].map((input) => input.value),
    )
    groupCheckboxes.replaceChildren(
      ...values.map((value) => {
        const option = document.createElement('label')
        option.className = 'checkbox-grid-option'
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.name = 'group'
        input.value = value
        input.checked = previouslyChecked.has(value)
        option.append(input, document.createTextNode(value))
        return option
      }),
    )
  }
  if (filter) {
    const all = document.createElement('option')
    all.value = 'all'
    all.textContent = 'Todos os grupos'
    const catalogNames = workoutCatalogGroups(getData().exercises || []).map(
      (group) => group.name,
    )
    const filterValues = [
      ...catalogNames,
      ...customNames.filter((name) => !catalogNames.includes(name)),
    ]
    filter.replaceChildren(
      all,
      ...filterValues.map((value) => {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        return option
      }),
    )
  }
}

let editingReadyProgram = null
const readyDivisions = {
  fullbody: ['A'],
  ab: ['A', 'B'],
  abc: ['A', 'B', 'C'],
  abcd: ['A', 'B', 'C', 'D'],
  abcde: ['A', 'B', 'C', 'D', 'E'],
  abcdef: ['A', 'B', 'C', 'D', 'E', 'F'],
}

function readySessionLabels(form) {
  return readyDivisions[form.elements.division.value] || readyDivisions.abcde
}

function captureReadyPrescriptionFields(form) {
  form.readyPrescriptionMap ||= new Map()
  form.querySelectorAll('[data-ready-prescription]').forEach((row) => {
    const current = form.readyPrescriptionMap.get(row.dataset.exerciseId)
    if (!current) return
    Object.assign(current, {
      sets: row.querySelector('[name="sets"]').value,
      repetitions: row.querySelector('[name="repetitions"]').value,
      restSeconds: row.querySelector('[name="restSeconds"]').value,
      notes: row.querySelector('[name="notes"]').value,
    })
  })
}

function readyPrescriptionValues(form) {
  captureReadyPrescriptionFields(form)
  return [...(form.readyPrescriptionMap?.values() || [])].sort(
    (a, b) =>
      a.sessionLabel.localeCompare(b.sessionLabel) ||
      Number(a.position || 0) - Number(b.position || 0),
  )
}

function renderReadySessionTabs(form) {
  const tabs = form.querySelector('[data-ready-session-tabs]')
  const labels = readySessionLabels(form).slice(0, form.readyVisibleSessionCount || 1)
  tabs.replaceChildren(
    ...labels.map((label) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ready-session-tab'
      button.textContent =
        form.elements.division.value === 'fullbody' ? 'Full body' : `Treino ${label}`
      button.classList.toggle('is-active', label === form.readyActiveSession)
      button.addEventListener('click', () => {
        captureReadyPrescriptionFields(form)
        form.readyActiveSession = label
        renderReadyWizard(form)
      })
      return button
    }),
  )
}

function renderReadyExerciseCatalog(form) {
  const catalog = form.querySelector('[data-ready-exercise-catalog]')
  const exercises = getData().exercises || []
  const groups = workoutCatalogGroups(exercises)
  catalog.replaceChildren(
    ...groups.map((group) => {
      const items = exercises
        .filter((exercise) =>
          exerciseGroups(exercise).some((name) => group.memberNames.includes(name)),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      const details = document.createElement('details')
      details.className = 'ready-exercise-group'
      const selectedCount = items.filter(
        (exercise) =>
          form.readyPrescriptionMap.get(String(exercise.id))?.sessionLabel ===
          form.readyActiveSession,
      ).length
      details.innerHTML = `<summary><strong></strong><span></span></summary><div class="ready-exercise-options"></div>`
      details.querySelector('summary strong').textContent = group.name
      paintGroupCount(
        details.querySelector('summary span'),
        items.length,
        selectedCount,
        'neste treino',
      )
      const options = details.querySelector('.ready-exercise-options')
      options.append(catalogAddButton(group.name))
      if (!items.length) {
        options.append(
          Object.assign(document.createElement('p'), {
            textContent: 'Nenhum exercício cadastrado neste grupo.',
          }),
        )
      }
      items.forEach((exercise) => {
        const assignment = form.readyPrescriptionMap.get(String(exercise.id))
        const label = document.createElement('label')
        label.className = 'ready-exercise-option'
        label.innerHTML = `<input type="checkbox"><span><strong></strong><small></small></span>`
        const checkbox = label.querySelector('input')
        const thumb = exerciseGifThumb(exercise)
        if (thumb) checkbox.after(thumb)
        checkbox.checked = assignment?.sessionLabel === form.readyActiveSession
        label.querySelector('span strong').textContent = exercise.name
        label.querySelector('small').textContent = assignment
          ? assignment.sessionLabel === form.readyActiveSession
            ? `${exercise.equipment || 'Sem equipamento'} · selecionado neste treino`
            : `${exercise.equipment || 'Sem equipamento'} · atualmente no Treino ${assignment.sessionLabel}`
          : exercise.equipment || 'Sem equipamento'
        checkbox.addEventListener('change', () => {
          captureReadyPrescriptionFields(form)
          const active = form.readyActiveSession
          const current = form.readyPrescriptionMap.get(String(exercise.id))
          if (checkbox.checked) {
            form.readyPrescriptionMap.set(String(exercise.id), {
              ...(current || {}),
              exerciseId: String(exercise.id),
              sessionLabel: active,
              sets: current?.sets || 3,
              repetitions: current?.repetitions || '10-12',
              restSeconds: current?.restSeconds ?? 60,
              notes: current?.notes || '',
              // Entra no fim da lista, na ordem em que foi marcado.
              position:
                current?.sessionLabel === active && current?.position
                  ? current.position
                  : Math.max(
                      0,
                      ...[...form.readyPrescriptionMap.values()].map(
                        (item) => Number(item.position) || 0,
                      ),
                    ) + 1,
            })
          } else if (current?.sessionLabel === active) {
            form.readyPrescriptionMap.delete(String(exercise.id))
          }
          // Atualiza só este item e o contador do grupo, sem redesenhar a
          // lista: assim ela não rola de volta para o início.
          const now = form.readyPrescriptionMap.get(String(exercise.id))
          label.querySelector('small').textContent = now
            ? now.sessionLabel === active
              ? `${exercise.equipment || 'Sem equipamento'} · selecionado neste treino`
              : `${exercise.equipment || 'Sem equipamento'} · atualmente no Treino ${now.sessionLabel}`
            : exercise.equipment || 'Sem equipamento'
          paintGroupCount(
            details.querySelector('summary span'),
            items.length,
            items.filter(
              (item) => form.readyPrescriptionMap.get(String(item.id))?.sessionLabel === active,
            ).length,
            'neste treino',
          )
          renderReadyPrescriptionBuilder(form)
        })
        options.append(label)
      })
      return details
    }),
  )
}

function renderReadyPrescriptionBuilder(form) {
  const builder = form.querySelector('[data-ready-prescriptions]')
  builder.replaceChildren()
  const selected = [...form.readyPrescriptionMap.values()]
    .filter((item) => item.sessionLabel === form.readyActiveSession)
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
  selected.forEach((current, index) => {
    const exercise = getData().exercises.find(
      (item) => String(item.id) === String(current.exerciseId),
    )
    const row = document.createElement('section')
    row.className = 'workout-prescription-row'
    row.dataset.readyPrescription = ''
    row.dataset.exerciseId = current.exerciseId
    row.innerHTML = `<header><span>${String(index + 1).padStart(2, '0')}</span><strong></strong><button class="remove-exercise-button" type="button" aria-label="Remover exercício">Remover</button></header><div class="field-grid field-grid--three"><label class="field"><span>Séries</span><input name="sets" type="number" min="1" max="20" value="3" required></label><label class="field"><span>Repetições/tempo</span><input name="repetitions" value="10-12" required></label><label class="field"><span>Intervalo (s)</span><input name="restSeconds" type="number" min="0" max="1800" value="60" required></label></div><label class="field"><span>Observação</span><input name="notes" maxlength="500" placeholder="Ex.: cadência controlada"></label>`
    row.querySelector('strong').textContent =
      `${exercise?.name || 'Exercício'} · ${exercise?.group || 'Grupo muscular'}`
    row.querySelector('[name="sets"]').value = current.sets || 3
    row.querySelector('[name="repetitions"]').value = current.repetitions || '10-12'
    row.querySelector('[name="restSeconds"]').value = current.restSeconds ?? 60
    row.querySelector('[name="notes"]').value = current.notes || ''
    row.querySelector('.remove-exercise-button').addEventListener('click', () => {
      captureReadyPrescriptionFields(form)
      form.readyPrescriptionMap.delete(String(current.exerciseId))
      renderReadyWizard(form)
    })
    row.append(
      prescriptionMediaRow(current.exerciseId, () => {
        captureReadyPrescriptionFields(form)
        renderReadyWizard(form)
      }),
    )
    builder.append(row)
  })
  if (!builder.children.length) {
    const empty = document.createElement('p')
    empty.className = 'workout-builder-empty'
    empty.textContent = `Abra um grupo muscular e escolha os exercícios do ${form.elements.division.value === 'fullbody' ? 'Full body' : `Treino ${form.readyActiveSession}`}.`
    builder.append(empty)
  }
}

function renderReadyWizard(form) {
  // Guarda a rolagem e os grupos abertos para a tela não pular para o topo
  // a cada exercício marcado.
  const dialog = form.closest('dialog')
  const body = form.querySelector('.modal-body')
  const scrollPositions = [dialog, form, body].map((element) => element?.scrollTop || 0)
  const openGroups = new Set(
    [...form.querySelectorAll('.ready-exercise-group[open] summary strong')].map(
      (item) => item.textContent,
    ),
  )
  // A lista de exercícios de cada grupo tem rolagem própria: guarda também.
  const innerScroll = new Map(
    [...form.querySelectorAll('.ready-exercise-group')].map((group) => [
      group.querySelector('summary strong')?.textContent,
      group.querySelector('.ready-exercise-options')?.scrollTop || 0,
    ]),
  )
  const catalogBox = form.querySelector('[data-ready-exercise-catalog]')
  const catalogScroll = [catalogBox?.scrollTop || 0, catalogBox?.scrollLeft || 0]
  renderReadySessionTabs(form)
  renderReadyExerciseCatalog(form)
  form.querySelectorAll('.ready-exercise-group').forEach((group) => {
    const name = group.querySelector('summary strong')?.textContent
    if (openGroups.has(name)) group.open = true
    const options = group.querySelector('.ready-exercise-options')
    if (options && innerScroll.get(name)) options.scrollTop = innerScroll.get(name)
  })
  if (catalogBox) [catalogBox.scrollTop, catalogBox.scrollLeft] = catalogScroll
  renderReadyPrescriptionBuilder(form)
  ;[dialog, form, body].forEach((element, index) => {
    if (element) element.scrollTop = scrollPositions[index]
  })
  const labels = readySessionLabels(form)
  const currentIndex = labels.indexOf(form.readyActiveSession)
  const next = form.querySelector('[data-ready-next]')
  next.hidden = currentIndex === labels.length - 1
  if (!next.hidden) {
    const nextLabel = labels[currentIndex + 1]
    const alreadyVisible = currentIndex + 1 < (form.readyVisibleSessionCount || 1)
    next.textContent = alreadyVisible
      ? `Continuar para o Treino ${nextLabel}`
      : `+ Adicionar Treino ${nextLabel} / grupo muscular`
  }
  form.querySelector('[data-ready-current-title]').textContent =
    form.elements.division.value === 'fullbody'
      ? 'Montando Full body'
      : `Montando Treino ${form.readyActiveSession}`
}

// asPreview: "+ Montar prévia do site" usa o mesmo montador do "+ Novo
// treino"; ao salvar, o treino já fica marcado como a prévia do site.
function openReadyProgramDialog(program = null, { asPreview = false } = {}) {
  const dialog = document.querySelector('[data-ready-program-dialog]')
  const form = dialog.querySelector('form')
  editingReadyProgram = program?.id || null
  form.readyAsPreview = !program && asPreview
  form.reset()
  form.querySelector('h2').textContent = program
    ? 'Editar treino pronto'
    : asPreview
      ? 'Montar prévia do site'
      : 'Montar treino pronto completo'
  form.elements.name.value = program?.name || ''
  form.elements.goal.value = program?.goal || 'Hipertrofia'
  form.elements.level.value = program?.level || 'Intermediário'
  form.elements.durationWeeks.value = Number.parseInt(program?.duration, 10) || 12
  form.elements.description.value = program?.description || ''
  form.elements.colorTheme.value = program?.colorTheme || 'blue'
  form.elements.published.checked = program ? Boolean(program.published) : !asPreview
  let prescriptions
  try {
    prescriptions =
      program?.exercisePrescriptions || JSON.parse(program?.exercisePrescriptionsJson || '[]')
  } catch {
    prescriptions = []
  }
  const sessionCount = new Set(prescriptions.map((item) => item.sessionLabel || 'A')).size
  form.elements.division.value = program
    ? sessionCount <= 1
      ? 'fullbody'
      : Object.keys(readyDivisions).find((key) => readyDivisions[key].length === sessionCount) ||
        'abcde'
    : 'abcde'
  form.readyPrescriptionMap = new Map(
    prescriptions.map((item, index) => [
      String(item.exerciseId),
      {
        ...item,
        exerciseId: String(item.exerciseId),
        position: item.position || index + 1,
      },
    ]),
  )
  form.readyVisibleSessionCount = program ? Math.max(1, sessionCount) : 1
  form.readyActiveSession = readySessionLabels(form)[0]
  renderReadyWizard(form)
  dialog.showModal()
}

function createReadyWorkoutLibraryPanel() {
  const page = document.querySelector('[data-route="treinos"]')
  if (!page || page.querySelector('[data-ready-workout-library]')) return
  const panel = document.createElement('article')
  panel.className = 'panel media-library-panel'
  panel.dataset.readyWorkoutLibrary = ''
  panel.innerHTML = `<div class="panel-heading"><div><span class="eyebrow eyebrow--blue">Produto de valor único</span><h2>Treinos Prontos — acesso permanente</h2><p>Monte o PDF completo dentro do sistema. Ao publicar, ele aparece automaticamente para todos os compradores desta modalidade.</p></div><div class="ready-library-actions"><button class="button button--secondary" type="button" data-new-ready-preview>+ Montar prévia do site</button><button class="button button--primary workout-create-button" type="button" data-new-ready-program>+ Novo treino</button></div></div><div class="ready-library-toolbar"><select data-ready-status aria-label="Filtrar treinos prontos por situação"><option value="all">Todas as fichas</option><option value="published">Publicadas</option><option value="draft">Rascunhos</option></select></div><div class="media-library-grid" data-ready-workout-grid></div>`
  page.append(panel)

  const dialog = document.createElement('dialog')
  dialog.className = 'modal modal--wide'
  dialog.dataset.readyProgramDialog = ''
  dialog.innerHTML = `<form method="dialog"><header><div><span class="eyebrow eyebrow--blue">Ficha geral</span><h2>Montar treino pronto completo</h2></div><button class="icon-button" type="button" data-ready-close aria-label="Fechar">×</button></header><div class="modal-body"><label class="field"><span>Nome do programa</span><input name="name" required placeholder="Ex.: Hipertrofia avançada"></label><div class="field-grid field-grid--three"><label class="field"><span>Objetivo</span><select name="goal"><option>Hipertrofia</option><option>Emagrecimento</option><option>Condicionamento</option><option>Força</option></select></label><label class="field"><span>Nível</span><select name="level"><option>Iniciante</option><option selected>Intermediário</option><option>Avançado</option></select></label><label class="field"><span>Quantidade de semanas</span><input name="durationWeeks" type="number" min="1" max="104" value="12" required></label></div><div class="field-grid field-grid--three"><label class="field"><span>Divisão do treino</span><select name="division"><option value="fullbody">Full body</option><option value="ab">AB</option><option value="abc">ABC</option><option value="abcd">ABCD</option><option value="abcde" selected>ABCDE</option><option value="abcdef">ABCDEF</option></select></label><label class="field"><span>Cor da ficha</span><select name="colorTheme"><option value="blue">Azul FARISA</option><option value="red">Vermelho e grafite</option><option value="green">Verde</option><option value="black">Preto</option></select></label><label class="field"><span>Descrição</span><input name="description" placeholder="Resumo e orientações gerais"></label></div><section class="ready-workout-wizard"><div class="ready-session-tabs" data-ready-session-tabs></div><div class="ready-wizard-heading"><div><span class="eyebrow eyebrow--blue">Etapa atual</span><h3 data-ready-current-title></h3></div><p>Abra um grupo muscular e marque os exercícios desta etapa.</p></div><div class="ready-exercise-catalog" data-ready-exercise-catalog></div><button class="button button--secondary ready-next-button" type="button" data-ready-next></button><div class="workout-prescription-builder" data-ready-prescriptions></div></section><label class="check-field"><input name="published" type="checkbox" value="1"><span>Publicar para todos que compraram Treinos Prontos</span></label><p role="status" aria-live="polite"></p></div><footer><button class="button button--secondary" type="button" data-ready-close>Cancelar</button><button class="button button--primary" type="submit">Salvar treino pronto</button></footer></form>`
  document.body.append(dialog)
  const form = dialog.querySelector('form')
  form.elements.division.addEventListener('change', () => {
    captureReadyPrescriptionFields(form)
    const allowed = new Set(readySessionLabels(form))
    ;[...form.readyPrescriptionMap.entries()].forEach(([id, item]) => {
      if (!allowed.has(item.sessionLabel)) form.readyPrescriptionMap.delete(id)
    })
    form.readyActiveSession = readySessionLabels(form)[0]
    form.readyVisibleSessionCount = 1
    renderReadyWizard(form)
  })
  form.querySelector('[data-ready-next]').addEventListener('click', () => {
    captureReadyPrescriptionFields(form)
    const labels = readySessionLabels(form)
    const nextIndex = labels.indexOf(form.readyActiveSession) + 1
    if (labels[nextIndex]) {
      form.readyVisibleSessionCount = Math.max(form.readyVisibleSessionCount || 1, nextIndex + 1)
      form.readyActiveSession = labels[nextIndex]
      renderReadyWizard(form)
    }
  })
  dialog
    .querySelectorAll('[data-ready-close]')
    .forEach((button) => button.addEventListener('click', () => dialog.close()))
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    const exercisePrescriptions = readyPrescriptionValues(form)
    if (!exercisePrescriptions.length) return
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    try {
      const saved = await persistReadyProgram(
        {
          name: form.elements.name.value,
          goal: form.elements.goal.value,
          level: form.elements.level.value,
          duration: `${form.elements.durationWeeks.value} ${Number(form.elements.durationWeeks.value) === 1 ? 'semana' : 'semanas'}`,
          description: form.elements.description.value,
          colorTheme: form.elements.colorTheme.value,
          published: form.elements.published.checked,
          exercisePrescriptions,
        },
        editingReadyProgram,
      )
      const savedId = saved?.id || saved?.data?.id
      if (form.readyAsPreview && savedId) await setReadyProgramSitePreview(savedId, true)
      dialog.close()
      showToast(
        form.readyAsPreview
          ? 'Prévia do site salva. O “Ver prévia” do site já mostra este treino.'
          : form.elements.published.checked
            ? 'Treino pronto publicado para os compradores.'
            : 'Treino pronto salvo como rascunho.',
      )
      window.dispatchEvent(new Event('farisa:remote-refresh'))
    } catch (error) {
      form.querySelector('[role="status"]').textContent = error.message
    } finally {
      button.disabled = false
    }
  })
  panel
    .querySelector('[data-new-ready-program]')
    .addEventListener('click', () => openReadyProgramDialog())
  panel
    .querySelector('[data-ready-status]')
    .addEventListener('change', () => renderReadyWorkoutLibrary())
  panel
    .querySelector('[data-new-ready-preview]')
    .addEventListener('click', () => openReadyProgramDialog(null, { asPreview: true }))
  renderReadyWorkoutLibrary()
}

function renderReadyWorkoutLibrary() {
  const grid = document.querySelector('[data-ready-workout-grid]')
  if (!grid) return
  // Prévia do site e treinos dos compradores no mesmo formato de cartão; a
  // prévia vem primeiro e ganha só a borda roxa e a etiqueta "Prévia do site".
  const status = document.querySelector('[data-ready-status]')?.value || 'all'
  const programs = [...(getData().readyPrograms || [])]
    .filter(
      (program) =>
        status === 'all' ||
        (status === 'published' && program.published) ||
        (status === 'draft' && !program.published),
    )
    .sort(
    (a, b) => Number(Boolean(b.sitePreview)) - Number(Boolean(a.sitePreview)),
  )
  grid.replaceChildren()
  programs.forEach((program) => {
    try {
      program.exercisePrescriptions = JSON.parse(program.exercisePrescriptionsJson || '[]')
    } catch {
      program.exercisePrescriptions = []
    }
    const sessions = [
      ...new Set(program.exercisePrescriptions.map((item) => item.sessionLabel)),
    ].sort()
    const card = document.createElement('section')
    card.className = 'media-library-card'
    card.innerHTML = `<div><div class="ready-card-tags"><span class="tag ${program.published ? 'tag--published' : 'tag--draft'}">${program.published ? 'Publicado' : 'Rascunho'}</span>${program.sitePreview ? '<span class="tag tag--preview">Prévia do site</span>' : ''}</div><h3></h3><p></p><small></small></div><div class="media-library-actions"></div>`
    if (program.sitePreview) {
      card.classList.add('media-library-card--preview')
      card.title = program.published
        ? 'Prévia do site — também liberada para os compradores.'
        : 'Prévia do site — só os visitantes veem; não vai para os compradores.'
    }
    card.querySelector('h3').textContent = program.name
    card.querySelector('p').textContent =
      program.description || `${program.goal} · ${program.level}`
    card.querySelector('small').textContent =
      `${program.duration} · Treinos ${sessions.join(', ') || 'A'} · ${program.exercisePrescriptions.length} exercícios`
    const actions = card.querySelector('.media-library-actions')
    const pdf = document.createElement('button')
    pdf.className = 'button button--secondary'
    pdf.type = 'button'
    pdf.textContent = 'Baixar PDF completo'
    pdf.addEventListener('click', () =>
      void downloadWorkoutPdf(
        {
          ...program,
          exercises: program.exercisePrescriptions,
          readyProgram: true,
        },
        'Treino Pronto',
        loadExerciseGifFrame,
      ).catch((error) => showToast(error.message)),
    )
    const edit = document.createElement('button')
    edit.className = 'button button--secondary'
    edit.type = 'button'
    edit.textContent = 'Editar'
    edit.addEventListener('click', () => openReadyProgramDialog(program))
    const remove = document.createElement('button')
    remove.className = 'button button--secondary'
    remove.type = 'button'
    remove.textContent = 'Excluir'
    remove.addEventListener('click', async () => {
      const ok = await askConfirm({
        eyebrow: 'Treinos Prontos',
        title: 'Excluir treino pronto?',
        message: `O treino “${program.name}” sai do painel e da área dos alunos.`,
        note: 'Esta ação não pode ser desfeita.',
      })
      if (!ok) return
      await removeReadyProgram(program.id)
      showToast('Treino pronto excluído.')
      window.dispatchEvent(new Event('farisa:remote-refresh'))
    })
    const toggle = document.createElement('button')
    toggle.className = program.published ? 'button button--secondary' : 'button button--primary'
    toggle.type = 'button'
    toggle.textContent = program.published ? 'Despublicar' : 'Publicar para os alunos'
    toggle.addEventListener('click', async () => {
      toggle.disabled = true
      try {
        await persistReadyProgram(
          {
            name: program.name,
            goal: program.goal,
            level: program.level,
            duration: program.duration,
            description: program.description,
            colorTheme: program.colorTheme,
            published: !program.published,
            exercisePrescriptions: program.exercisePrescriptions,
          },
          program.id,
        )
        showToast(
          program.published
            ? 'Treino pronto voltou para rascunho.'
            : 'Treino pronto publicado. Já aparece na área do aluno.',
        )
        window.dispatchEvent(new Event('farisa:remote-refresh'))
      } catch (error) {
        showToast(error.message)
      } finally {
        toggle.disabled = false
      }
    })
    // Prévia do site: o botão "Ver prévia" do card Treinos Prontos mostra
    // este treino. Só um fica marcado; marcar outro desmarca o anterior.
    const sitePreview = document.createElement('button')
    sitePreview.className = 'button button--secondary'
    sitePreview.type = 'button'
    sitePreview.textContent = program.sitePreview
      ? 'Tirar da prévia do site'
      : 'Usar como prévia do site'
    sitePreview.addEventListener('click', async () => {
      sitePreview.disabled = true
      try {
        const result = await setReadyProgramSitePreview(program.id, !program.sitePreview)
        showToast(
          program.sitePreview
            ? 'Este treino deixou de ser a prévia do site.'
            : result?.affectsSite === false
              ? 'Marcado como prévia. O site mostra a prévia do personal dono do site.'
              : 'Pronto! O “Ver prévia” do site agora mostra este treino.',
        )
        window.dispatchEvent(new Event('farisa:remote-refresh'))
      } catch (error) {
        showToast(error.message)
      } finally {
        sitePreview.disabled = false
      }
    })
    actions.append(toggle, sitePreview, pdf, edit, remove)
    grid.append(card)
  })
  if (!programs.length) {
    const empty = document.createElement('p')
    empty.textContent =
      status === 'all'
        ? 'Nenhum treino pronto montado. Crie o primeiro programa completo ABCDE.'
        : status === 'published'
          ? 'Nenhum treino pronto publicado.'
          : 'Nenhum rascunho.'
    grid.append(empty)
  }
}

function createExerciseVideoLibraryPanel() {
  const page = document.querySelector('[data-route="exercicios"]')
  if (!page || page.querySelector('[data-exercise-video-library]')) return
  const panel = document.createElement('article')
  panel.className = 'panel media-library-panel'
  panel.dataset.exerciseVideoLibrary = ''
  panel.innerHTML = `<div class="panel-heading"><div><span class="eyebrow eyebrow--blue">Biblioteca de MP4</span><h2>Vídeos por grupo muscular</h2><p>Envie e publique os vídeos diretamente pelo painel.</p></div></div><form class="media-upload-form" data-exercise-video-upload><div class="field-grid"><label class="field"><span>Nome do exercício</span><input name="name" required placeholder="Ex.: Supino reto com barra"></label><label class="field"><span>Arquivo MP4</span><input name="video" type="file" accept="video/mp4,.mp4" required></label></div><div class="field-grid field-grid--three"><label class="field"><span>Grupo muscular</span><select name="group" required data-video-muscle-group></select></label><label class="field"><span>Equipamento</span><input name="equipment" placeholder="Ex.: Barra e banco"></label><label class="field"><span>Dificuldade</span><select name="difficulty"><option>Iniciante</option><option selected>Intermediário</option><option>Avançado</option></select></label></div><label class="field"><span>Instruções</span><textarea name="instructions" rows="3" placeholder="Orientações de execução e segurança"></textarea></label><label class="check-field"><input name="published" type="checkbox" value="1"><span>Publicar imediatamente para alunos com acesso ativo</span></label><small>Somente MP4, com no máximo 90 MB.</small><button class="button button--primary" type="submit">Enviar vídeo</button><p role="status" aria-live="polite"></p></form><div class="video-group-library" data-exercise-video-groups></div>`
  const groupSelect = panel.querySelector('[data-video-muscle-group]')
  syncVideoGroupOptions(groupSelect)
  const dropzone = document.createElement('div')
  dropzone.className = 'gif-dropzone'
  dropzone.innerHTML = `<strong>Arraste aqui a pasta dos vídeos MP4</strong>
    <span>ou clique para escolher os arquivos .mp4 no computador</span>
    <input type="file" accept=".mp4,video/mp4" multiple hidden data-video-bulk-input>
    <progress data-video-bulk-progress hidden value="0" max="100"></progress>
    <p role="status" aria-live="polite" data-video-bulk-status></p>`
  const uploadForm = panel.querySelector('form')
  uploadForm.before(dropzone)
  const bulkInput = dropzone.querySelector('[data-video-bulk-input]')
  const bulkBar = dropzone.querySelector('[data-video-bulk-progress]')
  const bulkStatus = dropzone.querySelector('[data-video-bulk-status]')
  const sendVideos = async (files, forceGroup = '') => {
    const recebidos = [...files]
    const chosen = recebidos.filter(
      (file) =>
        file.type === 'video/mp4' ||
        file.name.toLocaleLowerCase('pt-BR').endsWith('.mp4'),
    )
    if (!chosen.length) {
      const amostra = recebidos
        .slice(0, 3)
        .map((file) => file.name)
        .join(', ')
      bulkStatus.textContent = recebidos.length
        ? `Recebi ${recebidos.length} arquivo(s), mas nenhum é .mp4${amostra ? ` (ex.: ${amostra})` : ''}.`
        : 'Não chegou nenhum arquivo.'
      return
    }
    let enviados = 0
    const falhas = []
    let concluidos = 0
    const paint = () => {
      bulkBar.max = chosen.length
      bulkBar.value = concluidos
      bulkBar.hidden = false
      bulkStatus.textContent = `Enviando ${concluidos} de ${chosen.length}… (${enviados} enviados${falhas.length ? `, ${falhas.length} com erro` : ''})`
    }
    paint()
    const fila = chosen.slice()
    // Dois de cada vez: MP4 é pesado e o limite do servidor é 90 MB por arquivo.
    const worker = async () => {
      while (fila.length) {
        const file = fila.shift()
        const folder = (file.webkitRelativePath || '').split('/').slice(-2, -1)[0]
        const group =
          forceGroup ||
          groupFromFolder(folder) ||
          groupFromFolder(file.name) ||
          groupSelect.value
        try {
          const payload = new FormData()
          payload.append('video', file)
          payload.append(
            'name',
            file.name
              .replace(/\.mp4$/iu, '')
              .replace(/[-_+]+/gu, ' ')
              .trim() || 'Exercício',
          )
          payload.append('group', group)
          payload.append('difficulty', 'Intermediário')
          payload.append('published', '1')
          // Em lote o vídeo entra só no acervo, sem virar exercício solto.
          payload.append('catalog', '0')
          await uploadExerciseVideo(payload)
          enviados += 1
        } catch (error) {
          falhas.push(`${file.name}: ${error.message}`)
        }
        concluidos += 1
        paint()
      }
    }
    await Promise.all([worker(), worker()])
    bulkBar.hidden = true
    bulkStatus.textContent = `Pronto: ${enviados} vídeo(s) enviados${falhas.length ? `, ${falhas.length} não subiram` : ''}.`
    if (falhas.length) console.warn('MP4 com erro:', falhas)
    showToast(`Biblioteca de MP4 atualizada (${enviados} novos).`)
    window.dispatchEvent(new Event('farisa:remote-refresh'))
  }
  // Usado também pelo botão "+ Enviar vídeos aqui" de cada pasta.
  sendVideosToLibrary = sendVideos
  dropzone.addEventListener('click', () => bulkInput.click())
  bulkInput.addEventListener('change', async (event) => {
    if (!event.target.files?.length) return
    const files = event.target.files
    event.target.value = ''
    await sendVideos(files)
  })
  ;['dragenter', 'dragover'].forEach((type) =>
    dropzone.addEventListener(type, (event) => {
      event.preventDefault()
      dropzone.classList.add('is-over')
    }),
  )
  dropzone.addEventListener('dragleave', () =>
    dropzone.classList.remove('is-over'),
  )
  dropzone.addEventListener('drop', async (event) => {
    event.preventDefault()
    dropzone.classList.remove('is-over')
    bulkStatus.textContent = 'Lendo os arquivos…'
    await sendVideos(await filesFromDrop(event.dataTransfer))
  })

  const form = panel.querySelector('form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    const button = form.querySelector('[type="submit"]')
    const status = form.querySelector('[role="status"]')
    button.disabled = true
    button.textContent = 'Enviando vídeo…'
    status.textContent = ''
    try {
      await uploadExerciseVideo(new FormData(form))
      form.reset()
      showToast('Vídeo enviado para a biblioteca.')
      window.dispatchEvent(new Event('farisa:remote-refresh'))
    } catch (error) {
      status.textContent = error.message
    } finally {
      button.disabled = false
      button.textContent = 'Enviar vídeo'
    }
  })
  page.append(panel)
  renderExerciseVideoLibrary()
}

function confirmExerciseVideoDeletion(exercise) {
  let dialog = document.querySelector('[data-delete-exercise-video]')
  if (!dialog) {
    dialog = document.createElement('dialog')
    dialog.className = 'modal'
    dialog.dataset.deleteExerciseVideo = ''
    dialog.innerHTML = `<form method="dialog"><header><div><span class="eyebrow eyebrow--blue">Biblioteca de MP4</span><h2>Excluir vídeo?</h2></div><button class="icon-button" type="submit" value="cancel" formnovalidate aria-label="Fechar">×</button></header><div class="modal-body"><p>O vídeo <strong data-exercise-video-name></strong> será removido da biblioteca e deixará de aparecer para os alunos.</p><p class="password-requirements">Esta ação não pode ser desfeita.</p></div><footer><button class="button button--secondary" type="submit" value="cancel" formnovalidate>Cancelar</button><button class="button button--primary" type="submit" value="confirm">Excluir vídeo</button></footer></form>`
    document.body.append(dialog)
  }
  dialog.querySelector('[data-exercise-video-name]').textContent = exercise.name
  dialog.returnValue = 'cancel'
  dialog.showModal()
  return new Promise((resolve) =>
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {
      once: true,
    }),
  )
}

async function removeVideoGroup(groupName, videos, ownedGroup) {
  if (!videos.length && !ownedGroup) {
    showToast(
      `A pasta ${groupName} é do catálogo e já está vazia — não há nada para excluir.`,
    )
    return
  }
  const ok = await askConfirm({
    eyebrow: 'Biblioteca de MP4',
    title: `Excluir a pasta ${groupName}?`,
    message: videos.length
      ? `${videos.length} vídeo(s) serão apagados e deixam de aparecer para os alunos.`
      : 'A pasta será removida da lista de grupos musculares.',
    note: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir pasta',
  })
  if (!ok) return
  const status = document.querySelector('[data-video-bulk-status]')
  const bar = document.querySelector('[data-video-bulk-progress]')
  let apagados = 0
  const falhas = []
  const paint = () => {
    if (bar) {
      bar.max = videos.length
      bar.value = apagados + falhas.length
      bar.hidden = false
    }
    if (status)
      status.textContent = `Excluindo ${apagados + falhas.length} de ${videos.length}…`
  }
  paint()
  const fila = videos.slice()
  const worker = async () => {
    while (fila.length) {
      const video = fila.shift()
      try {
        await deleteExerciseVideo(video.id)
        apagados += 1
      } catch (error) {
        falhas.push(`${video.name}: ${error.message}`)
      }
      paint()
    }
  }
  await Promise.all([worker(), worker(), worker()])
  if (ownedGroup && !falhas.length) {
    try {
      await deleteMuscleGroup(ownedGroup.id)
    } catch {
      /* a pasta some sozinha quando fica vazia */
    }
  }
  if (bar) bar.hidden = true
  if (status)
    status.textContent = `${apagados} vídeo(s) de ${groupName} excluídos${falhas.length ? `, ${falhas.length} não saíram` : ''}.`
  if (falhas.length) console.warn('MP4 que não foram excluídos:', falhas)
  showToast(
    falhas.length
      ? `Pasta ${groupName}: ${apagados} vídeo(s) excluídos, ${falhas.length} não saíram.`
      : `Pasta ${groupName} excluída.`,
  )
  window.dispatchEvent(new Event('farisa:remote-refresh'))
}

// Opções do campo "Grupo muscular" do envio de MP4: catálogo + pastas criadas
// por você. Refeita a cada mudança de dados, para uma pasta nova já aparecer.
function syncVideoGroupOptions(target) {
  const select = target || document.querySelector('[data-video-muscle-group]')
  if (!select) return
  const escolhido = select.value
  const lista = [...muscleGroups]
  const abdomenIndex = lista.findIndex((group) => group.name === 'Abdômen')
  lista.splice(abdomenIndex + 1, 0, { id: 'pernas', name: 'Pernas' })
  const nomes = lista.map((group) => group.name)
  ;(getData().customGroups || []).forEach((item) => {
    if (!nomes.includes(item.name)) nomes.push(item.name)
  })
  select.replaceChildren(
    ...nomes.map((name) => {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      return option
    }),
  )
  if (nomes.includes(escolhido)) select.value = escolhido
}

let sendVideosToLibrary = null

// Botão da pasta na Biblioteca de MP4: escolhe vídeos .mp4 no computador e
// envia todos para esta pasta. (Antes aqui havia "+ Novo exercício", que
// abria o cadastro de exercício com a escolha de GIF.)
function videoUploadHereButton(group) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--secondary folder-add-button'
  button.textContent = '+ Enviar vídeos aqui'
  button.title = `Enviar arquivos MP4 para a pasta ${group}`
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.mp4,video/mp4'
  input.multiple = true
  input.hidden = true
  input.addEventListener('click', (event) => event.stopPropagation())
  input.addEventListener('change', async () => {
    if (!input.files?.length || !sendVideosToLibrary) return
    const files = [...input.files]
    input.value = ''
    button.disabled = true
    button.textContent = 'Enviando…'
    try {
      await sendVideosToLibrary(files, group)
    } finally {
      button.disabled = false
      button.textContent = '+ Enviar vídeos aqui'
    }
  })
  button.addEventListener('click', (event) => {
    // Dentro do <summary>: sem isso o clique abriria/fecharia a pasta.
    event.preventDefault()
    event.stopPropagation()
    input.click()
  })
  button.append(input)
  return button
}

function renderExerciseVideoLibrary() {
  syncVideoGroupOptions()
  const groups = document.querySelector('[data-exercise-video-groups]')
  if (!groups) return
  const videos = getData().exerciseVideos || []
  groups.replaceChildren()
  // Só aparecem as pastas que já têm vídeo ou que você criou. As pastas fixas
  // do catálogo (Peitoral, Costas…) surgem quando o primeiro MP4 é enviado.
  const customNames = new Set((getData().customGroups || []).map((item) => item.name))
  const visibleGroups = workoutCatalogGroups(videos)
    .map((group) => ({
      ...group,
      exercises: videos.filter((video) => group.memberNames.includes(video.group)),
    }))
    .filter((group) => group.exercises.length || customNames.has(group.name))
  if (!visibleGroups.length) {
    const empty = document.createElement('p')
    empty.className = 'video-library-empty'
    empty.textContent =
      'Nenhum vídeo ainda. Envie o primeiro MP4 acima: a pasta do grupo muscular aparece aqui automaticamente.'
    groups.append(empty)
  }
  visibleGroups.forEach((group) => {
      // Mesmo formato das pastas da Biblioteca de GIFs.
      const section = document.createElement('details')
      section.className = 'exercise-folder video-muscle-group'
      if (group.exercises.length) section.open = true
      const summary = document.createElement('summary')
      const groupName = document.createElement('span')
      groupName.className = 'exercise-folder-name'
      groupName.textContent = group.name
      const groupCount = document.createElement('span')
      groupCount.className = 'exercise-folder-count'
      groupCount.textContent = `${group.exercises.length} vídeo(s)`
      summary.append(groupName, groupCount, videoUploadHereButton(group.name))
      const ownedGroup = (getData().customGroups || []).find(
        (item) => item.name === group.name,
      )
      const wipe = document.createElement('button')
      wipe.type = 'button'
      wipe.className = 'button button--secondary gif-group-remove'
      wipe.textContent = 'Excluir pasta'
      wipe.title = `Excluir a pasta ${group.name}`
      wipe.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        void removeVideoGroup(group.name, group.exercises, ownedGroup)
      })
      summary.append(wipe)
      const content = document.createElement('div')
      content.className = 'video-library-grid'
      if (!group.exercises.length) {
        const empty = document.createElement('p')
        empty.textContent = 'Nenhum MP4 enviado para este grupo.'
        content.append(empty)
      }
      group.exercises.forEach((exercise) => {
        const card = document.createElement('article')
        card.className = 'video-library-card'
        const title = document.createElement('h3')
        title.textContent = exercise.name
        const meta = document.createElement('p')
        meta.textContent = `${exercise.equipment || 'Sem equipamento'} · ${exercise.difficulty}${exercise.published ? ' · publicado' : ' · rascunho'}`
        // Mostra se o vídeo está ligado a algum exercício (só assim chega ao aluno).
        const linked = (getData().exercises || []).filter(
          (item) => String(item.videoId || '') === String(exercise.id),
        ).length
        const usage = document.createElement('span')
        usage.className = `gif-status ${linked ? 'gif-status--on' : 'gif-status--off'}`
        usage.textContent = linked
          ? `ligado a ${linked} exercício(s)`
          : 'não ligado a exercício'
        meta.append(' ', usage)
        const instructions = document.createElement('p')
        instructions.textContent = exercise.instructions || 'Sem instruções adicionais.'
        const size = document.createElement('small')
        size.textContent = `${(Number(exercise.sizeBytes) / 1024 / 1024).toFixed(1)} MB`
        const actions = document.createElement('div')
        actions.className = 'media-library-actions'
        const preview = document.createElement('button')
        preview.className = 'button button--secondary'
        preview.type = 'button'
        preview.textContent = 'Carregar vídeo'
        // Abre o vídeo dentro do cartão e o mesmo botão vira "Fechar vídeo"
        // (antes não havia como fechar depois de abrir).
        let player = null
        const closePlayer = () => {
          if (!player) return
          player.pause()
          const url = player.src
          player.closest('.video-library-player')?.remove()
          player = null
          if (url.startsWith('blob:')) URL.revokeObjectURL(url)
          preview.textContent = 'Carregar vídeo'
        }
        preview.addEventListener('click', async () => {
          if (player) {
            closePlayer()
            return
          }
          preview.disabled = true
          preview.textContent = 'Carregando…'
          try {
            const video = document.createElement('video')
            video.controls = true
            video.preload = 'metadata'
            video.playsInline = true
            video.src = await loadExerciseVideo(exercise.id)
            video.addEventListener('loadedmetadata', () => video.play().catch(() => {}), {
              once: true,
            })
            const wrap = document.createElement('div')
            wrap.className = 'video-library-player'
            const close = document.createElement('button')
            close.type = 'button'
            close.className = 'video-library-close'
            close.setAttribute('aria-label', 'Fechar vídeo')
            close.title = 'Fechar vídeo'
            close.textContent = '×'
            close.addEventListener('click', closePlayer)
            wrap.append(video, close)
            card.prepend(wrap)
            player = video
            preview.textContent = 'Fechar vídeo'
          } catch (error) {
            preview.textContent = 'Carregar vídeo'
            showToast(error.message)
          } finally {
            preview.disabled = false
          }
        })
        const remove = document.createElement('button')
        remove.className = 'button button--secondary'
        remove.type = 'button'
        remove.textContent = 'Excluir'
        remove.addEventListener('click', async () => {
          if (!(await confirmExerciseVideoDeletion(exercise))) return
          remove.disabled = true
          try {
            await deleteExerciseVideo(exercise.id)
            showToast('Vídeo excluído da biblioteca.')
            window.dispatchEvent(new Event('farisa:remote-refresh'))
          } catch (error) {
            remove.disabled = false
            showToast(error.message)
          }
        })
        actions.append(preview, remove)
        card.append(title, meta, instructions, size, actions)
        content.append(card)
      })
      section.append(summary, content)
      groups.append(section)
    })
}

function enhanceAssessment() {
  const body = document.querySelector('[data-form="assessment"] .modal-body')
  if (!body || body.querySelector('[name="published"]')) return
  const publish = document.createElement('label')
  publish.className = 'check-field'
  publish.innerHTML = `<input name="published" type="checkbox" value="1"><span>Publicar esta avaliação para o aluno</span>`
  body.append(publish)
}

function createAccessDialog() {
  if (document.querySelector('[data-access-dialog]')) return
  const dialog = document.createElement('dialog')
  dialog.className = 'modal'
  dialog.dataset.accessDialog = ''
  dialog.innerHTML = `<form method="dialog" data-access-form><header><div><span class="eyebrow eyebrow--blue">Plano e pagamento</span><h2>Liberar acesso do aluno</h2></div><button class="icon-button" type="button" data-access-close aria-label="Fechar">×</button></header><div class="modal-body"><p data-access-student></p><label class="field"><span>Plano</span><select name="planCode"><option value="ready">Treinos Prontos — permanente</option><option value="basic">Consultoria Básica</option><option value="premium">Consultoria Premium</option><option value="athlete">Performance Atleta</option></select></label><label class="field" data-access-billing-field><span>Período</span><select name="billingCycle"><option value="monthly">Mensal — 30 dias</option><option value="quarterly">Trimestral — 90 dias, recomendado</option><option value="semiannual">Semestral — 180 dias</option><option value="annual">Anual — 365 dias</option></select></label><div class="field-grid"><label class="field"><span>Situação</span><select name="accessStatus"><option value="active">Liberar acesso</option><option value="pending">Aguardando</option><option value="paused">Pausar</option><option value="cancelled">Cancelar</option></select></label><label class="field"><span>Pagamento</span><select name="paymentStatus"><option value="paid">Confirmado</option><option value="waived">Liberado sem pagamento</option><option value="pending">Pendente</option><option value="refunded">Estornado</option></select></label></div><label class="field"><span>Forma de pagamento</span><select name="paymentMethod"><option value="whatsapp">WhatsApp / pessoalmente</option><option value="pix">PIX manual</option><option value="cash">Dinheiro</option><option value="webapp">WebApp</option><option value="courtesy">Cortesia / sem cobrança</option></select></label><label class="field"><span>Validade personalizada (opcional)</span><input name="expiresAt" type="date"></label><p class="password-requirements">A validade é calculada pelo período: 30, 90, 180 ou 365 dias. Treinos Prontos não expiram. Com "Liberar acesso", o aluno entra tanto com pagamento confirmado quanto com "Liberado sem pagamento".</p><p role="status"></p></div><footer><button class="button button--secondary" type="button" data-access-close>Cancelar</button><button class="button button--primary" type="submit">Salvar acesso</button></footer></form>`
  document.body.append(dialog)
  const accessForm = dialog.querySelector('form')
  const syncAccessPeriod = () => {
    const permanent = accessForm.elements.planCode.value === 'ready'
    accessForm.querySelector('[data-access-billing-field]').hidden = permanent
    if (permanent) accessForm.elements.billingCycle.value = 'monthly'
  }
  accessForm.elements.planCode.addEventListener('change', syncAccessPeriod)
  dialog
    .querySelectorAll('[data-access-close]')
    .forEach((button) => button.addEventListener('click', () => dialog.close()))
  dialog.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const status = form.querySelector('[role="status"]')
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    status.textContent = 'Salvando…'
    try {
      await updateStudentAccess(form.dataset.studentId, Object.fromEntries(new FormData(form)))
      dialog.close()
      showToast('Acesso do aluno atualizado.')
      window.dispatchEvent(new Event('farisa:remote-refresh'))
    } catch (error) {
      status.textContent = error.message
    } finally {
      button.disabled = false
    }
  })
  window.addEventListener('farisa:manage-access', (event) => {
    const student = getData().students.find(
      (item) => String(item.id) === String(event.detail),
    )
    if (!student) return
    const form = dialog.querySelector('form')
    form.dataset.studentId = student.id
    form.querySelector('[data-access-student]').textContent = `${student.name} · ${student.email}`
    form.elements.planCode.value = student.planCode || 'basic'
    form.elements.billingCycle.value = ['monthly', 'quarterly', 'semiannual', 'annual'].includes(
      student.billingCycle,
    )
      ? student.billingCycle
      : 'quarterly'
    syncAccessPeriod()
    form.elements.accessStatus.value = student.accessStatus || 'pending'
    form.elements.paymentStatus.value = student.paymentStatus || 'pending'
    form.elements.paymentMethod.value = student.paymentMethod || 'whatsapp'
    form.elements.expiresAt.value = student.accessExpiresAt?.slice(0, 10) || ''
    form.querySelector('[role="status"]').textContent = ''
    dialog.showModal()
  })
}

function connectPlanCards() {
  const mapping = ['ready', 'basic', 'premium', 'athlete']
  document.querySelectorAll('.plan-card').forEach((card, index) => {
    const link = card.querySelector('a:not(.plan-whatsapp-link)')
    if (!link || !mapping[index]) return
    link.href = `#cadastro-aluno?plan=${mapping[index]}`
    link.textContent = 'Escolher plano'
    card.querySelector('.plan-whatsapp-link')?.remove()
  })
}

function createOperationsPanel() {
  const page = document.querySelector('[data-route="painel"]')
  if (!page || page.querySelector('[data-operations-panel]')) return
  const panel = document.createElement('article')
  panel.className = 'panel'
  panel.dataset.operationsPanel = ''
  const heading = document.createElement('div')
  heading.className = 'panel-heading'
  heading.innerHTML =
    '<div><h2>Solicitações e check-ins</h2><p>Cadastros pendentes e resumo dos check-ins</p></div>'
  const content = document.createElement('div')
  content.dataset.operationsContent = ''
  panel.append(heading, content)
  page.append(panel)
}

function renderOperations() {
  const content = document.querySelector('[data-operations-content]')
  if (!content) return
  const data = getData()
  const pending = (data.students || []).filter(
    (student) =>
      student.accessStatus !== 'cancelled' &&
      (student.accessStatus !== 'active' ||
        !['paid', 'waived'].includes(student.paymentStatus)),
  )
  const checkins = data.checkins || []
  content.replaceChildren()
  if (!pending.length && !checkins.length) {
    content.append(document.createTextNode('Nenhuma solicitação ou check-in pendente.'))
    return
  }
  pending.slice(0, 6).forEach((student) => {
    const item = document.createElement('p')
    const freeRelease = document.createElement('button')
    freeRelease.className = 'link-button'
    freeRelease.type = 'button'
    freeRelease.textContent = 'Liberar sem pagamento'
    freeRelease.addEventListener('click', () => quickReleaseAccess(student, freeRelease))
    if (student.accountId) {
      item.append(
        document.createTextNode(
          `${student.name} · pagamento online pendente · libera sozinho quando o Mercado Pago confirmar · `,
        ),
        freeRelease,
      )
      content.append(item)
      return
    }
    const release = document.createElement('button')
    release.className = 'link-button'
    release.type = 'button'
    release.textContent = 'Confirmar pagamento presencial e liberar'
    release.addEventListener('click', async () => {
      const ok = await askConfirm({
        eyebrow: 'Liberar acesso',
        title: 'Confirmar pagamento presencial?',
        message: `O acesso de ${student.name} será liberado agora.`,
        confirmLabel: 'Liberar acesso',
        danger: false,
      })
      if (!ok) return
      release.disabled = true
      release.textContent = 'Liberando…'
      try {
        await updateStudentAccess(student.id, {
          planCode: student.planCode || 'basic',
          billingCycle: student.billingCycle || 'quarterly',
          accessStatus: 'active',
          paymentStatus: 'paid',
          paymentMethod: student.paymentMethod || 'manual',
        })
        showToast('Pagamento confirmado. O conteúdo já está liberado para o aluno.')
        window.dispatchEvent(new Event('farisa:remote-refresh'))
      } catch (error) {
        showToast(error.message)
        release.disabled = false
        release.textContent = 'Confirmar pagamento presencial e liberar'
      }
    })
    const button = document.createElement('button')
    button.className = 'link-button'
    button.type = 'button'
    button.textContent = 'Gerenciar acesso'
    button.addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('farisa:manage-access', { detail: student.id })),
    )
    item.append(
      document.createTextNode(
        `${student.name} · ${student.planCode || 'basic'} · ${billingCycleLabels[student.billingCycle] || 'período não definido'} · pagamento pendente · `,
      ),
      release,
      document.createTextNode(' · '),
      freeRelease,
      document.createTextNode(' · '),
      button,
    )
    content.append(item)
  })
  // Os check-ins agora têm página própria (menu "Check-ins"); aqui fica só
  // um resumo com o atalho.
  const waiting = checkins.filter((checkin) => !checkin.trainerFeedback).length
  if (checkins.length) {
    const item = document.createElement('p')
    const link = document.createElement('a')
    link.href = '#checkins'
    link.className = 'link-button'
    link.textContent = 'Abrir check-ins'
    item.append(
      document.createTextNode(
        waiting
          ? `${waiting} check-in(s) aguardando sua resposta · `
          : 'Todos os check-ins respondidos · ',
      ),
      link,
    )
    content.append(item)
  }
}

export function initIntegratedPortal() {
  enhanceRegistration()
  enhanceWorkout()
  enhanceExercise()
  configureMuscleGroupFields()
  createReadyWorkoutLibraryPanel()
  createExerciseVideoLibraryPanel()
  enhanceAssessment()
  createAppointmentDialog()
  createAccessDialog()
  connectPlanCards()
  createOperationsPanel()
  renderOperations()
  window.addEventListener('farisa:edit-workout', (event) => {
    const workout = getData().workouts.find(
      (item) => String(item.id) === String(event.detail),
    )
    if (!workout) return
    if (!Array.isArray(workout.exerciseIds))
      try {
        workout.exerciseIds = JSON.parse(workout.exerciseIdsJson || '[]')
      } catch {
        workout.exerciseIds = []
      }
    if (!Array.isArray(workout.exercisePrescriptions))
      try {
        workout.exercisePrescriptions = JSON.parse(workout.exercisePrescriptionsJson || '[]')
      } catch {
        workout.exercisePrescriptions = []
      }
    queueMicrotask(() => {
      const form = document.querySelector('[data-form="workout"]')
      resetWorkoutWizard(form, workout.exercisePrescriptions)
    })
  })
  window.addEventListener('farisa:data-changed', () => {
    renderOperations()
    renderReadyWorkoutLibrary()
    renderExerciseVideoLibrary()
    const workoutForm = document.querySelector('[data-form="workout"]')
    if (workoutForm?.workoutPrescriptionMap) renderWorkoutWizard(workoutForm)
  })
}
