// Painel → Recebimentos → "Pagamentos recebidos": período (mês, ano, tudo ou
// datas escolhidas), filtro por forma de pagamento, busca por aluno, totais e
// agrupamento por mês, ano, aluno ou plano. Tudo calculado no navegador.
import '../styles/payout-history.css'

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}
const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const cap = (text) => text.replace(/^./u, (letter) => letter.toUpperCase())
const METHODS = { pix: 'Pix', credit_card: 'Cartão' }
const methodOf = (item) => METHODS[item.method] || 'Outro'

const PERIODS = [
  ['month', 'Este mês'],
  ['last-month', 'Mês passado'],
  ['3m', '3 meses'],
  ['year', 'Este ano'],
  ['last-year', 'Ano passado'],
  ['all', 'Tudo'],
  ['custom', 'Escolher datas'],
]
// Lembra as escolhas enquanto a página está aberta (uma memória por relatório).
const memory = {}
// Textos do relatório em uso: no painel do personal quem paga é o "aluno"; no
// admin, o "personal".
let state = null
let words = null

function parse(raw) {
  const text = String(raw || '')
  const date = new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

// [início, fim) do período escolhido; null = sem limite daquele lado.
function range() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (state.period === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 1)]
  if (state.period === 'last-month') return [new Date(y, m - 1, 1), new Date(y, m, 1)]
  if (state.period === '3m') return [new Date(y, m - 2, 1), new Date(y, m + 1, 1)]
  if (state.period === 'year') return [new Date(y, 0, 1), new Date(y + 1, 0, 1)]
  if (state.period === 'last-year') return [new Date(y - 1, 0, 1), new Date(y, 0, 1)]
  if (state.period === 'custom') {
    const from = state.from ? new Date(`${state.from}T00:00:00`) : null
    const to = state.to ? new Date(`${state.to}T00:00:00`) : null
    if (to) to.setDate(to.getDate() + 1) // inclui o último dia
    return [from, to]
  }
  return [null, null]
}

function periodLabel() {
  const [from, to] = range()
  const short = (date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (state.period === 'all') return 'Desde o primeiro pagamento'
  if (state.period === 'month' || state.period === 'last-month')
    return cap(from.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
  if (state.period === 'year' || state.period === 'last-year') return String(from.getFullYear())
  const last = to ? new Date(to.getTime() - 86_400_000) : null
  if (from && last) return `${short(from)} a ${short(last)}`
  if (from) return `A partir de ${short(from)}`
  if (last) return `Até ${short(last)}`
  return 'Escolha as datas'
}

function filtered(rows) {
  const [from, to] = range()
  const term = state.search.trim().toLowerCase()
  return rows.filter((item) => {
    if (state.period !== 'all' && !item.date) return false
    if (from && item.date < from) return false
    if (to && item.date >= to) return false
    if (state.method !== 'all' && item.method !== state.method) return false
    if (term && !`${item.studentName || ''} ${item.planName || ''}`.toLowerCase().includes(term)) return false
    return true
  })
}

function groupKey(item) {
  if (state.group === 'student') return [item.studentName || words.removed, item.studentName || words.removed]
  if (state.group === 'plan') return [item.planName || 'Sem plano', item.planName || 'Sem plano']
  if (!item.date) return ['sem-data', 'Sem data']
  if (state.group === 'year') return [String(item.date.getFullYear()), String(item.date.getFullYear())]
  return [
    `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`,
    cap(item.date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })),
  ]
}

function chips(options, current, onPick, label) {
  const row = el('div', 'payhist-chips')
  row.setAttribute('role', 'group')
  row.setAttribute('aria-label', label)
  options.forEach(([value, text]) => {
    const chip = el('button', `payhist-chip${value === current ? ' is-active' : ''}`, text)
    chip.type = 'button'
    chip.setAttribute('aria-pressed', String(value === current))
    chip.addEventListener('click', () => onPick(value))
    row.append(chip)
  })
  return row
}

