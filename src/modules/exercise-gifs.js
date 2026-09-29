import { getData } from './state.js'
import { legGroupNames } from '../data/library.js'
import { askConfirm, askText, exerciseGroups, showToast } from './utils.js'
import {
  createMuscleGroup,
  deleteExerciseGif,
  deleteMuscleGroup,
  forgetExerciseGif,
  loadExerciseGif,
  loadExerciseVideo,
  syncRemoteData,
  uploadExerciseGif,
} from './api-client.js'

// Grupos que a Biblioteca mostra dentro da pasta "Pernas".
const LEG_GROUPS = [...legGroupNames, 'Pernas']

// A pasta de origem do arquivo define o grupo muscular do GIF.
// Ex.: "1-Peitoral" -> Peitoral, "3-Menbros-inferiores-e-Gluteos" -> Pernas.
const FOLDER_GROUPS = [
  [/peitoral|chest|peito/i, 'Peitoral'],
  [/costas|trapezio|dorsal|back/i, 'Costas'],
  [/panturrilha|calf/i, 'Panturrilhas'],
  [/inferior|gluteo|perna|quadriceps|posterior|leg/i, 'Pernas'],
  [/ombro|deltoide|deltode|shoulder/i, 'Ombros'],
  [/triceps/i, 'Tríceps'],
  [/biceps/i, 'Bíceps'],
  [/antebra|forearm/i, 'Antebraços'],
  [/abdomen|abdomin|core|abs/i, 'Abdômen'],
  [/cardio|condicionamento/i, 'Cardio e condicionamento'],
  [/mobilidade|aquecimento|along|mobility/i, 'Mobilidade e aquecimento'],
]

const MAX_FRAME_SIDE = 360

function accentless(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
}

function normalized(value) {
  return accentless(value)
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\b(com|de|da|do|na|no|em|e|a|o|os|as|the|with)\b/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

const wordsOf = (value) =>
  accentless(value)
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()

// Pastas criadas por você (ex.: Trapézio) têm prioridade sobre a tabela
// acima — senão "Trapezio" cairia em Costas. Pastas suas que são só outro
// nome de um grupo do catálogo (ex.: "Panturrilha" x "Panturrilhas") ficam
// de fora, para não separar o que já estava junto.
function customGroupFor(text) {
  const words = ` ${wordsOf(text)} `
  if (!words.trim()) return ''
  const catalog = FOLDER_GROUPS.map(([, group]) => wordsOf(group))
  const found = (getData().customGroups || []).find((item) => {
    const key = wordsOf(item.name)
    if (!key || catalog.some((name) => name.startsWith(key) || key.startsWith(name)))
      return false
    return words.includes(` ${key} `)
  })
  return found ? found.name : ''
}

export function groupFromFolder(folderName, { custom = true } = {}) {
  const plain = accentless(folderName)
  if (custom) {
    const own = customGroupFor(folderName)
    if (own) return own
  }
  const match = FOLDER_GROUPS.find(([pattern]) => pattern.test(plain))
  return match ? match[1] : ''
}

// Grupos para escolher na mão: os do filtro da biblioteca + as suas pastas.
export function allGroupNames() {
  const names = [
    ...(document.querySelector('[data-exercise-filter]')?.options || []),
  ]
    .map((option) => option.value)
    .filter((value) => value && value !== 'all')
  if (!names.length) names.push(...FOLDER_GROUPS.map(([, group]) => group))
  ;(getData().customGroups || []).forEach((item) => {
    if (!names.includes(item.name)) names.push(item.name)
  })
  return names
}

function paintLooseGroups() {
  const select = document.querySelector('[data-gif-loose-group]')
  if (!select) return
  const selected = select.value
  const names = allGroupNames()
  select.replaceChildren(
    ...names.map((group) => {
      const option = document.createElement('option')
      option.value = group
      option.textContent = group
      return option
    }),
  )
  if (names.includes(selected)) select.value = selected
}

function nameFromFile(filename) {
  const base = String(filename || '')
    .replace(/\.gif$/iu, '')
    .replace(/[-_+]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!base) return 'Exercício'
  return base.charAt(0).toLocaleUpperCase('pt-BR') + base.slice(1)
}

// Quanto dois nomes se parecem, contando palavras em comum. Serve apenas para
// colocar o palpite na frente da lista — quem decide é o Fábio, olhando o GIF.
function similarity(a, b) {
  const first = new Set(normalized(a).split(' ').filter(Boolean))
  const second = normalized(b).split(' ').filter(Boolean)
  if (!first.size || !second.length) return 0
  const shared = second.filter((word) => first.has(word)).length
  return shared / Math.max(first.size, second.length)
}

function sameFamily(gifGroup, exerciseGroup) {
  if (!exerciseGroup || !gifGroup) return true
  if (gifGroup === exerciseGroup) return true
  return LEG_GROUPS.includes(gifGroup) && LEG_GROUPS.includes(exerciseGroup)
}

// Um exercício pode ter vários grupos ("Glúteos, Quadríceps"): o GIF entra
// na lista se for da família de qualquer um deles.
export function gifsForGroup(group) {
  const gifs = getData().exerciseGifs || []
  const groups = exerciseGroups({ group })
  if (!groups.length) return gifs
  const family = gifs.filter((gif) =>
    groups.some((name) => sameFamily(gif.group, name)),
  )
  return family.length ? family : gifs
}

export function findGif(id) {
  return (getData().exerciseGifs || []).find((gif) => gif.id === id) || null
}

// Primeiro quadro do GIF em JPEG pequeno: e o que entra no PDF, porque PDF
// nao aceita imagem animada.
export async function firstFrameBlob(file) {
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    const side = Math.max(image.naturalWidth, image.naturalHeight) || 1
    const scale = Math.min(1, MAX_FRAME_SIDE / side)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    )
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(source)
  }
}

