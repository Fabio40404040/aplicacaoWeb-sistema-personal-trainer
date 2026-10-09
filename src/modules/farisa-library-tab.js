// Aba "📚 Biblioteca FARISA" na Biblioteca de exercícios do personal:
// exercícios, GIFs e vídeos que a FARISA disponibiliza para todos. Só para
// consultar e usar nas fichas; "Copiar para minha biblioteca" cria uma cópia
// editável (mesmo GIF e vídeo, sem gastar espaço).
import { getData } from './state.js'
import { exerciseGroups, showToast } from './utils.js'
import { copyFromLibrary, syncRemoteData } from './api-client.js'
import { findGif, findVideo, gifImage, openGifLightbox, openVideoLightbox } from './exercise-gifs.js'
import { folderSorter } from './folder-order.js'
import { legGroupNames } from '../data/library.js'

const folderOf = (group) => (legGroupNames.includes(group) ? 'Pernas' : group || 'Sem grupo')
const plain = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()

const el = (tag, className = '', text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// Exercícios da FARISA que você já copiou (id da FARISA → id da sua cópia).
export function copiedMap() {
  const map = new Map()
  ;(getData().exercises || []).forEach((item) => {
    if (!item.library && item.sourceId) map.set(String(item.sourceId), item.id)
  })
  return map
}

// Para montar fichas: os seus exercícios + os da FARISA que você ainda não
// copiou (o copiado aparece uma vez só, como a sua cópia).
export function exercisesForWorkouts() {
  const copied = copiedMap()
  return (getData().exercises || []).filter((item) => !item.library || !copied.has(String(item.id)))
}

let view = 'exercicios'
let query = ''
const openFolders = new Set()

export function libraryData() {
  const data = getData()
  return {
    exercises: (data.exercises || []).filter((item) => item.library),
    gifs: data.libraryGifs || [],
    videos: data.libraryVideos || [],
    order: data.libraryFolderOrder || [],
  }
}

function sorter(lib) {
  return folderSorter({ exercises: lib.exercises, gifs: lib.gifs, videos: lib.videos, custom: [], explicit: lib.order })
}

// Agrupa por pasta (Glúteos, Quadríceps… ficam em "Pernas").
function groupBy(items, groupsOf) {
  const folders = new Map()
  items.forEach((item) =>
    [...new Set(groupsOf(item).map(folderOf))].forEach((name) => {
      if (!folders.has(name)) folders.set(name, [])
      folders.get(name).push(item)
    }),
  )
  return folders
}

async function copyExercises(items, button, label) {
  const ids = items.map((item) => item.id)
  if (!ids.length) return
  button.disabled = true
  button.textContent = ids.length > 1 ? `Copiando ${ids.length}…` : 'Copiando…'
  try {
    const result = await copyFromLibrary(ids)
    await syncRemoteData()
    if (ids.length === 1) {
      showToast(`“${items[0].name}” está em Meus exercícios. Agora você pode editar a sua cópia.`)
      const mine = copiedMap().get(String(ids[0]))
      if (mine) window.dispatchEvent(new CustomEvent('farisa:edit-exercise', { detail: mine }))
    } else {
      showToast(
        `${result.created} exercício(s) copiado(s) para Meus exercícios${result.skipped ? ` (${result.skipped} já estavam lá)` : ''}.`,
      )
    }
    renderFarisaLibrary()
  } catch (error) {
    showToast(error.message)
    button.disabled = false
    button.textContent = label
  }
}

function exerciseRow(exercise) {
  const row = el('article', 'farisa-row')
  const thumb = el('span', 'farisa-thumb')
  const video = exercise.videoId ? findVideo(exercise.videoId) : null
  if (exercise.gifId && findGif(exercise.gifId)) {
    thumb.append(gifImage(exercise.gifId, 'farisa-thumb-image'))
    thumb.title = 'Ampliar o GIF'
    thumb.addEventListener('click', () => openGifLightbox(exercise.gifId, exercise.name))
  } else if (video) {
    thumb.textContent = '▶'
    thumb.title = 'Assistir o vídeo'
    thumb.addEventListener('click', () => void openVideoLightbox(video.id, exercise.name))
  } else thumb.textContent = '•'
  const info = el('div', 'farisa-row-info')
  const media = []
  if (exercise.gifId && findGif(exercise.gifId)) media.push('GIF')
  if (video) media.push('vídeo')
  info.append(
    el('strong', '', exercise.name),
    el('small', '', [exercise.equipment, exercise.difficulty, media.length ? `com ${media.join(' e ')}` : ''].filter(Boolean).join(' · ')),
  )
  const actions = el('div', 'farisa-row-actions')
  if (video) {
    const play = el('button', 'button button--secondary farisa-play', '▶ Vídeo')
    play.type = 'button'
    play.addEventListener('click', () => void openVideoLightbox(video.id, exercise.name))
    actions.append(play)
  }
  const mine = copiedMap().get(String(exercise.id))
  if (mine) {
    // Já está em "Meus exercícios": nada de cópia repetida.
    row.classList.add('is-copied')
    const done = el('span', 'farisa-copied', '✓ Em Meus exercícios')
    const edit = el('button', 'button button--secondary', 'Editar minha cópia')
    edit.type = 'button'
    edit.addEventListener('click', () => window.dispatchEvent(new CustomEvent('farisa:edit-exercise', { detail: mine })))
    actions.append(done, edit)
  } else {
    const label = 'Copiar para minha biblioteca'
    const copy = el('button', 'button button--secondary', label)
    copy.type = 'button'
    copy.title = 'Cria uma cópia sua deste exercício (mesmo GIF e vídeo) para você editar'
    copy.addEventListener('click', () => void copyExercises([exercise], copy, label))
    actions.append(copy)
  }
  row.append(thumb, info, actions)
  return row
}

// "Copiar pasta inteira": só os que ainda não estão em Meus exercícios.
function folderCopyButton(name, items) {
  const copied = copiedMap()
  const pending = items.filter((item) => !copied.has(String(item.id)))
  if (!pending.length) return el('span', 'farisa-copied', '✓ Pasta em Meus exercícios')
  const label = pending.length === items.length ? `Copiar pasta inteira (${pending.length})` : `Copiar os ${pending.length} que faltam`
  const button = el('button', 'button button--secondary farisa-folder-copy', label)
  button.type = 'button'
  button.title = `Copia os exercícios de ${name} para Meus exercícios (os que já estão lá não repetem)`
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void copyExercises(pending, button, label)
  })
  return button
}

