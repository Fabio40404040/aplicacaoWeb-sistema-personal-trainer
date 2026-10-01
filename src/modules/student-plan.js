// Área do aluno → "Mudar de plano": escolhe o plano e o período, vê o valor
// e paga por PIX ou cartão. Com o acesso ativo, o aluno continua no plano
// atual até o pagamento ser aprovado; aí o plano novo entra sozinho.
const money = (cents) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const CYCLES = {
  monthly: { label: 'Mensal', note: '' },
  quarterly: { label: 'Trimestral', note: '5% off' },
  semiannual: { label: 'Semestral', note: '10% off' },
  annual: { label: 'Anual', note: '15% off' },
  permanent: { label: 'Pagamento único', note: '' },
}

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

let dialog
function ensureDialog() {
  if (dialog?.isConnected) return dialog
  dialog = el('dialog', 'student-booking-dialog student-plan-dialog')
  dialog.innerHTML = `<div class="student-booking">
    <header><div><span class="eyebrow">Meu plano</span><h2 data-plan-title>Mudar de plano</h2></div>
      <button class="icon-button" type="button" data-plan-close aria-label="Fechar">×</button></header>
    <div class="student-booking-body" data-plan-body></div>
    <footer data-plan-footer></footer>
  </div>`
  document.body.append(dialog)
  dialog.querySelector('[data-plan-close]').addEventListener('click', () => dialog.close())
  return dialog
}

function paymentStep(box, { title, lines, paymentControls, reload }) {
  box.querySelector('[data-plan-title]').textContent = 'Pagamento do novo plano'
  const body = box.querySelector('[data-plan-body]')
  const summary = el('div', 'plan-summary')
  summary.append(el('strong', '', title), ...lines.map((line) => el('small', '', line)))
  const note = el(
    'p',
    'plan-note',
    'Você continua com o plano atual até o pagamento ser aprovado. O plano novo entra na hora e o período começa no dia do pagamento.',
  )
  const pay = el('section', 'plan-pay')
  pay.append(...paymentControls(() => {
    box.close()
    void reload()
  }))
  body.replaceChildren(summary, note, pay)
  const footer = box.querySelector('[data-plan-footer]')
  const done = el('button', 'button button--secondary', 'Fechar')
  done.type = 'button'
  done.addEventListener('click', () => box.close())
  footer.replaceChildren(done)
}

export function openPlanChange(data, { request, reload, paymentControls, resume = false }) {
  const box = ensureDialog()
  box.querySelector('[data-plan-title]').textContent = 'Mudar de plano'
  const body = box.querySelector('[data-plan-body]')
  const footer = box.querySelector('[data-plan-footer]')
  const options = data.planOptions || []
  const current = data.access.planCode
  const state = {
    plan: options.find((plan) => plan.code !== current) || null,
    cycle: 'monthly',
  }

  if (resume && data.pendingChange) {
    const plan = options.find((item) => item.code === data.pendingChange.planCode)
    const price = plan?.prices.find((item) => item.cycle === data.pendingChange.billingCycle) || plan?.prices[0]
    paymentStep(box, {
      title: data.pendingChange.planName,
      lines: [
        `${CYCLES[data.pendingChange.billingCycle]?.label || ''} · ${price ? money(price.amountCents) : ''}`,
      ],
      paymentControls,
      reload,
    })
    box.showModal()
    return
  }

  const status = el('p', 'plan-status')
  const paint = () => {
    const list = el('div', 'plan-options')
    options.forEach((plan) => {
      const isCurrent = plan.code === current
      const card = el('button', `plan-option${state.plan?.code === plan.code ? ' is-active' : ''}${isCurrent ? ' is-current' : ''}`)
      card.type = 'button'
      const from = plan.prices.find((item) => item.cycle === 'monthly') || plan.prices[0]
      card.append(
        el('strong', '', plan.name),
        el(
          'span',
          'plan-option-price',
          plan.accessType === 'permanent' ? `${money(from.amountCents)} · único` : `${money(from.amountCents)}/mês`,
        ),
      )
      if (isCurrent) card.append(el('em', 'plan-option-tag', 'Seu plano'))
      card.addEventListener('click', () => {
        state.plan = plan
        if (plan.accessType === 'permanent') state.cycle = 'permanent'
        else if (state.cycle === 'permanent') state.cycle = 'monthly'
        paint()
      })
      list.append(card)
    })
    const sections = [el('h3', '', '1. Escolha o plano'), list]
    if (state.plan && state.plan.accessType !== 'permanent') {
      const cycles = el('div', 'plan-cycles')
      state.plan.prices.forEach((price) => {
        const chip = el('button', `plan-cycle${state.cycle === price.cycle ? ' is-active' : ''}`)
        chip.type = 'button'
        chip.append(
          el('strong', '', CYCLES[price.cycle].label),
          el('span', '', money(price.amountCents)),
          el('small', '', `${money(price.monthlyCents)}/mês${CYCLES[price.cycle].note ? ` · ${CYCLES[price.cycle].note}` : ''}`),
        )
        chip.addEventListener('click', () => {
          state.cycle = price.cycle
          paint()
        })
        cycles.append(chip)
      })
      sections.push(el('h3', '', '2. Período'), cycles)
    }
    body.replaceChildren(...sections, status)
    const price = state.plan?.prices.find((item) => item.cycle === state.cycle) || state.plan?.prices[0]
    const same = state.plan?.code === current && state.cycle === data.access.billingCycle
    const back = el('button', 'button button--secondary', 'Voltar')
    back.type = 'button'
    back.addEventListener('click', () => box.close())
    const next = el(
      'button',
      'button button--primary',
      state.plan && price ? `Continuar · ${money(price.amountCents)}` : 'Continuar',
    )
    next.type = 'button'
    next.disabled = !state.plan || same
    next.addEventListener('click', async () => {
      next.disabled = true
      status.textContent = ''
      try {
        const result = await request('plan-change', { planCode: state.plan.code, billingCycle: state.cycle })
        paymentStep(box, {
          title: state.plan.name,
          lines: [`${CYCLES[state.cycle].label} · ${money(price.amountCents)}`],
          paymentControls,
          reload,
        })
        if (result.mode === 'direct') void reload()
      } catch (error) {
        status.textContent = error.message
        next.disabled = false
      }
    })
    footer.replaceChildren(back, next)
  }
  paint()
  box.showModal()
}

export async function cancelPlanChange({ request, reload }) {
  await request('plan-change', { cancel: true })
  await reload()
}
