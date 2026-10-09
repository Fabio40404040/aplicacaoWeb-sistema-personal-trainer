// Ordem das pastas da biblioteca (Exercícios, GIFs e Vídeos): a mesma em
// todas as abas. Primeiro a ordem em que você arrastou várias pastas de uma
// vez; depois a ordem em que cada pasta foi criada (a primeira que você
// adicionou fica em cima); empate em ordem alfabética.
import { getData } from './state.js'
import { legGroupNames } from '../data/library.js'
import { exerciseGroups } from './utils.js'

const folderOf = (group) => (legGroupNames.includes(group) ? 'Pernas' : group)

export function folderSorter() {
  const data = getData()
  const explicit = data.folderOrder || []
  const firstSeen = new Map()
  const note = (group, when) => {
    if (!group) return
    const stamp = String(when || '9999')
    ;[group, folderOf(group)].forEach((name) => {
      if (!firstSeen.has(name) || stamp < firstSeen.get(name)) firstSeen.set(name, stamp)
    })
  }
  ;(data.exercises || []).forEach((item) =>
    exerciseGroups(item).forEach((group) => note(group, item.createdAt)),
  )
  ;(data.exerciseGifs || []).forEach((item) => note(item.group, item.createdAt))
  ;(data.exerciseVideos || []).forEach((item) => note(item.group, item.createdAt))
  ;(data.customGroups || []).forEach((item) => note(item.name, item.createdAt))
  return (a, b) => {
    const ea = explicit.indexOf(a)
    const eb = explicit.indexOf(b)
    if (ea !== -1 || eb !== -1) {
      if (ea === -1) return 1
      if (eb === -1) return -1
      if (ea !== eb) return ea - eb
    }
    const fa = firstSeen.get(a) || '9999'
    const fb = firstSeen.get(b) || '9999'
    if (fa !== fb) return fa < fb ? -1 : 1
    return a.localeCompare(b, 'pt-BR')
  }
}