function gifImage(id, className) {
  const image = document.createElement('img')
  image.className = className
  image.alt = ''
  image.loading = 'lazy'
  image.decoding = 'async'
  void loadExerciseGif(id)
    .then((url) => {
      image.src = url
    })
    .catch(() => {
      image.remove()
    })
  return image
}

/* ------------------------------------------------------------------ */
/* Ampliar o GIF                                                       */
/* ------------------------------------------------------------------ */
// Nas pastas por grupo muscular (biblioteca de exercícios e biblioteca de
// GIFs) o GIF já toca animado, mas espremido na miniatura pequena. Clicar
// nela abre numa janela maior, sem sair da página.

let lightboxDialog = null

function buildLightboxDialog() {
  if (lightboxDialog) return lightboxDialog
  const dialog = document.createElement('dialog')
  dialog.className = 'modal gif-lightbox'
  dialog.innerHTML = `<header>
      <span data-gif-lightbox-name></span>
      <button class="icon-button" type="button" data-gif-lightbox-close aria-label="Fechar">×</button>
    </header>
    <div class="gif-lightbox-body" data-gif-lightbox-body></div>`
  document.body.append(dialog)
  dialog
    .querySelector('[data-gif-lightbox-close]')
    .addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  // Fechou com vídeo tocando: para o vídeo e libera a memória.
  dialog.addEventListener('close', () => {
    const video = dialog.querySelector('video')
    if (!video) return
    video.pause()
    if (video.src.startsWith('blob:')) URL.revokeObjectURL(video.src)
    dialog.querySelector('[data-gif-lightbox-body]').replaceChildren()
  })
  lightboxDialog = dialog
  return dialog
}

export function openGifLightbox(id, name) {
  if (!id) return
  const dialog = buildLightboxDialog()
  dialog.querySelector('[data-gif-lightbox-name]').textContent =
    name || 'GIF do exercício'
  dialog
    .querySelector('[data-gif-lightbox-body]')
    .replaceChildren(gifImage(id, 'gif-lightbox-image'))
  dialog.showModal()
}

// Mesmo quadro ampliado, mas com o vídeo MP4 da Biblioteca de MP4.
export async function openVideoLightbox(id, name) {
  if (!id) return
  const dialog = buildLightboxDialog()
  dialog.querySelector('[data-gif-lightbox-name]').textContent = name || 'Vídeo do exercício'
  const body = dialog.querySelector('[data-gif-lightbox-body]')
  const loading = document.createElement('p')
  loading.className = 'gif-lightbox-loading'
  loading.textContent = 'Carregando vídeo…'
  body.replaceChildren(loading)
  dialog.showModal()
  try {
    const video = document.createElement('video')
    video.className = 'gif-lightbox-image'
    video.controls = true
    video.playsInline = true
    video.preload = 'metadata'
    video.src = await loadExerciseVideo(id)
    if (!dialog.open) {
      URL.revokeObjectURL(video.src)
      return
    }
    body.replaceChildren(video)
    video.play().catch(() => {})
  } catch (error) {
    loading.textContent = error.message
  }
}

export function findVideo(id) {
  return (getData().exerciseVideos || []).find((video) => String(video.id) === String(id)) || null
}

// Usada pela Biblioteca para trocar o bonequinho pela miniatura do GIF.
export function applyExerciseGifThumb(item, exercise) {
  const holder = item.querySelector('.exercise-glyph')
  if (!holder || !exercise?.gifId) return
  if (!findGif(exercise.gifId)) return
  holder.classList.add('exercise-glyph--gif', 'exercise-glyph--clickable')
  holder.replaceChildren(gifImage(exercise.gifId, 'exercise-glyph-image'))
  holder.title = 'Clique para ampliar o GIF'
  holder.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openGifLightbox(exercise.gifId, exercise.name)
  })
}

// Botão "+ Novo exercício" usado no cabeçalho das pastas das três
// bibliotecas: abre o cadastro já com o grupo muscular daquela pasta.
export function folderAddButton(group) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--secondary folder-add-button'
  button.textContent = '+ Novo exercício'
  button.title = `Cadastrar um exercício em ${group}`
  button.addEventListener('click', (event) => {
    // Dentro do <summary>: sem isso o clique abriria/fecharia a pasta.
    event.preventDefault()
    event.stopPropagation()
    window.dispatchEvent(new CustomEvent('farisa:new-exercise', { detail: group }))
  })
  return button
}

// Botão "Excluir pasta", só nas pastas criadas por você. As pastas do
// catálogo somem sozinhas quando ficam sem exercício.
export function folderRemoveButton(group, total) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--secondary gif-group-remove'
  button.textContent = 'Excluir pasta'
  button.title = `Excluir a pasta ${group.name}`
  button.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (total)
      return showToast(
        `A pasta ${group.name} ainda tem ${total} exercício(s) dentro. Esvazie ela antes de excluir.`,
      )
    const ok = await askConfirm({
      eyebrow: 'Pastas',
      title: 'Excluir pasta?',
      message: `A pasta ${group.name} será removida da lista de grupos musculares.`,
      note: 'Ela está vazia, então nenhum exercício é perdido.',
      confirmLabel: 'Excluir pasta',
    })
    if (!ok) return
    button.disabled = true
    try {
      await deleteMuscleGroup(group.id)
      await syncRemoteData()
      showToast('Pasta excluída.')
    } catch (error) {
      button.disabled = false
      showToast(error.message)
    }
  })
  return button
}

