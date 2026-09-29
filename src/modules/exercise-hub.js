// Biblioteca de exercícios organizada em volta do EXERCÍCIO.
//
// O que chega ao aluno é sempre o exercício da ficha; o GIF e o MP4 são
// anexos dele. Por isso a página tem duas abas:
//   • Exercícios — a lista por grupo muscular (com selos de GIF/vídeo e
//     filtros "Sem GIF", "Sem vídeo", "Fora das fichas") e o envio único,
//     que junta GIF e MP4 de mesmo nome num exercício só;
//   • Arquivos — as bibliotecas de GIFs e de MP4, para enviar em lote e
//     fazer faxina.
import { getData } from './state.js'
import {
  persistRecord,
  syncRemoteData,
  uploadExerciseGif,
  uploadExerciseVideo,
} from './api-client.js'
import {
  allGroupNames,
  filesFromDrop,
  firstFrameBlob,
  groupFromFolder,
} from './exercise-gifs.js'
import { showToast } from './utils.js'

const VIEW_KEY = 'farisa-library-view'

const plain = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()

function prettyName(filename) {
  const base = String(filename || '')
    .replace(/\.(gif|mp4)$/iu, '')
    .replace(/[-_+]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!base) return 'Exercício'
  return base.charAt(0).toLocaleUpperCase('pt-BR') + base.slice(1)
}

const isGif = (file) => file.type === 'image/gif' || /\.gif$/iu.test(file.name)
const isMp4 = (file) => file.type === 'video/mp4' || /\.mp4$/iu.test(file.name)

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'arquivos' ? 'arquivos' : 'exercicios'
  } catch {
    return 'exercicios'
  }
}
function saveView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    /* navegador sem armazenamento: só não lembra a aba */
  }
}

/* ------------------------------------------------------------------ */
/* Abas                                                                */
/* ------------------------------------------------------------------ */
function setView(page, view) {
  page.dataset.libraryView = view
  page.querySelectorAll('[data-library-tab]').forEach((tab) => {
    const active = tab.dataset.libraryTab === view
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-selected', String(active))
  })
  saveView(view)
}

function createTabs(page) {
  if (page.querySelector('.library-tabs')) return
  const heading = page.querySelector('.page-heading')
  const intro = heading?.querySelector('p')
  if (intro)
    intro.textContent =
      'Cada exercício reúne o GIF e o vídeo MP4. É ele que entra nas fichas e aparece para o aluno.'
  const tabs = document.createElement('div')
  tabs.className = 'library-tabs'
  tabs.setAttribute('role', 'tablist')
  tabs.innerHTML = `
    <button type="button" role="tab" data-library-tab="exercicios">Exercícios</button>
    <button type="button" role="tab" data-library-tab="arquivos">Arquivos (GIFs e MP4)</button>`
  tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-library-tab]')
    if (tab) setView(page, tab.dataset.libraryTab)
  })
  heading?.after(tabs)
  setView(page, readView())
}

/* ------------------------------------------------------------------ */
/* Filtro de mídia e resumo na lista de exercícios                     */
/* ------------------------------------------------------------------ */
function createMediaFilter(page) {
  const toolbar = page.querySelector('.content-panel .toolbar')
  if (!toolbar || toolbar.querySelector('[data-exercise-media-filter]')) return
  const select = document.createElement('select')
  select.dataset.exerciseMediaFilter = ''
  select.setAttribute('aria-label', 'Filtrar por mídia')
  select.innerHTML = `
    <option value="all">Todos os exercícios</option>
    <option value="no-gif">Sem GIF</option>
    <option value="no-video">Sem vídeo</option>
    <option value="unused">Fora das fichas</option>`
  toolbar.append(select)
  const summary = document.createElement('p')
  summary.className = 'exercise-summary'
  summary.dataset.exerciseSummary = ''
  toolbar.after(summary)
  window.dispatchEvent(new Event('farisa:render-exercises'))
}

/* ------------------------------------------------------------------ */
/* Envio único: GIF + MP4 de mesmo nome = um exercício                 */
/* ------------------------------------------------------------------ */
function groupOptions(selected) {
  return allGroupNames()
    .map(
      (name) =>
        `<option value="${name.replace(/"/gu, '&quot;')}"${name === selected ? ' selected' : ''}>${name}</option>`,
    )
    .join('')
}

// Junta os arquivos pelo nome: supino-reto.gif + supino-reto.mp4 → 1 item.
function buildItems(files, fallbackGroup) {
  const exercises = getData().exercises || []
  const byKey = new Map()
  files
    .filter((file) => isGif(file) || isMp4(file))
    .forEach((file) => {
      const key = plain(file.name.replace(/\.(gif|mp4)$/iu, ''))
      if (!key) return
      if (!byKey.has(key)) {
        const folder = (file.webkitRelativePath || '').split('/').slice(-2, -1)[0] || ''
        byKey.set(key, {
          key,
          name: prettyName(file.name),
          group: groupFromFolder(folder) || groupFromFolder(file.name, { custom: false }) || fallbackGroup,
          gif: null,
          video: null,
        })
      }
      const item = byKey.get(key)
      if (isGif(file)) item.gif = file
      else item.video = file
    })
  return [...byKey.values()].map((item) => ({
    ...item,
    existing: exercises.find((exercise) => plain(exercise.name) === item.key) || null,
  }))
}

