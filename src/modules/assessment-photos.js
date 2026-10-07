// Fotos de evolução no painel do personal: frente, lado e costas de cada
// avaliação. A foto é reduzida no navegador antes de subir.
import '../styles/assessment-photos.css'
import {
  deleteAssessmentPhoto,
  loadAssessmentPhoto,
  saveAssessmentPhoto,
  syncRemoteData,
} from './api-client.js'
import { showToast } from './utils.js'

export const POSES = [
  ['front', 'Frente'],
  ['side', 'Lado'],
  ['back', 'Costas'],
]

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// Reduz para caber em 1000 × 1400 px, sem cortar, em JPEG.
export async function shrinkPhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/u.test(file.type)) throw new Error('Escolha uma foto JPG, PNG ou WebP.')
  if (file.size > 25 * 1024 * 1024) throw new Error('Esta foto é muito pesada. Escolha uma de até 25 MB.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
  if (!bitmap) throw new Error('Não foi possível abrir esta foto. Tente outra.')
  const scale = Math.min(1, 1000 / bitmap.width, 1400 / bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  for (const quality of [0.8, 0.7, 0.6, 0.5]) {
    const data = canvas.toDataURL('image/jpeg', quality)
    if (data.length < 600_000) return data
  }
  throw new Error('Não foi possível reduzir esta foto. Tente outra imagem.')
}

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

  POSES.forEach(([pose, label]) => {
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
        frame.append(el('span', '', '📷'), el('small', '', 'Sem foto'))
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
    slot.append(el('strong', '', label), frame, actions, input)
    grid.append(slot)
    void paint()
  })
  body.append(
    el(
      'p',
      'support-muted',
      assessment.publishedAt
        ? 'O aluno vê estas fotos na área dele, comparadas com as da primeira avaliação.'
        : 'Esta avaliação é um rascunho: o aluno só vê as fotos depois que ela for publicada.',
    ),
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