function gifCard(gif) {
  const card = el('button', 'gif-card farisa-gif-card')
  card.type = 'button'
  card.title = 'Clique para ampliar o GIF'
  card.append(gifImage(gif.id, 'gif-card-image'), el('span', 'gif-card-name', gif.name))
  card.addEventListener('click', () => openGifLightbox(gif.id, gif.name))
  return card
}

function videoRow(video) {
  const row = el('button', 'farisa-video-row')
  row.type = 'button'
  row.append(el('span', 'farisa-video-play', '▶'), el('span', '', video.name))
  row.addEventListener('click', () => void openVideoLightbox(video.id, video.name))
  return row
}

function folder(key, name, items, renderBody, total, extra = null) {
  const details = el('details', 'exercise-folder farisa-folder')
  details.dataset.group = key
  details.open = Boolean(query) || openFolders.has(key)
  const summary = el('summary')
  summary.append(el('span', 'exercise-folder-name', name), el('span', 'exercise-folder-count', total))
  if (extra) summary.append(extra)
  const body = el('div', 'farisa-folder-body')
  // Só monta o conteúdo ao abrir (a biblioteca tem centenas de GIFs).
  const fill = () => {
    if (body.dataset.filled) return
    body.dataset.filled = '1'
    body.append(...items.map(renderBody))
  }
  details.addEventListener('toggle', () => {
    if (details.open) {
      openFolders.add(key)
      fill()
    } else openFolders.delete(key)
  })
  if (details.open) fill()
  details.append(summary, body)
  return details
}

