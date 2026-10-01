// Planos da plataforma para o personal: cadastro com 14 dias grátis
// (tela "Criar conta"), página "Minha assinatura" e avisos de vencimento.
import {
  fetchBilling,
  fetchSaasPlans,
  registerTrainerAccount,
  startBillingCheckout,
} from './api-client.js'
import { createQrCodeImage } from './pix.js'
import { showToast } from './utils.js'

const money = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}
const day = (value) =>
  value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''

let billing = null
const choice = { plan: null, cycle: 'monthly' }

// ---------- cadastro
function planCard(plan, { selectable = false } = {}) {
  const card = el(selectable ? 'button' : 'div', `saas-plan${choice.plan === plan.code ? ' is-active' : ''}`)
  if (selectable) card.type = 'button'
  const monthly = plan.prices.find((price) => price.cycle === 'monthly')
  card.append(
    el('strong', '', plan.name),
    el('span', 'saas-plan-price', plan.isTrial ? 'Grátis por 14 dias' : `${money(monthly?.amountCents)}/mês`),
    el('small', '', `Até ${plan.studentLimit} alunos`),
  )
  if (plan.description) card.append(el('small', 'saas-plan-desc', plan.description))
  return card
}

async function initSignup() {
  const form = document.querySelector('[data-trainer-signup]')
  if (!form) return
  const plansBox = form.querySelector('[data-signup-plans]')
  fetchSaasPlans()
    .then((plans) => {
      if (!plans?.length) return
      plansBox.replaceChildren(
        el('small', 'saas-plans-title', 'Depois do teste, escolha um plano (pode mudar quando quiser):'),
        (() => {
          const grid = el('div', 'saas-plan-grid')
          grid.append(...plans.filter((plan) => !plan.isTrial).map((plan) => planCard(plan)))
          return grid
        })(),
      )
    })
    .catch(() => {})
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    const status = form.querySelector('[role="status"]')
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    status.textContent = 'Criando sua conta…'
    try {
      await registerTrainerAccount(Object.fromEntries(new FormData(form)))
      sessionStorage.setItem('farisa-coach-session-v2', 'active')
      status.textContent = 'Conta criada! Abrindo seu painel…'
      location.replace('/personal/#painel')
      window.setTimeout(() => location.reload(), 50)
    } catch (error) {
      status.textContent = error.message
      button.disabled = false
    }
  })
}

// ---------- página "Minha assinatura"
function statusLine(state) {
  if (!state) return ['Plano', '']
  if (state.status === 'expired') return ['Vencida', `Venceu em ${day(state.expiresAt)}. Renove para voltar a editar.`]
  if (state.status === 'trial')
    return ['Teste grátis', `${state.daysLeft} dia(s) restante(s) · termina em ${day(state.expiresAt)}`]
  if (state.status === 'courtesy') return ['Ativa', 'Sem vencimento (cortesia da plataforma)']
  return ['Ativa', `Válida até ${day(state.expiresAt)}${state.daysLeft <= 7 ? ` · vence em ${state.daysLeft} dia(s)` : ''}`]
}

function checkoutBox(root) {
  const plans = billing.plans.filter((plan) => !plan.isTrial)
  const state = billing.state
  const section = el('section', 'panel saas-checkout')
  section.append(el('h2', '', state?.status === 'trial' || state?.status === 'expired' ? 'Escolha seu plano' : 'Renovar ou mudar de plano'))
  const grid = el('div', 'saas-plan-grid')
  plans.forEach((plan) => {
    const tooSmall = state && state.students > plan.studentLimit
    const card = planCard(plan, { selectable: true })
    if (state?.planCode === plan.code) card.append(el('em', 'saas-current', 'Seu plano'))
    if (tooSmall) {
      card.disabled = true
      card.append(el('small', 'saas-warn', `Você já tem ${state.students} alunos`))
    }
    card.addEventListener('click', () => {
      choice.plan = plan.code
      render()
    })
    grid.append(card)
  })
  section.append(grid)
  const plan = plans.find((item) => item.code === choice.plan)
  if (plan) {
    const cycles = el('div', 'saas-cycles')
    plan.prices.forEach((price) => {
      const chip = el('button', `saas-cycle${choice.cycle === price.cycle ? ' is-active' : ''}`)
      chip.type = 'button'
      chip.append(
        el('strong', '', price.label),
        el('span', '', money(price.amountCents)),
        el('small', '', price.cycle === 'monthly' ? 'por mês' : `${money(price.monthlyCents)}/mês${price.cycle === 'annual' ? ' · 2 meses grátis' : ' · 5% off'}`),
      )
      chip.addEventListener('click', () => {
        choice.cycle = price.cycle
        render()
      })
      cycles.append(chip)
    })
    const price = plan.prices.find((item) => item.cycle === choice.cycle)
    const actions = el('div', 'saas-pay-actions')
    const pix = el('button', 'button button--primary', `Pagar ${money(price.amountCents)} com Pix`)
    const card = el('button', 'button button--secondary', 'Pagar com cartão')
    pix.type = card.type = 'button'
    const result = el('div', 'saas-pay-result')
    const pay = async (method, button) => {
      button.disabled = true
      result.replaceChildren(el('p', 'support-muted', 'Preparando o pagamento seguro do Mercado Pago…'))
      try {
        const checkout = await startBillingCheckout({ planCode: plan.code, cycle: choice.cycle, method })
        if (checkout.checkoutUrl) {
          location.href = checkout.checkoutUrl
          return
        }
        const image = el('img', 'pix-qr-code')
        image.alt = 'QR Code PIX'
        image.src = checkout.qrCodeBase64
          ? `data:image/png;base64,${checkout.qrCodeBase64}`
          : await createQrCodeImage(checkout.qrCode)
        const copy = el('button', 'button button--secondary', 'Copiar código Pix')
        copy.type = 'button'
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(checkout.qrCode)
            copy.textContent = 'Código copiado'
          } catch {
            copy.textContent = 'Não foi possível copiar'
          }
        })
        result.replaceChildren(
          el('strong', '', `Pix de ${money(Number(checkout.amount) * 100)}`),
          el('p', 'support-muted', 'Pague pelo app do banco. A assinatura é liberada sozinha em até 1 minuto após a aprovação.'),
          image,
          copy,
        )
        startPolling()
      } catch (error) {
        result.replaceChildren(el('p', 'saas-warn', error.message))
      } finally {
        button.disabled = false
      }
    }
    pix.addEventListener('click', () => pay('pix', pix))
    card.addEventListener('click', () => pay('card', card))
    actions.append(pix, card)
    section.append(el('h3', '', 'Período'), cycles, actions, result)
  } else {
    section.append(el('p', 'support-muted', 'Toque em um plano para ver os períodos e pagar.'))
  }
  root.append(section)
}