// Botão "+ Nova pasta", ao lado do filtro "Todos os grupos".
export function folderCreateButton() {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--secondary folder-create-button'
  button.textContent = '+ Nova pasta'
  button.title = 'Criar uma pasta de grupo muscular'
  button.addEventListener('click', async () => {
    const name = await askText({
      eyebrow: 'Pastas',
      title: 'Nova pasta de grupo muscular',
      label: 'Nome da pasta',
      placeholder: 'Ex.: Lombar',
      note: 'A pasta aparece na biblioteca e nos campos de grupo muscular, mesmo antes de ter exercício dentro.',
      confirmLabel: 'Criar pasta',
    })
    if (!name) return
    button.disabled = true
    try {
      const saved = await createMuscleGroup(name)
      await syncRemoteData()
      showToast(
        saved?.alreadyStored
          ? 'Essa pasta já existia.'
          : `Pasta ${saved?.name || name} criada.`,
      )
    } catch (error) {
      showToast(error.message)
    } finally {
      button.disabled = false
    }
  })
  return button
}

// Miniatura do GIF para usar fora da Biblioteca (ex.: no montador de ficha).
export function exerciseGifThumb(exercise, className = 'exercise-pick-gif') {
  if (!exercise?.gifId || !findGif(exercise.gifId)) return null
  return gifImage(exercise.gifId, className)
}

export function exerciseGifStatus(exercise) {
  return exercise?.gifId && findGif(exercise.gifId) ? 'com GIF' : 'sem GIF'
}

/* ------------------------------------------------------------------ */
/* Seletor visual                                                      */
/* ------------------------------------------------------------------ */

let pickerDialog = null

function buildPickerDialog() {
  if (pickerDialog) return pickerDialog
  const dialog = document.createElement('dialog')
  dialog.className = 'modal gif-picker'
  dialog.dataset.gifPicker = ''
  dialog.innerHTML = `<form method="dialog">
    <header>
      <div>
        <span class="eyebrow eyebrow--blue">Biblioteca de GIFs</span>
        <h2>Escolher o GIF do exercício</h2>
      </div>
      <button class="icon-button" type="button" data-gif-close aria-label="Fechar">×</button>
    </header>
    <div class="modal-body">
      <div class="gif-dropzone" data-gif-picker-drop>
        <strong>Arraste aqui a pasta dos GIFs</strong>
        <span>ou clique para escolher os arquivos .gif no computador</span>
      </div>
      <div class="gif-upload">
        <label class="button button--primary gif-upload-button">
          Enviar GIFs do computador
          <input type="file" accept=".gif,image/gif" multiple hidden data-gif-picker-files>
        </label>
        <progress data-gif-picker-progress hidden value="0" max="100"></progress>
        <p role="status" aria-live="polite" data-gif-picker-status></p>
      </div>
      <label class="field">
        <span>Buscar GIF</span>
        <input type="search" data-gif-search placeholder="Ex.: supino, crossover, flexão">
      </label>
      <p class="password-requirements" data-gif-hint></p>
      <div class="gif-grid" data-gif-grid></div>
    </div>
    <footer>
      <button class="button button--secondary" type="button" data-gif-clear>Deixar sem GIF</button>
      <button class="button button--secondary" type="button" data-gif-close>Cancelar</button>
    </footer>
  </form>`
  document.body.append(dialog)
  pickerDialog = dialog
  return dialog
}

