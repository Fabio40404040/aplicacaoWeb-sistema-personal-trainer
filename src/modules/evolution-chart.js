// Gráfico de evolução do aluno no painel do personal: linha suave com área
// em degradê, valores em cada ponto e detalhe ao passar o mouse ou tocar.
import '../styles/evolution-chart.css'

const SVG = 'http://www.w3.org/2000/svg'
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG, tag)
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value))
  return node
}
const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
const num = (value, digits = 1) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits })
const dayMonth = (date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const fullDate = (date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

// Curva suave que nunca passa acima ou abaixo dos pontos (cúbica monótona).
function smoothPath(points) {
  if (points.length < 3) return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const n = points.length
  const dx = []
  const slope = []
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(points[i + 1][0] - points[i][0])
    slope.push((points[i + 1][1] - points[i][1]) / dx[i])
  }
  const tangent = [slope[0]]
  for (let i = 1; i < n - 1; i += 1)
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (2 * slope[i - 1] * slope[i]) / (slope[i - 1] + slope[i]))
  tangent.push(slope[n - 2])
  let path = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3
    path += ` C${(points[i][0] + third).toFixed(1)},${(points[i][1] + tangent[i] * third).toFixed(1)} ${(points[i + 1][0] - third).toFixed(1)},${(points[i + 1][1] - tangent[i + 1] * third).toFixed(1)} ${points[i + 1][0].toFixed(1)},${points[i + 1][1].toFixed(1)}`
  }
  return path
}

// Passos "redondos" para o eixo (1, 2, 5, 10…).
function niceTicks(min, max, count = 4) {
  const span = max - min || Math.abs(max) * 0.1 || 1
  const raw = span / (count - 1)
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((value) => value >= raw)
  const start = Math.floor((min - span * 0.08) / step) * step
  const end = Math.ceil((max + span * 0.08) / step) * step
  const ticks = []
  for (let value = start; value <= end + step / 2; value += step) ticks.push(Number(value.toFixed(6)))
  return ticks
}

let gradientCount = 0