let pollTimer = 0
function startPolling() {
  window.clearInterval(pollTimer)
  let tries = 0
  pollTimer = window.setInterval(async () => {
    tries += 1
    const before = billing?.state?.expiresAt
    await load()
    if (billing?.state?.expiresAt !== before) {
      window.clearInterval(pollTimer)
      showToast('Pagamento aprovado! Sua assinatura foi atualizada.')
    }
    if (tries > 40) window.clearInterval(pollTimer)
  }, 15000)
}

function render() {
  const root = document.querySelector('[data-billing-root]')
  if (!root || !billing) return
  const state = billing.state
  root.replaceChildren()
  const summary = el('section', `panel saas-summary saas-summary--${state?.status || 'active'}`)
  const [label, detail] = statusLine(state)
  const head = el('div', 'saas-summary-head')
  head.append(el('span', `saas-badge saas-badge--${state?.status || 'active'}`, label), el('strong', '', state?.planName || 'Plano'))
  summary.append(head, el('p', '', detail))
  if (state) {
    const usage = el('div', 'saas-usage')
    const bar = el('progress')
    bar.max = state.studentLimit || 1
    bar.value = Math.min(state.students, state.studentLimit || 0)
    usage.append(el('small', '', `${state.students} de ${state.studentLimit} alunos no plano`), bar)
    summary.append(usage)
  }
  root.append(summary)
  if (billing.pending?.length)
    root.append(el('p', 'support-muted', 'Há um pagamento em análise. Assim que o Mercado Pago aprovar, a assinatura é atualizada sozinha.'))
  checkoutBox(root)
  root.append(
    el(
      'p',
      'support-muted saas-legal',
      'Pagamento por período, sem renovação automática. Você pode cancelar em até 7 dias da contratação com reembolso (CDC, art. 49). Dúvidas: Falar com o suporte.',
    ),
  )
}

function paintAlerts() {
  const state = billing?.state
  const alert = document.querySelector('[data-billing-alert]')
  const soon = state && ['trial', 'active'].includes(state.status) && state.daysLeft !== null && state.daysLeft <= 5
  if (alert) alert.hidden = !(state?.status === 'expired' || soon)
  let bar = document.querySelector('[data-billing-banner]')
  if (state?.status === 'expired' || (state?.status === 'trial' && state.daysLeft <= 3)) {
    if (!bar) {
      bar = el('div', 'billing-banner')
      bar.dataset.billingBanner = ''
      document.querySelector('.main-content')?.prepend(bar)
    }
    bar.replaceChildren(
      el(
        'span',
        '',
        state.status === 'expired'
          ? '⚠ Sua assinatura venceu. O painel está só para consulta — seus alunos continuam com acesso.'
          : `⏳ Seu teste grátis termina em ${state.daysLeft} dia(s).`,
      ),
      (() => {
        const link = el('a', 'button button--primary', state.status === 'expired' ? 'Renovar agora' : 'Escolher plano')
        link.href = '#assinatura'
        return link
      })(),
    )
  } else bar?.remove()
  const capacity = document.querySelector('.sidebar .capacity small')
  if (capacity && state?.status === 'trial' && !capacity.textContent.includes('teste'))
    capacity.textContent += ` · teste: ${state.daysLeft} dia(s)`
}

async function load() {
  if (!sessionStorage.getItem('farisa-coach-api-token')) return
  try {
    billing = await fetchBilling()
  } catch {
    return
  }
  if (!choice.plan) {
    const current = billing.plans.find((plan) => plan.code === billing.state?.planCode && !plan.isTrial)
    choice.plan = current?.code || billing.plans.find((plan) => !plan.isTrial && plan.studentLimit >= (billing.state?.students || 0))?.code || null
  }
  paintAlerts()
  if (location.hash === '#assinatura') render()
}

export function initSaasBilling() {
  void initSignup()
  window.addEventListener('hashchange', () => {
    if (location.hash === '#assinatura') {
      if (billing) render()
      void load()
    }
  })
  let loaded = false
  window.addEventListener('farisa:data-changed', () => {
    if (!loaded) {
      loaded = true
      void load()
    } else paintAlerts()
  })
  void load()
}