export function openGifPicker(exercise) {
  const dialog = buildPickerDialog()
  const grid = dialog.querySelector('[data-gif-grid]')
  const search = dialog.querySelector('[data-gif-search]')
  const hint = dialog.querySelector('[data-gif-hint]')
  const uploadStatus = dialog.querySelector('[data-gif-picker-status]')
  const uploadBar = dialog.querySelector('[data-gif-picker-progress]')
  let available = gifsForGroup(exercise?.group)
  // GIFs enviados agora por esta janela: aparecem primeiro e destacados,
  // mesmo que tenham ficado em outra pasta (ex.: já existiam lá).
  let justSent = []
  search.value = ''

  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      dialog.close()
      cleanup()
      resolve(value)
    }
    const onClose = () => finish(undefined)
    const closeButtons = [...dialog.querySelectorAll('[data-gif-close]')]
    const clearButton = dialog.querySelector('[data-gif-clear]')
    const onClear = () => finish(null)
    const onGridClick = (event) => {
      const card = event.target.closest('[data-gif-id]')
      if (card) finish(card.dataset.gifId)
    }
    const onSearch = () => render()
    const filesInput = dialog.querySelector('[data-gif-picker-files]')
    const dropzone = dialog.querySelector('[data-gif-picker-drop]')
    const receive = async (files) => {
      try {
        // Arquivo solto (sem pasta de origem) vai para o primeiro grupo
        // marcado no exercício — nunca para a lista "A, B" inteira.
        const fallback = exerciseGroups(exercise)[0] || ''
        if (!fallback && ![...files].some((file) => file.webkitRelativePath))
          throw new Error(
            'Marque o grupo muscular do exercício antes de enviar o GIF — é nessa pasta que ele fica guardado.',
          )
        const result = await sendGifFolder(files, uploadStatus, uploadBar, fallback, '', {
          looseToFallback: true,
        })
        justSent = (result?.gifs || []).map((gif) => gif.id)
        available = gifsForGroup(exercise?.group)
        justSent.forEach((id) => {
          const gif = findGif(id)
          if (gif && !available.some((item) => item.id === id)) available = [gif, ...available]
        })
        search.value = ''
        render()
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } catch (error) {
        uploadBar.hidden = true
        uploadStatus.textContent = error.message
      }
    }
    const onUpload = async (event) => {
      const input = event.target
      if (!input.files?.length) return
      // Copia antes de limpar o campo: input.value = '' esvazia a lista de
      // arquivos, e o envio recebia zero arquivos.
      const files = [...input.files]
      input.value = ''
      await receive(files)
    }
    const onDropClick = () => filesInput.click()
    const onDragOver = (event) => {
      event.preventDefault()
      dropzone.classList.add('is-over')
    }
    const onDragLeave = () => dropzone.classList.remove('is-over')
    const onDrop = async (event) => {
      event.preventDefault()
      dropzone.classList.remove('is-over')
      uploadStatus.textContent = 'Lendo os arquivos…'
      await receive(await filesFromDrop(event.dataTransfer))
    }

    function cleanup() {
      dialog.removeEventListener('close', onClose)
      closeButtons.forEach((button) =>
        button.removeEventListener('click', onClose),
      )
      clearButton.removeEventListener('click', onClear)
      grid.removeEventListener('click', onGridClick)
      search.removeEventListener('input', onSearch)
      filesInput.removeEventListener('change', onUpload)
      dropzone.removeEventListener('click', onDropClick)
      dropzone.removeEventListener('dragover', onDragOver)
      dropzone.removeEventListener('dragenter', onDragOver)
      dropzone.removeEventListener('dragleave', onDragLeave)
      dropzone.removeEventListener('drop', onDrop)
    }

    function render() {
      const query = normalized(search.value)
      const list = available
        .filter((gif) => !query || normalized(gif.name).includes(query))
        .map((gif) => ({
          gif,
          score: exercise?.name ? similarity(exercise.name, gif.name) : 0,
        }))
        .sort(
          (a, b) =>
            Number(justSent.includes(b.gif.id)) - Number(justSent.includes(a.gif.id)) ||
            b.score - a.score ||
            a.gif.name.localeCompare(b.gif.name, 'pt-BR'),
        )
      grid.replaceChildren(
        ...list.map(({ gif, score }, index) => {
          const card = document.createElement('button')
          card.type = 'button'
          card.className = 'gif-card'
          card.dataset.gifId = gif.id
          if (gif.id === exercise?.gifId) card.classList.add('is-current')
          card.append(gifImage(gif.id, 'gif-card-image'))
          const label = document.createElement('span')
          label.className = 'gif-card-name'
          label.textContent = gif.name
          card.append(label)
          if (justSent.includes(gif.id)) {
            card.classList.add('is-new')
            const badge = document.createElement('span')
            badge.className = 'gif-card-badge gif-card-badge--new'
            badge.textContent = 'enviado agora'
            card.append(badge)
          } else if (index === justSent.length && score > 0.34 && !query) {
            const badge = document.createElement('span')
            badge.className = 'gif-card-badge'
            badge.textContent = 'sugestão'
            card.append(badge)
          }
          return card
        }),
      )
      hint.textContent = list.length
        ? `${list.length} GIF(s) disponíveis${exercise?.group ? ` para ${exercise.group}` : ''}. Clique no que mostrar o movimento certo.`
        : search.value.trim()
          ? 'Nenhum GIF com esse nome. Tente outra palavra.'
          : 'Não encontrei GIFs na biblioteca. Envie do computador aqui em cima — ou, se você já tinha GIFs, recarregue a página (F5) e confira se o servidor está rodando.'
    }

    dialog.addEventListener('close', onClose)
    closeButtons.forEach((button) => button.addEventListener('click', onClose))
    clearButton.addEventListener('click', onClear)
    grid.addEventListener('click', onGridClick)
    search.addEventListener('input', onSearch)
    filesInput.addEventListener('change', onUpload)
    dropzone.addEventListener('click', onDropClick)
    dropzone.addEventListener('dragover', onDragOver)
    dropzone.addEventListener('dragenter', onDragOver)
    dropzone.addEventListener('dragleave', onDragLeave)
    dropzone.addEventListener('drop', onDrop)
    uploadStatus.textContent = ''
    uploadBar.hidden = true
    render()
    dialog.showModal()
    // Se a lista local veio vazia (ex.: a página abriu antes do servidor
    // responder), busca de novo antes de dizer que não há GIF nenhum.
    if (!(getData().exerciseGifs || []).length) {
      hint.textContent = 'Carregando a biblioteca de GIFs…'
      void syncRemoteData().then(() => {
        if (settled) return
        available = gifsForGroup(exercise?.group)
        render()
      })
    }
  })
}

/* ------------------------------------------------------------------ */
/* Campo do GIF dentro do formulário de exercício                      */
/* ------------------------------------------------------------------ */

function currentExerciseFromForm(form) {
  // O grupo muscular agora são caixas de marcar: `.value` de uma lista de
  // caixas volta sempre vazio, então lemos as marcadas uma a uma.
  const checked = [...form.querySelectorAll('input[name="group"]:checked')].map(
    (input) => input.value,
  )
  return {
    name: form.elements.name?.value || '',
    group: checked.join(', '),
    gifId: form.elements.gifId?.value || '',
  }
}

function paintGifField(form) {
  const preview = form.querySelector('[data-gif-preview]')
  const label = form.querySelector('[data-gif-label]')
  if (!preview || !label) return
  const id = form.elements.gifId?.value || ''
  const gif = id ? findGif(id) : null
  preview.replaceChildren()
  if (gif) {
    preview.append(gifImage(gif.id, 'gif-field-image'))
    label.textContent = gif.name
  } else {
    label.textContent = 'Nenhum GIF escolhido'
  }
  const clear = form.querySelector('[data-gif-field-clear]')
  if (clear) clear.hidden = !gif
}

export function setExerciseGifField(form, gifId) {
  if (!form?.elements?.gifId) return
  form.elements.gifId.value = gifId || ''
  paintGifField(form)
}

