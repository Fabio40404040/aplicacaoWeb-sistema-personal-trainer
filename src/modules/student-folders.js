// Pasta "Todos os alunos" (fechada até clicar; abre sozinha ao buscar),
// usada em Check-ins e Evolução — mesmo visual de Treinos e Avaliação física.
export function allStudentsFolder({ meta, open, onToggle }) {
  const folder = document.createElement('details')
  folder.className = 'assessment-group workout-all'
  folder.open = open
  folder.addEventListener('toggle', () => onToggle?.(folder.open))
  const summary = document.createElement('summary')
  const icon = document.createElement('span')
  icon.className = 'workout-all-icon'
  icon.textContent = '👥'
  const info = document.createElement('div')
  info.className = 'assessment-group-info'
  const title = document.createElement('strong')
  title.textContent = 'Todos os alunos'
  const small = document.createElement('small')
  small.textContent = meta
  info.append(title, small)
  summary.append(icon, info)
  const body = document.createElement('div')
  body.className = 'assessment-groups workout-all-body'
  folder.append(summary, body)
  return { folder, body }
}

export function emptyLine(text) {
  const empty = document.createElement('p')
  empty.className = 'workout-all-empty'
  empty.textContent = text
  return empty
}

export const normalize = (text) => String(text || '').trim().toLocaleLowerCase('pt-BR')

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