export function renderFarisaLibrary() {
  const root = document.querySelector('[data-farisa-library]')
  if (!root) return
  const lib = libraryData()
  const match = (name) => !query || plain(name).includes(plain(query))
  const counts = { exercicios: lib.exercises.length, gifs: lib.gifs.length, videos: lib.videos.length }

  const intro = el('div', 'farisa-intro')
  intro.append(
    el('strong', '', '📚 Biblioteca FARISA'),
    el('p', '', 'Exercícios prontos, com GIF e vídeo, para usar nas fichas dos seus alunos — já aparecem na montagem da ficha (marcados com 📚). Só copie para Meus exercícios se quiser mudar algo: a cópia substitui o original na ficha, sem repetir.'),
  )
  const switcher = el('div', 'farisa-switch')
  switcher.setAttribute('role', 'tablist')
  ;[
    ['exercicios', 'Exercícios'],
    ['gifs', 'GIFs'],
    ['videos', 'Vídeos'],
  ].forEach(([key, label]) => {
    const button = el('button', key === view ? 'is-active' : '')
    button.type = 'button'
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-selected', String(key === view))
    button.append(document.createTextNode(`${label} `), el('small', '', String(counts[key])))
    button.addEventListener('click', () => {
      view = key
      renderFarisaLibrary()
    })
    switcher.append(button)
  })
  const search = el('label', 'search-box farisa-search')
  const input = el('input')
  input.type = 'search'
  input.placeholder = 'Buscar na Biblioteca FARISA'
  input.value = query
  input.addEventListener('input', () => {
    query = input.value.trim()
    renderList()
    input.focus()
  })
  search.append(input)
  const list = el('div', 'farisa-list')
  const sort = sorter(lib)

  function renderList() {
    let folders
    let renderBody
    let unit
    if (view === 'gifs') {
      folders = groupBy(lib.gifs.filter((gif) => match(gif.name)), (gif) => [gif.group])
      renderBody = gifCard
      unit = ['GIF', 'GIFs']
    } else if (view === 'videos') {
      folders = groupBy(lib.videos.filter((video) => match(video.name)), (video) => [video.group])
      renderBody = videoRow
      unit = ['vídeo', 'vídeos']
    } else {
      folders = groupBy(lib.exercises.filter((item) => match(item.name)), (item) => exerciseGroups(item))
      renderBody = exerciseRow
      unit = ['exercício', 'exercícios']
    }
    const entries = [...folders.entries()].sort(([a], [b]) => sort(a, b))
    if (!entries.length) {
      list.replaceChildren(el('p', 'farisa-empty', query ? 'Nada encontrado com essa busca.' : 'Ainda não há itens aqui.'))
      return
    }
    list.replaceChildren(
      ...entries.map(([name, items]) => {
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        const details = folder(
          `${view}:${name}`,
          name,
          sorted,
          renderBody,
          `${items.length} ${items.length === 1 ? unit[0] : unit[1]}`,
          view === 'exercicios' ? folderCopyButton(name, sorted) : null,
        )
        // GIFs em grade, como na aba GIFs.
        if (view === 'gifs') details.querySelector('.farisa-folder-body').classList.add('gif-grid', 'gif-grid--library')
        return details
      }),
    )
  }
  renderList()
  root.replaceChildren(intro, switcher, search, list)
}

export function initFarisaLibraryTab(page) {
  if (!page || page.querySelector('[data-farisa-library]')) return
  const section = el('section', 'panel farisa-library')
  section.dataset.farisaLibrary = ''
  const anchor = page.querySelector('[data-exercise-video-library]') || page.querySelector('[data-gif-library]') || page.querySelector('.content-panel')
  if (anchor) anchor.after(section)
  else page.append(section)
  renderFarisaLibrary()
  window.addEventListener('farisa:data-changed', () => {
    if (page.dataset.libraryView === 'farisa') renderFarisaLibrary()
  })
}
