// Aba "📚 Biblioteca FARISA" na Biblioteca de exercícios do personal:
// exercícios, GIFs e vídeos que a FARISA disponibiliza para todos. Só para
// consultar e usar nas fichas; "Copiar para minha biblioteca" cria uma cópia
// editável (mesmo GIF e vídeo, sem gastar espaço).
import { getData } from './state.js'
import { exerciseGroups, showToast } from './utils.js'
import { persistRecord, syncRemoteData } from './api-client.js'
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

async function copyToMine(source, button) {
  button.disabled = true
  button.textContent = 'Copiando…'
  try {
    const saved = await persistRecord('exercises', {
      name: source.name,
      group: source.group,
      equipment: source.equipment,
      instructions: source.instructions,
      difficulty: source.difficulty,
      mediaType: source.mediaType,
      mediaUrl: source.mediaUrl,
      thumbnailUrl: source.thumbnailUrl,
      animationClip: source.animationClip,
      gifId: source.gifId,
      videoId: source.videoId,
    })
    await syncRemoteData()
    showToast(`“${source.name}” foi copiado para Meus exercícios. Agora você pode editar a sua cópia.`)
    if (saved?.id) window.dispatchEvent(new CustomEvent('farisa:edit-exercise', { detail: saved.id }))
  } catch (error) {
    showToast(error.message)
  } finally {
    button.disabled = false
    button.textContent = 'Copiar para minha biblioteca'
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
  const copy = el('button', 'button button--secondary', 'Copiar para minha biblioteca')
  copy.type = 'button'
  copy.title = 'Cria uma cópia sua deste exercício (mesmo GIF e vídeo) para você editar'
  copy.addEventListener('click', () => void copyToMine(exercise, copy))
  actions.append(copy)
  row.append(thumb, info, actions)
  return row
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

function folder(key, name, items, renderBody, total) {
  const details = el('details', 'exercise-folder farisa-folder')
  details.dataset.group = key
  details.open = Boolean(query) || openFolders.has(key)
  const summary = el('summary')
  summary.append(el('span', 'exercise-folder-name', name), el('span', 'exercise-folder-count', total))
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
    el('p', '', 'Exercícios prontos, com GIF e vídeo, para usar nas fichas dos seus alunos. Atualizada pela FARISA — aparecem também na hora de montar a ficha (marcados com 📚).'),
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
        const details = folder(`${view}:${name}`, name, sorted, renderBody, `${items.length} ${items.length === 1 ? unit[0] : unit[1]}`)
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