export function refreshExerciseGifField() {
  const form = document.querySelector('[data-form="exercise"]')
  if (form?.elements?.gifId) paintGifField(form)
}

function enhanceExerciseForm() {
  const form = document.querySelector('[data-form="exercise"]')
  const body = form?.querySelector('.modal-body')
  if (!body || body.querySelector('[data-gif-field]')) return
  const field = document.createElement('div')
  field.className = 'field gif-field'
  field.dataset.gifField = ''
  field.innerHTML = `<span>GIF do exercício</span>
    <div class="gif-field-row">
      <div class="gif-field-preview" data-gif-preview></div>
      <div class="gif-field-info">
        <strong data-gif-label>Nenhum GIF escolhido</strong>
        <small>O aluno vê o GIF mexendo e o PDF recebe um quadro dele.</small>
      </div>
      <button class="button button--secondary" type="button" data-gif-choose>Escolher GIF</button>
      <button class="icon-button" type="button" data-gif-field-clear aria-label="Remover GIF" hidden>×</button>
    </div>
    <input type="hidden" name="gifId">`
  body.append(field)
  field.querySelector('[data-gif-choose]').addEventListener('click', async () => {
    const chosen = await openGifPicker(currentExerciseFromForm(form))
    if (chosen === undefined) return
    setExerciseGifField(form, chosen)
  })
  field
    .querySelector('[data-gif-field-clear]')
    .addEventListener('click', () => setExerciseGifField(form, ''))
  paintGifField(form)
}

/* ------------------------------------------------------------------ */
/* Envio da pasta de GIFs                                              */
/* ------------------------------------------------------------------ */

// Arrastar e soltar: percorre as subpastas para manter o caminho de origem,
// que e o que define o grupo muscular de cada GIF.
export async function filesFromDrop(dataTransfer) {
  const entries = [...(dataTransfer.items || [])]
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean)
  if (!entries.length) return [...(dataTransfer.files || [])]
  const collected = []
  const walk = async (entry, path) => {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) =>
        entry.file(resolve, reject),
      )
      try {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: `${path}${file.name}`,
        })
      } catch {
        /* alguns navegadores nao deixam redefinir: seguimos sem o caminho */
      }
      collected.push(file)
      return
    }
    if (!entry.isDirectory) return
    const reader = entry.createReader()
    let batch
    do {
      batch = await new Promise((resolve, reject) =>
        reader.readEntries(resolve, reject),
      )
      for (const child of batch) await walk(child, `${path}${entry.name}/`)
    } while (batch.length)
  }
  for (const entry of entries) await walk(entry, '')
  return collected
}

async function sendOneGif(file, group, move = false) {
  const payload = new FormData()
  payload.append('gif', file)
  payload.append('name', nameFromFile(file.name))
  payload.append('group', group)
  if (move) payload.append('move', '1')
  const frame = await firstFrameBlob(file)
  if (frame) payload.append('frame', frame, 'frame.jpg')
  return uploadExerciseGif(payload)
}

// forceGroup: usado pelo botão "Enviar GIFs aqui" de cada pasta — tudo vai
// para aquela pasta, não importa o nome da pasta de origem.
// looseToFallback: na janela de escolher GIF, um arquivo solto vai para o
// grupo do exercício, e não para o grupo "adivinhado" pelo nome do arquivo.
async function sendGifFolder(
  files,
  status,
  bar,
  fallbackGroup = '',
  forceGroup = '',
  { looseToFallback = false } = {},
) {
  const recebidos = [...files]
  const chosen = recebidos.filter(
    (file) =>
      file.type === 'image/gif' ||
      file.name.toLocaleLowerCase('pt-BR').endsWith('.gif'),
  )
  if (!chosen.length) {
    const amostra = recebidos
      .slice(0, 3)
      .map((file) => file.name)
      .join(', ')
    status.textContent = recebidos.length
      ? `Recebi ${recebidos.length} arquivo(s), mas nenhum é .gif${amostra ? ` (ex.: ${amostra})` : ''}. Abra a pasta 1-Peitoral e selecione os arquivos, ou arraste a pasta para a área tracejada.`
      : 'Não chegou nenhum arquivo. Tente arrastar a pasta para a área tracejada.'
    return { gifs: [], falhas: [] }
  }
  let enviados = 0
  let repetidos = 0
  let movidos = 0
  const falhas = []
  // GIFs que o envio devolveu (novos, mudados ou que já existiam), para a
  // tela mostrar exatamente onde cada um ficou.
  const gifs = []
  const repetidosOnde = []
  let concluidos = 0
  const paint = () => {
    bar.value = concluidos
    status.textContent = `Enviando ${concluidos} de ${chosen.length}… (${enviados} novos, ${movidos} mudados de pasta, ${repetidos} já existiam${falhas.length ? `, ${falhas.length} com erro` : ''})`
  }
  bar.max = chosen.length
  bar.value = 0
  bar.hidden = false
  paint()

  const queue = chosen.slice()
  const worker = async () => {
    while (queue.length) {
      const file = queue.shift()
      const folder = (file.webkitRelativePath || '').split('/').slice(-2, -1)[0]
      // Grupo escolhido de propósito (botão da pasta ou nome da pasta de
      // origem): se o GIF já existe em outra pasta, ele é mudado para esta.
      const explicit = forceGroup || groupFromFolder(folder)
      const guessed = looseToFallback ? '' : groupFromFolder(file.name, { custom: false })
      const group = explicit || guessed || fallbackGroup
      try {
        if (!group)
          throw new Error(
            'escolha o grupo muscular ao lado antes de enviar arquivos soltos',
          )
        const saved = await sendOneGif(file, group, Boolean(explicit))
        if (saved?.id) gifs.push(saved)
        if (saved?.moved) movidos += 1
        else if (saved?.alreadyStored) {
          repetidos += 1
          repetidosOnde.push(`${file.name} (pasta ${saved.group || '?'})`)
        } else enviados += 1
      } catch (error) {
        falhas.push(`${file.name}: ${error.message}`)
      }
      concluidos += 1
      paint()
    }
  }
  await Promise.all([worker(), worker(), worker()])

  await syncRemoteData()
  bar.hidden = true
  // Antes só aparecia "atualizada (0 novos)", que parecia sucesso mesmo quando
  // nada mudava. Agora a mensagem diz o que aconteceu com cada arquivo.
  const partes = []
  if (enviados) partes.push(`${enviados} GIF(s) novo(s) enviado(s)`)
  if (movidos) partes.push(`${movidos} mudado(s) de pasta`)
  if (repetidos)
    partes.push(
      `${repetidos} já estava(m) na biblioteca com o mesmo nome de arquivo: ${repetidosOnde.slice(0, 3).join(', ')}${repetidosOnde.length > 3 ? '…' : ''}`,
    )
  if (falhas.length)
    partes.push(
      `${falhas.length} não subiu(ram): ${falhas.slice(0, 2).join(' | ')}${falhas.length > 2 ? '…' : ''}`,
    )
  status.textContent = `${partes.join('. ')}.`
  if (falhas.length) console.warn('GIFs com erro:', falhas)
  showToast(
    falhas.length && !gifs.length
      ? `Nenhum GIF subiu: ${falhas[0]}`
      : enviados || movidos
        ? `Biblioteca de GIFs atualizada: ${[enviados ? `${enviados} novo(s)` : '', movidos ? `${movidos} mudado(s) de pasta` : ''].filter(Boolean).join(', ')}.`
        : repetidos
          ? 'Esse GIF já estava na biblioteca — ele aparece destacado na lista.'
          : 'Nenhum GIF foi enviado.',
  )
  return { gifs, falhas }
}