let reviewDialog = null
function buildReviewDialog() {
  if (reviewDialog) return reviewDialog
  const dialog = document.createElement('dialog')
  dialog.className = 'modal exercise-hub-dialog'
  dialog.innerHTML = `<form method="dialog">
      <header><div><span class="eyebrow eyebrow--blue">Envio único</span><h2>Confira antes de salvar</h2></div>
        <button class="icon-button" type="button" data-hub-close aria-label="Fechar">×</button></header>
      <div class="modal-body">
        <p class="password-requirements">GIF e MP4 com o mesmo nome viram um exercício só. Ajuste o nome e o grupo se precisar. Quando já existe um exercício com esse nome, a mídia é adicionada a ele.</p>
        <div class="exercise-hub-rows" data-hub-rows></div>
        <progress data-hub-progress hidden value="0" max="1"></progress>
        <p role="status" aria-live="polite" data-hub-status></p>
      </div>
      <footer>
        <button class="button button--secondary" type="button" data-hub-close>Cancelar</button>
        <button class="button button--primary" type="submit" data-hub-save>Salvar exercícios</button>
      </footer>
    </form>`
  document.body.append(dialog)
  dialog.querySelectorAll('[data-hub-close]').forEach((button) =>
    button.addEventListener('click', () => {
      if (!dialog.dataset.busy) dialog.close()
    }),
  )
  dialog.addEventListener('cancel', (event) => {
    if (dialog.dataset.busy) event.preventDefault()
  })
  reviewDialog = dialog
  return dialog
}

function paintRows(dialog, items) {
  const rows = dialog.querySelector('[data-hub-rows]')
  rows.replaceChildren(
    ...items.map((item, index) => {
      const row = document.createElement('div')
      row.className = 'exercise-hub-row'
      row.dataset.index = String(index)
      const chips = [
        `<span class="gif-status ${item.gif ? 'gif-status--on' : 'gif-status--off'}">${item.gif ? 'GIF' : 'sem GIF'}</span>`,
        `<span class="gif-status ${item.video ? 'gif-status--on' : 'gif-status--off'}">${item.video ? '▶ MP4' : 'sem MP4'}</span>`,
      ].join(' ')
      row.innerHTML = `
        <label class="check-field exercise-hub-include"><input type="checkbox" checked data-hub-include><span class="sr-only">Incluir</span></label>
        <label class="field"><span>Exercício</span><input data-hub-name required maxlength="140"></label>
        <label class="field"><span>Grupo muscular</span><select data-hub-group>${groupOptions(item.group)}</select></label>
        <div class="exercise-hub-media">${chips}<small data-hub-target></small></div>`
      row.querySelector('[data-hub-name]').value = item.name
      const target = row.querySelector('[data-hub-target]')
      const paintTarget = () => {
        const name = plain(row.querySelector('[data-hub-name]').value)
        const existing = (getData().exercises || []).find((exercise) => plain(exercise.name) === name)
        item.existing = existing || null
        target.textContent = existing ? `Adiciona ao exercício existente` : 'Novo exercício'
        target.className = existing ? 'exercise-hub-target is-existing' : 'exercise-hub-target'
      }
      row.querySelector('[data-hub-name]').addEventListener('input', paintTarget)
      paintTarget()
      return row
    }),
  )
}

async function saveItem(item) {
  let gifId = ''
  let videoId = ''
  if (item.gif) {
    const payload = new FormData()
    payload.append('gif', item.gif)
    payload.append('name', item.name)
    payload.append('group', item.group)
    payload.append('move', '1')
    const frame = await firstFrameBlob(item.gif)
    if (frame) payload.append('frame', frame, 'frame.jpg')
    const saved = await uploadExerciseGif(payload)
    gifId = saved?.id || ''
  }
  if (item.video) {
    const payload = new FormData()
    payload.append('video', item.video)
    payload.append('name', item.name)
    payload.append('group', item.group)
    payload.append('difficulty', item.existing?.difficulty || 'Intermediário')
    payload.append('equipment', item.existing?.equipment || '')
    payload.append('published', '1')
    // O exercício é criado aqui mesmo, já com GIF e vídeo ligados.
    payload.append('catalog', '0')
    const saved = await uploadExerciseVideo(payload)
    videoId = saved?.id || ''
  }
  const existing = item.existing
  if (existing) {
    await persistRecord(
      'exercises',
      {
        ...existing,
        mediaType: existing.mediaType === '3d' && !gifId && !videoId ? '3d' : 'gif',
        gifId: gifId || existing.gifId || '',
        videoId: videoId || existing.videoId || '',
      },
      existing.id,
    )
    return 'updated'
  }
  await persistRecord('exercises', {
    name: item.name,
    group: item.group,
    equipment: 'A definir',
    instructions: '',
    difficulty: 'Intermediário',
    mediaType: 'gif',
    gifId,
    videoId,
  })
  return 'created'
}

