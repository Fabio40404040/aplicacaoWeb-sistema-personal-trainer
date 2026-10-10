// Fotos de evolução no painel do personal: as poses de cada avaliação (6
// padrão + as criadas pelo personal), com o modelo desenhado de cada pose.
// A foto é reduzida no navegador antes de subir.
import '../styles/assessment-photos.css'
import {
  accountRequest,
  deleteAssessmentPhoto,
  loadAssessmentPhoto,
  saveAssessmentPhoto,
  syncRemoteData,
} from './api-client.js'
import { getData, replaceData } from './state.js'
import { PHOTO_TIPS, framePhoto, poseModel, posesFor } from './photo-poses.js'
import { showToast } from './utils.js'

export const POSES = posesFor().map((item) => [item.pose, item.label])
const currentPoses = () => posesFor(getData().photoPoses)

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// Foto enquadrada em 3:4 (ver framePhoto em photo-poses.js).
export const shrinkPhoto = framePhoto

let dialog = null

export function openAssessmentPhotos(assessment) {
  if (!dialog) {
    dialog = el('dialog', 'modal assessment-photos-modal')
    document.body.append(dialog)
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close()
    })
  }
  const photos = new Map((assessment.photos || []).map((item) => [item.pose, item.v]))
  let changed = false
  const head = el('header')
  const title = el('div')
  title.append(el('span', 'eyebrow eyebrow--blue', 'Fotos de evolução'), el('h2', '', `${assessment.student} · ${assessment.date}`))
  const close = el('button', 'icon-button', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Fechar')
  close.addEventListener('click', () => dialog.close())
  head.append(title, close)
  const body = el('div', 'modal-body')
  const grid = el('div', 'assessment-photos-grid')
  const status = el('p', 'assessment-photos-status')
  status.setAttribute('role', 'status')

  const paintSlots = () => {
  grid.replaceChildren()
  currentPoses().forEach(({ pose, label, model, tip }) => {
    const slot = el('div', 'assessment-photo-slot')
    const frame = el('div', 'assessment-photo-frame')
    const input = el('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'
    input.hidden = true
    const pick = el('button', 'button button--secondary')
    pick.type = 'button'
    const remove = el('button', 'assessment-photo-remove', 'Remover')
    remove.type = 'button'
    const paint = async () => {
      frame.replaceChildren()
      const has = photos.has(pose)
      pick.textContent = has ? 'Trocar foto' : 'Enviar foto'
      remove.hidden = !has
      if (!has) {
        frame.append(poseModel(model, label), el('small', '', 'Sem foto'))
        return
      }
      frame.append(el('small', '', 'Carregando…'))
      const url = await loadAssessmentPhoto(assessment.id, pose, photos.get(pose)).catch(() => null)
      frame.replaceChildren()
      if (!url) {
        frame.append(el('small', '', 'Não foi possível carregar.'))
        return
      }
      const image = el('img')
      image.src = url
      image.alt = `Foto de ${label.toLowerCase()} de ${assessment.student}`
      frame.append(image)
    }
    pick.addEventListener('click', () => input.click())
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      input.value = ''
      if (!file) return
      pick.disabled = true
      status.textContent = `Enviando a foto de ${label.toLowerCase()}…`
      try {
        const saved = await saveAssessmentPhoto(assessment.id, pose, await shrinkPhoto(file))
        photos.set(pose, saved.v)
        changed = true
        status.textContent = 'Foto salva.'
        await paint()
      } catch (error) {
        status.textContent = error.message
      } finally {
        pick.disabled = false
      }
    })
    remove.addEventListener('click', async () => {
      remove.disabled = true
      try {
        await deleteAssessmentPhoto(assessment.id, pose)
        photos.delete(pose)
        changed = true
        status.textContent = 'Foto removida.'
        await paint()
      } catch (error) {
        status.textContent = error.message
      } finally {
        remove.disabled = false
      }
    })
    const actions = el('div', 'assessment-photo-actions')
    actions.append(pick, remove)
    const title = el('div', 'assessment-photo-title')
    title.append(poseModel(model, label), el('strong', '', label))
    title.title = tip
    slot.append(title, frame, el('small', 'assessment-photo-tip', tip), actions, input)
    grid.append(slot)
    void paint()
  })
  }
  paintSlots()

  // Editar os nomes, criar e tirar poses (vale para todas as avaliações).
  const editBox = el('div', 'assessment-poses-edit')
  editBox.hidden = true
  const editToggle = el('button', 'button button--secondary assessment-poses-toggle', '✏️ Editar nomes / adicionar pose')
  editToggle.type = 'button'
  const paintEditor = () => {
    const list = currentPoses().map((item) => ({ ...item }))
    editBox.replaceChildren()
    const rows = el('div', 'assessment-poses-rows')
    const addRow = (item) => {
      const row = el('div', 'assessment-poses-row')
      row.append(poseModel(item.model, item.label))
      const input = el('input')
      input.value = item.label
      input.maxLength = 40
      input.dataset.pose = item.pose
      input.setAttribute('aria-label', `Nome da pose ${item.label}`)
      row.append(input)
      if (item.custom) {
        const remove = el('button', 'assessment-photo-remove', 'Tirar')
        remove.type = 'button'
        remove.title = 'As fotos desta pose deixam de aparecer.'
        remove.addEventListener('click', () => row.remove())
        row.append(remove)
      } else row.append(el('small', 'support-muted', 'padrão'))
      rows.append(row)
    }
    list.forEach(addRow)
    const add = el('button', 'button button--secondary', '+ Adicionar pose')
    add.type = 'button'
    add.addEventListener('click', () => {
      const pose = `c_${Math.random().toString(36).slice(2, 10)}`
      addRow({ pose, label: 'Nova pose', model: 'free', custom: true })
      rows.lastElementChild.querySelector('input').select()
    })
    const save = el('button', 'button button--primary', 'Salvar poses')
    save.type = 'button'
    save.addEventListener('click', async () => {
      const poses = [...rows.querySelectorAll('input')].map((input) => ({ pose: input.dataset.pose, label: input.value.trim() }))
      if (poses.some((item) => !item.label)) {
        status.textContent = 'Toda pose precisa de um nome.'
        return
      }
      save.disabled = true
      try {
        const result = await accountRequest('/photo-poses', { method: 'PUT', body: JSON.stringify({ poses }) })
        replaceData({ ...getData(), photoPoses: result.poses })
        status.textContent = 'Poses salvas. Valem para todas as avaliações.'
        editBox.hidden = true
        paintSlots()
      } catch (error) {
        status.textContent = error.message
      } finally {
        save.disabled = false
      }
    })
    const actions = el('div', 'assessment-poses-actions')
    actions.append(add, save)
    editBox.append(rows, actions)
  }
  editToggle.addEventListener('click', () => {
    editBox.hidden = !editBox.hidden
    if (!editBox.hidden) paintEditor()
  })
  const tips = el('details', 'assessment-photo-tips')
  const tipsTitle = el('summary', '', '📸 Dicas para fotos comparáveis')
  const tipsList = el('ul')
  PHOTO_TIPS.forEach((tip) => tipsList.append(el('li', '', tip)))
  tips.append(tipsTitle, tipsList)
  body.append(
    el(
      'p',
      'support-muted',
      assessment.publishedAt
        ? 'O aluno vê estas fotos na área dele, comparadas com as da primeira avaliação.'
        : 'Esta avaliação é um rascunho: o aluno só vê as fotos depois que ela for publicada.',
    ),
    tips,
    editToggle,
    editBox,
    grid,
    status,
    el(
      'small',
      'support-muted',
      '🔒 Envie somente com a autorização do aluno. As fotos são vistas apenas por você e por ele, e são apagadas junto com a avaliação ou com a conta.',
    ),
  )
  const footer = el('footer')
  const done = el('button', 'button button--primary', 'Concluir')
  done.type = 'button'
  done.addEventListener('click', () => dialog.close())
  footer.append(done)
  // <form> para herdar o visual padrão das janelas do painel.
  const shell = el('form', 'assessment-photos-shell')
  shell.method = 'dialog'
  shell.addEventListener('submit', (event) => event.preventDefault())
  shell.append(head, body, footer)
  dialog.replaceChildren(shell)
  dialog.onclose = () => {
    if (!changed) return
    showToast('Fotos de evolução atualizadas.')
    void syncRemoteData()
  }
  dialog.showModal()
}