function createGifLibraryPanel() {
  const page = document.querySelector('[data-route="exercicios"]')
  if (!page || page.querySelector('[data-gif-library]')) return
  const panel = document.createElement('article')
  panel.className = 'panel media-library-panel'
  panel.dataset.gifLibrary = ''
  panel.innerHTML = `<div class="panel-heading">
      <div>
        <span class="eyebrow eyebrow--blue">Biblioteca de GIFs</span>
        <h2>GIFs animados dos exercícios</h2>
        <p>Envie a pasta inteira de uma vez. O grupo muscular vem do nome da pasta de origem, e depois você escolhe o GIF de cada exercício vendo o movimento.</p>
      </div>
    </div>
    <div class="gif-dropzone" data-gif-dropzone>
      <strong>Arraste aqui a pasta dos GIFs</strong>
      <span>ou clique para escolher os arquivos .gif no computador</span>
      <input type="file" accept=".gif,image/gif" multiple hidden data-gif-file-input>
    </div>
    <div class="gif-upload">
      <progress data-gif-progress hidden value="0" max="100"></progress>
      <p role="status" aria-live="polite" data-gif-status></p>
    </div>
    <form class="media-upload-form" data-gif-single-form>
      <div class="field-grid">
        <label class="field"><span>Nome do exercício</span>
          <input name="name" required placeholder="Ex.: Crossover alto"></label>
        <label class="field"><span>Arquivo GIF</span>
          <input name="gif" type="file" accept=".gif,image/gif" required></label>
      </div>
      <label class="field"><span>Grupo muscular</span>
        <select name="group" required data-gif-loose-group></select></label>
      <small>Somente GIF, de qualquer tamanho (até 100 MB, o máximo do Cloudflare). Este grupo também é usado quando você arrasta arquivos soltos, sem pasta.</small>
      <button class="button button--primary" type="submit">Enviar GIF</button>
      <p role="status" aria-live="polite"></p>
    </form>
    <div class="gif-library-groups" data-gif-groups></div>`
  // Logo abaixo da lista de exercicios, para nao ficar escondido no fim da
  // pagina embaixo da biblioteca de MP4.
  const listPanel = page.querySelector('.content-panel')
  if (listPanel) listPanel.after(panel)
  else page.append(panel)

  const status = panel.querySelector('[data-gif-status]')
  const bar = panel.querySelector('[data-gif-progress]')
  const looseGroup = panel.querySelector('[data-gif-loose-group]')
  // Refeito a cada atualização (farisa:data-changed), para uma pasta nova como
  // Trapézio aparecer aqui sem precisar recarregar a página.
  paintLooseGroups()
  const handle = async (input) => {
    if (!input.files?.length) return
    // Copia antes de limpar o campo: input.value = '' esvazia a lista de
    // arquivos, e o envio recebia zero arquivos.
    const files = [...input.files]
    input.value = ''
    try {
      showSentGifs(await sendGifFolder(files, status, bar, looseGroup.value))
    } catch (error) {
      bar.hidden = true
      status.textContent = error.message
    }
  }
  const fileInput = panel.querySelector('[data-gif-file-input]')
  fileInput.addEventListener('change', (event) => handle(event.target))

  const dropzone = panel.querySelector('[data-gif-dropzone]')
  dropzone.addEventListener('click', () => fileInput.click())
  ;['dragenter', 'dragover'].forEach((type) =>
    dropzone.addEventListener(type, (event) => {
      event.preventDefault()
      dropzone.classList.add('is-over')
    }),
  )
  ;['dragleave', 'dragend'].forEach((type) =>
    dropzone.addEventListener(type, () => dropzone.classList.remove('is-over')),
  )
  dropzone.addEventListener('drop', async (event) => {
    event.preventDefault()
    dropzone.classList.remove('is-over')
    status.textContent = 'Lendo os arquivos…'
    try {
      const files = await filesFromDrop(event.dataTransfer)
      showSentGifs(await sendGifFolder(files, status, bar, looseGroup.value))
    } catch (error) {
      bar.hidden = true
      status.textContent = error.message
    }
  })

  // Envio de um GIF por vez, com nome e grupo escolhidos na mão.
  const singleForm = panel.querySelector('[data-gif-single-form]')
  singleForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!singleForm.reportValidity()) return
    const file = singleForm.elements.gif.files?.[0]
    const single = singleForm.querySelector('[role="status"]')
    const button = singleForm.querySelector('[type="submit"]')
    if (!file) return
    button.disabled = true
    button.textContent = 'Enviando…'
    single.textContent = ''
    try {
      const payload = new FormData()
      payload.append('gif', file)
      payload.append('name', singleForm.elements.name.value.trim())
      const chosenGroup = singleForm.elements.group.value
      payload.append('group', chosenGroup)
      payload.append('move', '1')
      const frame = await firstFrameBlob(file)
      if (frame) payload.append('frame', frame, 'frame.jpg')
      const saved = await uploadExerciseGif(payload)
      await syncRemoteData()
      showSentGifs({ gifs: saved?.id ? [saved] : [] })
      singleForm.reset()
      paintLooseGroups()
      showToast(
        saved?.moved
          ? `Esse GIF já estava na biblioteca — foi mudado para ${chosenGroup}.`
          : saved?.alreadyStored
            ? 'Esse arquivo já estava na biblioteca.'
            : 'GIF enviado para a biblioteca.',
      )
    } catch (error) {
      single.textContent = error.message
    } finally {
      button.disabled = false
      button.textContent = 'Enviar GIF'
    }
  })
  renderGifLibrary()
}

