import { createId, getData, updateData } from './state.js'
import { showToast } from './utils.js'
import { persistRecord, syncRemoteData } from './api-client.js'
import { setExerciseGifField } from './exercise-gifs.js'

const editing = {
  student: null,
  workout: null,
  exercise: null,
  appointment: null,
}
const openModal = (name) => {
  const modal = document.querySelector(`[data-modal="${name}"]`)
  if (!modal.open) modal.showModal()
}
function closeModal(form) {
  form.closest('dialog').close()
  form.reset()
  editing[form.dataset.form] = null
}
const formData = (form) => new FormData(form)
const value = (form, field) => formData(form).get(field)?.toString().trim() || ''
const checked = (form, field) => Boolean(formData(form).get(field))

function saveAndRefresh(collection, record, id) {
  void persistRecord(collection, record, id)
    .then(syncRemoteData)
    .catch((error) => showToast(error.message))
}
function generatePassword() {
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const specials = '@#$%&*!?'
  const random = (max) => crypto.getRandomValues(new Uint32Array(1))[0] % max
  const pick = (set) => set[random(set.length)]
  const every = lower + upper + digits + specials
  const characters = [pick(lower), pick(upper), pick(digits), pick(specials)]
  while (characters.length < 12) characters.push(pick(every))
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = random(index + 1)
    ;[characters[index], characters[swap]] = [characters[swap], characters[index]]
  }
  return characters.join('')
}
function toggleStudentPassword(form, enabled) {
  const wrapper = form.querySelector('[data-student-password-field]')
  const field = form.elements.password
  if (!wrapper || !field) return
  wrapper.hidden = !enabled
  field.disabled = !enabled
  field.value = ''
}
async function handleStudent(form) {
  const editingId = editing.student
  const record = {
    name: value(form, 'name'),
    email: value(form, 'email'),
    goal: value(form, 'goal'),
    status: value(form, 'status'),
    assessmentDate: value(form, 'assessmentDate'),
  }
  if (!editingId) record.password = value(form, 'password')
  await persistRecord('students', record, editingId)
  await syncRemoteData()
  showToast(
    editingId
      ? 'Aluno atualizado com sucesso.'
      : record.password
        ? `Aluno cadastrado! Ele já entra com ${record.email} e a senha definida.`
        : 'Aluno cadastrado com sucesso.',
  )
  editing.student = null
}
function handleWorkout(form) {
  const savedPrescriptions = form.workoutPrescriptionMap
    ? [...form.workoutPrescriptionMap.values()].sort(
        (a, b) =>
          String(a.sessionLabel || 'A').localeCompare(String(b.sessionLabel || 'A')) ||
          Number(a.position || 0) - Number(b.position || 0),
      )
    : [...form.querySelectorAll('[data-workout-prescription]')].map((row) => ({
        exerciseId: row.dataset.exerciseId,
        sessionLabel: row.querySelector('[name="prescriptionSession"]').value,
        sets: row.querySelector('[name="prescriptionSets"]').value,
        repetitions: row.querySelector('[name="prescriptionRepetitions"]').value.trim(),
        restSeconds: row.querySelector('[name="prescriptionRestSeconds"]').value,
        notes: row.querySelector('[name="prescriptionNotes"]').value.trim(),
      }))
  if (!savedPrescriptions.length)
    throw new Error('Escolha pelo menos um exercício para salvar a ficha.')
  const exercisePrescriptions = savedPrescriptions.map((prescription) => {
    const exercise = getData().exercises.find(
      (item) => String(item.id) === String(prescription.exerciseId),
    )
    return {
      exerciseId: prescription.exerciseId,
      name: exercise?.name,
      group: exercise?.group,
      equipment: exercise?.equipment,
      difficulty: exercise?.difficulty,
      instructions: exercise?.instructions,
      mediaType: exercise?.mediaType,
      mediaUrl: exercise?.mediaUrl,
      thumbnailUrl: exercise?.thumbnailUrl,
      sessionLabel: prescription.sessionLabel || 'A',
      sets: String(prescription.sets || '3'),
      repetitions: String(prescription.repetitions || '10-12').trim(),
      restSeconds: String(prescription.restSeconds ?? '60'),
      notes: String(prescription.notes || '').trim(),
    }
  })
  const record = {
    name: value(form, 'name'),
    student: value(form, 'student'),
    goal: value(form, 'goal'),
    duration: value(form, 'duration'),
    exerciseIds: exercisePrescriptions.map((item) => item.exerciseId),
    exercisePrescriptions,
    published: checked(form, 'published'),
    permanentAccess: false,
  }
  updateData((d) => {
    const old = d.workouts.find((w) => w.id === editing.workout)
    if (old)
      Object.assign(old, record, {
        publishedAt: record.published ? old.publishedAt || new Date().toISOString() : null,
        exerciseCount: record.exerciseIds.length,
      })
    else
      d.workouts.unshift({
        id: createId('w'),
        ...record,
        progress: 0,
        publishedAt: record.published ? new Date().toISOString() : null,
        exerciseCount: record.exerciseIds.length,
      })
  })
  showToast(
    record.published ? 'Ficha salva e publicada para o aluno.' : 'Ficha salva como rascunho.',
  )
  saveAndRefresh('workouts', record, editing.workout)
  editing.workout = null
}
function handleExercise(form) {
  // Um exercício pode trabalhar mais de um grupo muscular: "group" agora é
  // uma lista de caixas marcadas, salva como texto separado por vírgula.
  const groups = formData(form)
    .getAll('group')
    .map((entry) => entry.toString().trim())
    .filter(Boolean)
  if (!groups.length) throw new Error('Marque pelo menos um grupo muscular.')
  const record = {
    name: value(form, 'name'),
    group: groups.join(', '),
    equipment: value(form, 'equipment'),
    instructions: value(form, 'instructions'),
    difficulty: value(form, 'difficulty'),
    mediaType: value(form, 'mediaType'),
    mediaUrl: value(form, 'mediaUrl'),
    animationClip: value(form, 'animationClip'),
    gifId: value(form, 'gifId'),
    // Vídeo MP4 da biblioteca (formato "Vídeo MP4"). Antes não ia junto, e
    // editar o exercício apagava o vídeo ligado a ele.
    videoId: form.elements.videoId ? value(form, 'videoId') : undefined,
  }
  updateData((d) => {
    const old = d.exercises.find((e) => e.id === editing.exercise)
    if (old) Object.assign(old, record)
    else d.exercises.unshift({ id: createId('e'), ...record })
  })
  showToast(
    editing.exercise ? 'Exercício atualizado com sucesso.' : 'Exercício adicionado com sucesso.',
  )
  saveAndRefresh('exercises', record, editing.exercise)
  editing.exercise = null
}
function handleAssessment(form) {
  const r = {
    student: value(form, 'student'),
    protocol: value(form, 'protocol'),
    weight: value(form, 'weight'),
    height: value(form, 'height'),
    fat: value(form, 'fat'),
    waist: value(form, 'waist'),
    hip: value(form, 'hip'),
    chest: value(form, 'chest'),
    arm: value(form, 'arm'),
    thigh: value(form, 'thigh'),
    calf: value(form, 'calf'),
    bloodPressure: value(form, 'bloodPressure'),
    restingHR: value(form, 'restingHR'),
    restriction: value(form, 'restriction'),
    parq: value(form, 'parq'),
    pushUps: value(form, 'pushUps'),
    plank: value(form, 'plank'),
    sitAndReach: value(form, 'sitAndReach'),
    notes: value(form, 'notes'),
    published: checked(form, 'published'),
  }
  const h = Number(r.height) / 100,
    hip = Number(r.hip),
    waist = Number(r.waist)
  updateData((d) =>
    d.assessments.unshift({
      id: createId('a'),
      student: r.student,
      date: new Intl.DateTimeFormat('pt-BR').format(new Date()),
      protocol: r.protocol,
      weight: `${r.weight} kg`,
      height: `${r.height} cm`,
      bmi: h ? (Number(r.weight) / h ** 2).toFixed(1) : '',
      fat: `${r.fat}%`,
      waist: `${r.waist} cm`,
      hip: r.hip ? `${r.hip} cm` : '',
      whr: hip ? (waist / hip).toFixed(2) : '',
      restingHR: r.restingHR ? `${r.restingHR} bpm` : '',
      ...r,
      publishedAt: r.published ? new Date().toISOString() : null,
    }),
  )
  saveAndRefresh('assessments', r)
  showToast(r.published ? 'Avaliação salva e publicada.' : 'Avaliação salva como rascunho.')
}
function handleAppointment(form) {
  const start = new Date(`${value(form, 'date')}T${value(form, 'time')}:00`)
  const duration = Number(value(form, 'duration')) || 60
  const end = new Date(start.getTime() + duration * 60_000)
  const record = {
    student: value(form, 'student'),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    service: value(form, 'service'),
    location: value(form, 'location'),
    notes: value(form, 'notes'),
    status: value(form, 'status'),
  }
  updateData((d) => {
    d.appointments ||= []
    const old = d.appointments.find((item) => item.id === editing.appointment)
    if (old) Object.assign(old, record)
    else d.appointments.push({ id: createId('ap'), ...record })
  })
  showToast(editing.appointment ? 'Atendimento atualizado.' : 'Atendimento agendado.')
  saveAndRefresh('appointments', record, editing.appointment)
  editing.appointment = null
}
function fillForm(type, id) {
  const collection =
    type === 'student'
      ? 'students'
      : type === 'workout'
        ? 'workouts'
        : type === 'appointment'
          ? 'appointments'
          : 'exercises'
  const record = getData()[collection].find((item) => item.id === id)
  if (!record) return
  editing[type] = id
  const form = document.querySelector(`[data-form="${type}"]`)
  Object.entries(record).forEach(([key, val]) => {
    const field = form.elements[key]
    if (!field) return
    if (field instanceof RadioNodeList) {
      // Campo de várias caixas com o mesmo name (ex.: grupo muscular): o
      // valor salvo pode ser uma lista de verdade ou um texto "A, B" — os
      // dois casos viram a mesma lista de valores marcados.
      const isCheckboxGroup = [...field].every((entry) => entry.type === 'checkbox')
      const selected = Array.isArray(val)
        ? val
        : isCheckboxGroup && typeof val === 'string'
          ? val.split(',').map((entry) => entry.trim())
          : [val]
      ;[...field].forEach((entry) => {
        entry.checked = selected.includes(entry.value)
      })
    } else if (field.type === 'checkbox') field.checked = Boolean(val)
    else if (field.multiple) {
      ;[...field.options].forEach((o) => {
        o.selected = (record.exerciseIds || []).includes(o.value)
      })
    } else field.value = val ?? ''
  })
  if (type === 'appointment') {
    const start = new Date(record.startsAt)
    const end = new Date(record.endsAt)
    form.elements.date.value = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    form.elements.time.value = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
    form.elements.duration.value = String(Math.max(30, Math.round((end - start) / 60_000)))
  }
  if (form.elements.published) form.elements.published.checked = Boolean(record.publishedAt)
  if (type === 'exercise') setExerciseGifField(form, record.gifId)
  if (type === 'student') {
    form.querySelector('header .eyebrow').textContent = 'Editar cadastro'
    form.querySelector('header h2').textContent = 'Editar aluno'
    form.querySelector('[type="submit"]').textContent = 'Salvar alterações'
    toggleStudentPassword(form, false)
  }
  openModal(type)
}
export function initForms() {
  document.querySelectorAll('[data-open-modal]').forEach((b) =>
    b.addEventListener('click', () => {
      editing[b.dataset.openModal] = null
      if (b.dataset.openModal === 'exercise') {
        const form = document.querySelector('[data-form="exercise"]')
        if (form) setExerciseGifField(form, '')
      }
      if (b.dataset.openModal === 'student') {
        const form = document.querySelector('[data-form="student"]')
        form.querySelector('header .eyebrow').textContent = 'Cadastro manual'
        form.querySelector('header h2').textContent = 'Adicionar aluno presencial'
        form.querySelector('[type="submit"]').textContent = 'Adicionar aluno presencial'
        toggleStudentPassword(form, true)
      }
      openModal(b.dataset.openModal)
    }),
  )
  document.querySelectorAll('[data-generate-password]').forEach((button) =>
    button.addEventListener('click', () => {
      const field = button.closest('form').elements.password
      field.value = generatePassword()
      field.focus()
      field.select()
    }),
  )
  const handlers = {
    student: handleStudent,
    workout: handleWorkout,
    exercise: handleExercise,
    assessment: handleAssessment,
    appointment: handleAppointment,
  }
  document
    .querySelectorAll('[data-close-modal]')
    .forEach((b) => b.addEventListener('click', () => closeModal(b.closest('form'))))
  document.querySelectorAll('dialog[data-modal]').forEach((m) =>
    m.addEventListener('cancel', (e) => {
      e.preventDefault()
      closeModal(m.querySelector('form'))
    }),
  )
  document.querySelectorAll('[data-form]').forEach((form) =>
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!form.reportValidity()) return
      const submit = form.querySelector('[type="submit"]')
      const label = submit.textContent
      submit.disabled = true
      try {
        await handlers[form.dataset.form](form)
        closeModal(form)
      } catch (error) {
        showToast(error.message)
      } finally {
        submit.disabled = false
        submit.textContent = label
      }
    }),
  )
  // "+ Novo exercício" das pastas: abre o cadastro já no grupo da pasta.
  window.addEventListener('farisa:new-exercise', (event) => {
    const form = document.querySelector('[data-form="exercise"]')
    if (!form) return
    editing.exercise = null
    form.reset()
    setExerciseGifField(form, '')
    const group = event.detail
    if (group) {
      // form.reset() já desmarcou tudo; só marca a caixinha desta pasta.
      form
        .querySelectorAll('input[name="group"]')
        .forEach((input) => (input.checked = input.value === group))
    }
    openModal('exercise')
  })
  window.addEventListener('farisa:edit-student', (e) => fillForm('student', e.detail))
  window.addEventListener('farisa:edit-workout', (e) => fillForm('workout', e.detail))
  window.addEventListener('farisa:edit-exercise', (e) => fillForm('exercise', e.detail))
  window.addEventListener('farisa:edit-appointment', (e) => fillForm('appointment', e.detail))
}
