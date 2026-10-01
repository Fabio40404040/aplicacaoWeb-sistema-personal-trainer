// Evolução: escolha do aluno pela pasta "Todos os alunos" + busca
// (substitui a lista suspensa, que continua escondida e guarda a escolha).
import { getData } from './state.js'
import { paintAvatar } from './profile-kit.js'
import { allStudentsFolder, emptyLine, normalize, plural } from './student-folders.js'

let allOpen = false

function render() {
  const container = document.querySelector('[data-progress-picker]')
  const select = document.querySelector('[data-progress-student]')
  if (!container || !select) return
  const query = normalize(document.querySelector('[data-progress-search]')?.value)
  const names = [...select.options].map((option) => option.value).filter(Boolean)
  const students = getData().students || []
  const shown = names.filter((name) => !query || normalize(name).includes(query))
  const current = select.value
  const { folder, body } = allStudentsFolder({
    meta: `${plural(names.length, 'aluno', 'alunos')}${current ? ` · vendo: ${current}` : ''}`,
    open: Boolean(query) || allOpen,
    onToggle: (open) => {
      if (!query) allOpen = open
    },
  })
  container.replaceChildren(folder)
  if (!shown.length) {
    body.append(
      emptyLine(query ? 'Nenhum aluno encontrado para essa busca.' : 'Nenhum aluno cadastrado ainda.'),
    )
    return
  }
  const grid = document.createElement('div')
  grid.className = 'progress-picker-grid'
  grid.append(
    ...shown.map((name) => {
      const student = students.find((item) => item.name === name)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `progress-picker-item${name === current ? ' is-active' : ''}`
      const avatar = document.createElement('span')
      avatar.className = 'avatar'
      paintAvatar(avatar, { name, avatar: student?.avatar })
      const info = document.createElement('span')
      const strong = document.createElement('strong')
      strong.textContent = name
      const small = document.createElement('small')
      small.textContent = name === current ? 'Vendo agora' : student?.goal || 'Ver evolução'
      info.append(strong, small)
      button.append(avatar, info)
      button.addEventListener('click', () => {
        select.value = name
        select.dispatchEvent(new Event('change', { bubbles: true }))
        allOpen = false
        const search = document.querySelector('[data-progress-search]')
        if (search) search.value = ''
        render()
        document
          .querySelector('[data-route="evolucao"] .progress-summary')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return button
    }),
  )
  body.append(grid)
}

export function initProgressPicker() {
  document.querySelector('[data-progress-search]')?.addEventListener('input', render)
  document.querySelector('[data-progress-student]')?.addEventListener('change', render)
  window.addEventListener('farisa:data-changed', render)
  render()
}