async function reviewAndSave(files, fallbackGroup) {
  const items = buildItems(files, fallbackGroup)
  if (!items.length) {
    showToast('Nenhum arquivo .gif ou .mp4 encontrado.')
    return
  }
  const dialog = buildReviewDialog()
  paintRows(dialog, items)
  const status = dialog.querySelector('[data-hub-status]')
  const bar = dialog.querySelector('[data-hub-progress]')
  const save = dialog.querySelector('[data-hub-save]')
  status.textContent = `${items.length} exercício(s) encontrados em ${files.length} arquivo(s).`
  bar.hidden = true
  save.disabled = false
  const form = dialog.querySelector('form')
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    const chosen = [...dialog.querySelectorAll('.exercise-hub-row')]
      .filter((row) => row.querySelector('[data-hub-include]').checked)
      .map((row) => {
        const item = items[Number(row.dataset.index)]
        item.name = row.querySelector('[data-hub-name]').value.trim()
        item.group = row.querySelector('[data-hub-group]').value
        return item
      })
    if (!chosen.length) {
      status.textContent = 'Marque pelo menos um exercício.'
      return
    }
    dialog.dataset.busy = '1'
    save.disabled = true
    bar.hidden = false
    bar.max = chosen.length
    bar.value = 0
    let created = 0
    let updated = 0
    const failures = []
    for (const item of chosen) {
      status.textContent = `Salvando ${bar.value + 1} de ${chosen.length}: ${item.name}…`
      try {
        if ((await saveItem(item)) === 'created') created += 1
        else updated += 1
      } catch (error) {
        failures.push(`${item.name}: ${error.message}`)
      }
      bar.value += 1
    }
    await syncRemoteData().catch(() => {})
    delete dialog.dataset.busy
    save.disabled = false
    const parts = []
    if (created) parts.push(`${created} exercício(s) criado(s)`)
    if (updated) parts.push(`${updated} atualizado(s) com a nova mídia`)
    if (failures.length) parts.push(`${failures.length} com erro: ${failures.slice(0, 2).join(' | ')}`)
    status.textContent = `${parts.join('. ')}.`
    showToast(parts[0] ? `${parts.join('. ')}.` : 'Nada foi salvo.')
    if (!failures.length) dialog.close()
  }
  dialog.showModal()
}

function createUploadPanel(page) {
  if (page.querySelector('[data-exercise-hub-upload]')) return
  const listPanel = page.querySelector('.content-panel')
  if (!listPanel) return
  const panel = document.createElement('article')
  panel.className = 'panel exercise-hub-upload'
  panel.dataset.exerciseHubUpload = ''
  panel.innerHTML = `
    <div class="gif-dropzone exercise-hub-drop" data-hub-drop>
      <strong>Arraste GIFs e vídeos MP4 (ou a pasta inteira)</strong>
      <span>Arquivos com o mesmo nome viram um exercício só, já com GIF e vídeo. Você confere tudo antes de salvar.</span>
      <input type="file" accept=".gif,image/gif,.mp4,video/mp4" multiple hidden data-hub-files>
    </div>
    <div class="exercise-hub-options">
      <label class="field"><span>Grupo para arquivos soltos</span><select data-hub-fallback></select></label>
      <button class="button button--secondary" type="button" data-hub-pick>Escolher arquivos</button>
    </div>`
  listPanel.before(panel)
  const fallback = panel.querySelector('[data-hub-fallback]')
  const paintFallback = () => {
    const current = fallback.value
    fallback.innerHTML = groupOptions(current)
  }
  paintFallback()
  window.addEventListener('farisa:data-changed', paintFallback)
  const input = panel.querySelector('[data-hub-files]')
  const drop = panel.querySelector('[data-hub-drop]')
  panel.querySelector('[data-hub-pick]').addEventListener('click', () => input.click())
  drop.addEventListener('click', () => input.click())
  input.addEventListener('change', () => {
    const files = [...(input.files || [])]
    input.value = ''
    if (files.length) void reviewAndSave(files, fallback.value)
  })
  ;['dragenter', 'dragover'].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault()
      drop.classList.add('is-over')
    }),
  )
  ;['dragleave', 'dragend'].forEach((type) =>
    drop.addEventListener(type, () => drop.classList.remove('is-over')),
  )
  drop.addEventListener('drop', async (event) => {
    event.preventDefault()
    drop.classList.remove('is-over')
    try {
      const files = await filesFromDrop(event.dataTransfer)
      void reviewAndSave(files, fallback.value)
    } catch (error) {
      showToast(error.message)
    }
  })
}

export function initExerciseHub() {
  const page = document.querySelector('[data-route="exercicios"]')
  if (!page) return
  createTabs(page)
  createUploadPanel(page)
  createMediaFilter(page)
}