async function removeGifGroup(group, lista, ownedGroup) {
  const emUso = (getData().exercises || []).filter((exercise) =>
    lista.some((gif) => gif.id === exercise.gifId),
  ).length
  const aviso = emUso
    ? ` ${emUso} exercício(s) usam esses GIFs e vão ficar sem GIF.`
    : ''
  const ok = await askConfirm({
    eyebrow: 'Biblioteca de GIFs',
    title: `Excluir a pasta ${group}?`,
    message: lista.length
      ? `${lista.length} GIF(s) serão apagados.${aviso}`
      : 'A pasta será removida da lista de grupos musculares.',
    note: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir pasta',
  })
  if (!ok) return
  const status = document.querySelector('[data-gif-status]')
  const bar = document.querySelector('[data-gif-progress]')
  let apagados = 0
  const falhas = []
  const paint = () => {
    if (bar) {
      bar.max = lista.length
      bar.value = apagados + falhas.length
      bar.hidden = false
    }
    if (status)
      status.textContent = `Excluindo ${apagados + falhas.length} de ${lista.length}…`
  }
  paint()
  const fila = lista.slice()
  const worker = async () => {
    while (fila.length) {
      const gif = fila.shift()
      try {
        await deleteExerciseGif(gif.id)
        forgetExerciseGif(gif.id)
        apagados += 1
      } catch (error) {
        falhas.push(`${gif.name}: ${error.message}`)
      }
      paint()
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  if (ownedGroup && !falhas.length) {
    try {
      await deleteMuscleGroup(ownedGroup.id)
    } catch {
      /* a pasta some sozinha quando fica vazia */
    }
  }
  await syncRemoteData()
  if (bar) bar.hidden = true
  if (status)
    status.textContent = `${apagados} GIF(s) do grupo ${group} excluídos${falhas.length ? `, ${falhas.length} não saíram` : ''}.`
  if (falhas.length) console.warn('GIFs que não foram excluídos:', falhas)
  renderGifLibrary()
  showToast(
    falhas.length
      ? `Pasta ${group}: ${apagados} GIF(s) excluídos, ${falhas.length} não saíram.`
      : `Pasta ${group} excluída.`,
  )
}

// Pastas abertas e GIFs recém-enviados na Biblioteca de GIFs. Antes, depois
// de enviar, a lista era redesenhada com todas as pastas fechadas e o GIF
// novo ficava escondido — parecia que o envio não tinha funcionado.
const openGifFolders = new Set()
let recentGifIds = new Set()

function showSentGifs(result) {
  const gifs = result?.gifs || []
  recentGifIds = new Set(gifs.map((gif) => gif.id))
  gifs.forEach((gif) => gif.group && openGifFolders.add(gif.group))
  renderGifLibrary()
  const first = document.querySelector('[data-gif-groups] .gif-card.is-new')
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// Botão "Enviar GIFs aqui" no cabeçalho de cada pasta: escolhe os arquivos
// e todos vão para esta pasta. Se algum já estava em outra pasta (mesmo
// nome de arquivo), ele é mudado para cá em vez de ser ignorado.
function gifUploadHereButton(group) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--secondary folder-add-button'
  button.textContent = '+ Enviar GIFs aqui'
  button.title = `Enviar arquivos .gif para a pasta ${group}`
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.gif,image/gif'
  input.multiple = true
  input.hidden = true
  input.addEventListener('click', (event) => event.stopPropagation())
  input.addEventListener('change', async () => {
    if (!input.files?.length) return
    const files = [...input.files]
    input.value = ''
    const status = document.querySelector('[data-gif-status]')
    const bar = document.querySelector('[data-gif-progress]')
    if (!status || !bar) return
    button.disabled = true
    try {
      showSentGifs(await sendGifFolder(files, status, bar, group, group))
    } catch (error) {
      bar.hidden = true
      status.textContent = error.message
    } finally {
      button.disabled = false
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

function renderGifLibrary() {
  const holder = document.querySelector('[data-gif-groups]')
  if (!holder) return
  const gifs = getData().exerciseGifs || []
  const exercises = getData().exercises || []
  const usados = new Set(exercises.map((item) => item.gifId).filter(Boolean))
  holder.querySelectorAll('.exercise-folder').forEach((folder) => {
    if (folder.open) openGifFolders.add(folder.dataset.group)
    else openGifFolders.delete(folder.dataset.group)
  })
  holder.replaceChildren()
  const custom = getData().customGroups || []
  if (!gifs.length && !custom.length) {
    const empty = document.createElement('p')
    empty.className = 'password-requirements'
    empty.textContent =
      'Nenhum GIF enviado ainda. Use o botão acima e escolha a pasta com os arquivos .gif.'
    holder.append(empty)
    return
  }
  const grupos = new Map()
  // Pastas criadas por você aparecem mesmo vazias, para poder enviar GIFs
  // direto nelas (igual à biblioteca de exercícios).
  custom.forEach((item) => grupos.set(item.name, []))
  gifs.forEach((gif) => {
    if (!grupos.has(gif.group)) grupos.set(gif.group, [])
    grupos.get(gif.group).push(gif)
  })
  const resumo = document.createElement('p')
  resumo.className = 'password-requirements'
  resumo.textContent = `${gifs.length} GIF(s) na biblioteca, ${usados.size} já ligados a exercícios.`
  holder.append(resumo)
  ;[...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .forEach(([group, lista]) => {
      const folder = document.createElement('details')
      folder.className = 'exercise-folder'
      folder.dataset.group = group
      folder.open = openGifFolders.has(group)
      const summary = document.createElement('summary')
      const name = document.createElement('span')
      name.className = 'exercise-folder-name'
      name.textContent = group
      const count = document.createElement('span')
      count.className = 'exercise-folder-count'
      count.textContent = `${lista.length} GIF(s)`
      const ownedGroup = (getData().customGroups || []).find(
        (item) => item.name === group,
      )
      const wipe = document.createElement('button')
      wipe.type = 'button'
      wipe.className = 'button button--secondary gif-group-remove'
      wipe.textContent = 'Excluir pasta'
      wipe.title = `Excluir a pasta ${group}`
      wipe.addEventListener('click', (event) => {
        // O botao vive dentro do <summary>: sem isso o clique abriria/fecharia
        // a pasta em vez de excluir.
        event.preventDefault()
        event.stopPropagation()
        void removeGifGroup(group, lista, ownedGroup)
      })
      summary.append(name, count, gifUploadHereButton(group), folderAddButton(group), wipe)
      const body = document.createElement('div')
      body.className = 'gif-grid gif-grid--library'
      if (!lista.length) {
        const hint = document.createElement('p')
        hint.className = 'password-requirements'
        hint.textContent = `Pasta vazia. Use “Enviar GIFs aqui” para colocar GIFs em ${group}.`
        body.append(hint)
      }
      body.append(
        ...[...lista]
          // Os que acabaram de chegar vêm primeiro na pasta.
          .sort((a, b) => Number(recentGifIds.has(b.id)) - Number(recentGifIds.has(a.id)))
          .map((gif) => {
          const card = document.createElement('div')
          card.className = 'gif-card'
          card.title = 'Clique para ampliar o GIF'
          if (usados.has(gif.id)) card.classList.add('is-current')
          if (recentGifIds.has(gif.id)) {
            card.classList.add('is-new')
            const badge = document.createElement('span')
            badge.className = 'gif-card-badge gif-card-badge--new'
            badge.textContent = 'enviado agora'
            card.append(badge)
          }
          card.append(gifImage(gif.id, 'gif-card-image'))
          card.addEventListener('click', () => openGifLightbox(gif.id, gif.name))
          const label = document.createElement('span')
          label.className = 'gif-card-name'
          label.textContent = gif.name
          const remove = document.createElement('button')
          remove.type = 'button'
          remove.className = 'icon-button gif-card-remove'
          remove.textContent = '×'
          remove.title = 'Excluir este GIF'
          remove.addEventListener('click', async (event) => {
            // Sem isso, o clique tambem borbulharia pro card e abriria o
            // GIF ampliado junto com a confirmacao de exclusao.
            event.stopPropagation()
            const ok = await askConfirm({
              eyebrow: 'Biblioteca de GIFs',
              title: 'Excluir GIF?',
              message: `O GIF “${gif.name}” será apagado da biblioteca.`,
              note: 'Exercícios que usam ele ficam sem GIF.',
            })
            if (!ok) return
            try {
              await deleteExerciseGif(gif.id)
              forgetExerciseGif(gif.id)
              await syncRemoteData()
              renderGifLibrary()
              showToast('GIF excluído.')
            } catch (error) {
              showToast(error.message)
            }
          })
          card.append(label, remove)
          return card
        }),
      )
      folder.append(summary, body)
      holder.append(folder)
    })
}

export function initExerciseGifs() {
  const start = () => {
    createGifLibraryPanel()
    enhanceExerciseForm()
    renderGifLibrary()
    refreshExerciseGifField()
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
  // syncRemoteData troca o estado e dispara farisa:data-changed, entao um
  // ouvinte so ja cobre o envio em lote e o refresh remoto.
  window.addEventListener('farisa:data-changed', () => {
    paintLooseGroups()
    renderGifLibrary()
    refreshExerciseGifField()
  })
}