export function renderEvolutionChart(container, entries, { unit = '', label = '' } = {}) {
  if (!container) return
  container.className = 'evo'
  container.replaceChildren()
  if (!entries.length) {
    const empty = el('div', 'evo-empty')
    empty.append(el('span', '', '📈'), el('strong', '', 'Sem registros ainda'), el('p', '', 'Registre uma avaliação deste aluno para o gráfico aparecer aqui.'))
    container.append(empty)
    return
  }
  const first = entries[0]
  const last = entries.at(-1)
  const diff = last.value - first.value

  const head = el('div', 'evo-head')
  const now = el('div', 'evo-now')
  now.append(el('span', '', `${label} atual`))
  const big = el('strong', '', num(last.value))
  big.append(el('small', '', ` ${unit}`))
  now.append(big)
  head.append(now)
  if (entries.length > 1) {
    const change = el('div', `evo-change${diff < 0 ? ' is-down' : diff > 0 ? ' is-up' : ''}`)
    change.append(
      el('strong', '', Math.abs(diff) < 0.05 ? 'Sem variação' : `${diff > 0 ? '▲ +' : '▼ −'}${num(Math.abs(diff))} ${unit}`),
      el('span', '', `desde ${fullDate(first.date)} · ${entries.length} registros`),
    )
    head.append(change)
  } else head.append(el('p', 'evo-single', 'A evolução aparece a partir da segunda avaliação.'))
  container.append(head)

  const width = 680
  const height = 270
  const left = 44
  const right = 22
  const top = 30
  const bottom = 34
  const values = entries.map((item) => item.value)
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const low = ticks[0]
  const high = ticks.at(-1)
  const yOf = (value) => top + (1 - (value - low) / (high - low || 1)) * (height - top - bottom)
  const xOf = (index) => (entries.length === 1 ? (left + width - right) / 2 : left + (index * (width - left - right)) / (entries.length - 1))
  const points = entries.map((item, index) => [xOf(index), yOf(item.value)])

  const wrap = el('div', 'evo-plot')
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img' })
  chart.setAttribute('aria-label', `${label}: ${entries.map((item) => `${dayMonth(item.date)} ${num(item.value)} ${unit}`).join(', ')}`)
  const gradientId = `evo-fill-${(gradientCount += 1)}`
  const defs = svg('defs')
  const gradient = svg('linearGradient', { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 })
  gradient.append(svg('stop', { offset: '0%', class: 'evo-stop-top' }), svg('stop', { offset: '100%', class: 'evo-stop-bottom' }))
  defs.append(gradient)
  chart.append(defs)
  ticks.forEach((value) => {
    const y = yOf(value).toFixed(1)
    chart.append(svg('line', { x1: left, x2: width - right, y1: y, y2: y, class: 'evo-grid' }))
    const tick = svg('text', { x: left - 10, y: Number(y) + 4, 'text-anchor': 'end', class: 'evo-axis' })
    tick.textContent = num(value)
    chart.append(tick)
  })
  const line = smoothPath(points)
  if (entries.length > 1) {
    const base = height - bottom
    chart.append(svg('path', { d: `${line} L${points.at(-1)[0].toFixed(1)},${base} L${points[0][0].toFixed(1)},${base} Z`, fill: `url(#${gradientId})`, class: 'evo-area' }))
    chart.append(svg('path', { d: line, class: 'evo-line', pathLength: 1 }))
  }
  const guide = svg('line', { y1: top - 8, y2: height - bottom, class: 'evo-guide' })
  chart.append(guide)
  const labelEvery = Math.ceil(entries.length / 7)
  const dots = points.map(([x, y], index) => {
    const isLast = index === points.length - 1
    if (isLast) chart.append(svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 11, class: 'evo-halo' }))
    const dot = svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: isLast ? 6 : 4.5, class: `evo-dot${isLast ? ' is-last' : ''}` })
    chart.append(dot)
    if (entries.length <= 8 || isLast || index === 0) {
      const value = svg('text', { x: x.toFixed(1), y: (y - 13).toFixed(1), 'text-anchor': index === 0 && entries.length > 1 ? 'start' : isLast && entries.length > 1 ? 'end' : 'middle', class: `evo-value${isLast ? ' is-last' : ''}` })
      value.textContent = num(entries[index].value)
      chart.append(value)
    }
    if (index % labelEvery === 0 || isLast) {
      const date = svg('text', { x: x.toFixed(1), y: height - 10, 'text-anchor': 'middle', class: 'evo-axis' })
      date.textContent = dayMonth(entries[index].date)
      chart.append(date)
    }
    return dot
  })
  wrap.append(chart)

  // Detalhe do ponto mais próximo ao passar o mouse ou tocar.
  const tip = el('div', 'evo-tip')
  tip.hidden = true
  wrap.append(tip)
  const show = (index) => {
    const [x, y] = points[index]
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index))
    guide.setAttribute('x1', x.toFixed(1))
    guide.setAttribute('x2', x.toFixed(1))
    guide.classList.add('is-on')
    tip.replaceChildren(el('span', '', fullDate(entries[index].date)), el('strong', '', `${num(entries[index].value)} ${unit}`))
    if (index > 0) {
      const step = entries[index].value - entries[index - 1].value
      tip.append(el('small', '', Math.abs(step) < 0.05 ? 'igual à anterior' : `${step > 0 ? '+' : '−'}${num(Math.abs(step))} ${unit} vs. anterior`))
    }
    tip.hidden = false
    tip.style.left = `${(x / width) * 100}%`
    tip.style.top = `${(y / height) * 100}%`
    tip.classList.toggle('is-left', x > width * 0.7)
  }
  const hide = () => {
    tip.hidden = true
    guide.classList.remove('is-on')
    dots.forEach((dot) => dot.classList.remove('is-active'))
  }
  wrap.addEventListener('pointermove', (event) => {
    const box = chart.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width) * width
    let nearest = 0
    points.forEach(([px], index) => {
      if (Math.abs(px - x) < Math.abs(points[nearest][0] - x)) nearest = index
    })
    show(nearest)
  })
  wrap.addEventListener('pointerleave', hide)
  container.append(wrap)
}