function tile(label, value, hint = '') {
  const box = el('div', 'payhist-tile')
  box.append(el('span', '', label), el('strong', '', value))
  if (hint) box.append(el('small', '', hint))
  return box
}

function exportCsv(rows) {
  const cell = (value) => `"${String(value ?? '').replace(/"/gu, '""')}"`
  const lines = [
    ['Data', words.who, 'Plano', 'Forma', 'Valor (R$)'].map(cell).join(';'),
    ...rows.map((item) =>
      [
        item.date ? item.date.toLocaleDateString('pt-BR') : '',
        item.studentName || words.removed,
        item.planName || '',
        methodOf(item) + (item.provider === 'pix_manual' ? ' (confirmado por você)' : ''),
        (Number(item.amountCents || 0) / 100).toFixed(2).replace('.', ','),
      ]
        .map(cell)
        .join(';'),
    ),
  ]
  // BOM para o Excel abrir os acentos certos.
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${words.file}-${periodLabel().toLowerCase().replace(/[^a-z0-9à-ú]+/giu, '-')}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 2000)
}

export function historyBox(history, options = {}) {
  const config = {
    key: 'alunos',
    title: 'Pagamentos recebidos',
    who: 'Aluno',
    removed: 'Aluno removido',
    file: 'recebimentos',
    emptyAll: '',
    ...options,
  }
  const all = (history || []).map((item) => ({ ...item, date: parse(item.paidAt) }))
  if (!all.length && !config.emptyAll) return null
  memory[config.key] ||= { period: 'month', group: 'month', method: 'all', search: '', from: '', to: '', open: {} }
  // Cada desenho usa o estado e os textos do próprio relatório.
  const use = () => {
    state = memory[config.key]
    words = config
  }
  use()
  const GROUPS = [
    ['month', 'Mês'],
    ['year', 'Ano'],
    ['student', config.who],
    ['plan', 'Plano'],
  ]
  const card = el('section', 'panel payhist')
  const head = el('div', 'payhist-head')
  const title = el('div')
  title.append(el('h2', '', config.title), el('p', 'payhist-period'))
  const download = el('button', 'button button--secondary payhist-export', 'Baixar planilha')
  download.type = 'button'
  head.append(title, download)

  const periodRow = el('div', 'payhist-line')
  const customRow = el('div', 'payhist-dates')
  const from = el('input')
  const to = el('input')
  from.type = to.type = 'date'
  from.value = state.from
  to.value = state.to
  from.setAttribute('aria-label', 'Data inicial')
  to.setAttribute('aria-label', 'Data final')
  const fromLabel = el('label', 'field')
  fromLabel.append(el('span', '', 'De'), from)
  const toLabel = el('label', 'field')
  toLabel.append(el('span', '', 'Até'), to)
  customRow.append(fromLabel, toLabel)

  const filters = el('div', 'payhist-filters')
  const search = el('input')
  search.type = 'search'
  search.placeholder = `Buscar ${config.who.toLowerCase()} ou plano`
  search.value = state.search
  search.setAttribute('aria-label', search.placeholder)
  const methodRow = el('div', 'payhist-line')
  filters.append(search, methodRow)

  const tiles = el('div', 'payhist-tiles')
  const groupLine = el('div', 'payhist-groupline')
  const list = el('div', 'payhist-list')
  card.append(head, periodRow, customRow, filters, tiles, groupLine, list)

  let current = []
  function paint() {
    use()
    current = filtered(all)
    card.querySelector('.payhist-period').textContent = periodLabel()
    periodRow.replaceChildren(
      chips(PERIODS, state.period, (value) => {
        use()
        state.period = value
        paint()
      }, 'Período'),
    )
    customRow.hidden = state.period !== 'custom'
    methodRow.replaceChildren(
      chips([['all', 'Todas as formas'], ['pix', 'Pix'], ['credit_card', 'Cartão']], state.method, (value) => {
        use()
        state.method = value
        paint()
      }, 'Forma de pagamento'),
    )
    const total = current.reduce((sum, item) => sum + Number(item.amountCents || 0), 0)
    const sumOf = (method) =>
      current.filter((item) => item.method === method).reduce((sum, item) => sum + Number(item.amountCents || 0), 0)
    const students = new Set(current.map((item) => item.studentName || '?')).size
    tiles.replaceChildren(
      tile('Total recebido', money(total)),
      tile('Pagamentos', String(current.length), current.length ? `${students} ${students === 1 ? config.who.toLowerCase() : config.plural || `${config.who.toLowerCase()}s`}` : ''),
      tile('Valor médio', current.length ? money(total / current.length) : '—'),
      tile('Pix · Cartão', `${money(sumOf('pix'))} · ${money(sumOf('credit_card'))}`),
    )
    download.disabled = !current.length

    groupLine.replaceChildren(
      el('span', '', 'Agrupar por'),
      chips(GROUPS, state.group, (value) => {
        use()
        state.group = value
        paint()
      }, 'Agrupar por'),
    )

    if (!current.length) {
      list.replaceChildren(el('p', 'payhist-empty', all.length ? 'Nenhum pagamento neste período com esses filtros.' : config.emptyAll))
      return
    }
    const groups = new Map()
    current.forEach((item) => {
      const [key, label] = groupKey(item)
      if (!groups.has(key)) groups.set(key, { label, items: [], total: 0 })
      const group = groups.get(key)
      group.items.push(item)
      group.total += Number(item.amountCents || 0)
    })
    // Por data: mais recente primeiro. Por aluno/plano: quem mais pagou primeiro.
    const ordered = [...groups.entries()].sort((a, b) =>
      ['month', 'year'].includes(state.group) ? (a[0] < b[0] ? 1 : -1) : b[1].total - a[1].total,
    )
    const biggest = Math.max(...ordered.map(([, group]) => group.total), 1)
    list.replaceChildren(
      ...ordered.map(([key, group], index) => {
        const id = `${state.group}:${key}`
        const details = el('details', 'support-folder payhist-group')
        details.open = state.open[id] ?? (ordered.length === 1 || (index === 0 && ['month', 'year'].includes(state.group)))
        details.addEventListener('toggle', () => {
          use()
          state.open[id] = details.open
        })
        const summary = el('summary')
        const name = el('span', '', group.label)
        const amount = el('strong', 'payhist-amount', money(group.total))
        const count = el('small', '', String(group.items.length))
        summary.append(name, amount, count)
        // Barra proporcional ao maior grupo: dá para comparar de relance.
        const bar = el('div', 'payhist-bar')
        const fill = el('i')
        fill.style.width = `${Math.max(2, Math.round((group.total / biggest) * 100))}%`
        bar.append(fill)
        details.append(summary, bar)
        group.items.forEach((item) => {
          const row = el('div', 'payhist-row')
          const text = el('div')
          text.append(
            el('strong', '', state.group === 'student' ? item.planName || 'Pagamento' : item.studentName || config.removed),
            el(
              'small',
              '',
              [
                item.date ? item.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
                state.group === 'student' ? '' : item.planName,
                methodOf(item),
                item.provider === 'pix_manual' ? 'confirmado por você' : '',
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          )
          row.append(text, el('span', 'payhist-value', money(item.amountCents)))
          details.append(row)
        })
        return details
      }),
    )
  }

  // A busca e as datas não redesenham o próprio campo (o cursor não some).
  search.addEventListener('input', () => {
    use()
    state.search = search.value
    paint()
  })
  from.addEventListener('change', () => {
    use()
    state.from = from.value
    paint()
  })
  to.addEventListener('change', () => {
    use()
    state.to = to.value
    paint()
  })
  download.addEventListener('click', () => {
    use()
    exportCsv(current)
  })
  paint()
  return card
}
