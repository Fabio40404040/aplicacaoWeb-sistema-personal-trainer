// Planos da plataforma para o personal: cadastro no plano Grátis (tela
// "Criar conta"), página "Minha assinatura" e avisos de vencimento.
import {
  fetchBilling,
  fetchBillingCardConfig,
  payBillingCard,
  fetchSaasPlans,
  registerTrainerAccount,
  startBillingCheckout,
} from './api-client.js'
import { openSecureCardForm } from './mercado-pago-card.js'
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
const limitText = (limit) => (Number(limit) ? `Até ${limit} alunos` : 'Alunos ilimitados')

// ---------- cadastro
function planCard(plan, { selectable = false } = {}) {
  const card = el(selectable ? 'button' : 'div', `saas-plan${choice.plan === plan.code ? ' is-active' : ''}`)
  if (selectable) card.type = 'button'
  const monthly = plan.prices.find((price) => price.cycle === 'monthly')
  card.append(
    el('strong', '', plan.name),
    el('span', 'saas-plan-price', plan.isFree ? 'Grátis para sempre' : `${money(monthly?.amountCents)}/mês`),
    el('small', '', limitText(plan.studentLimit)),
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
        el('small', 'saas-plans-title', 'Você começa no Grátis e pode passar para o Ilimitado quando quiser:'),
        (() => {
          const grid = el('div', 'saas-plan-grid')
          grid.append(...plans.map((plan) => planCard(plan)))
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
  if (state.status === 'free')
    return ['Grátis', state.studentLimit ? `Sem vencimento · até ${state.studentLimit} alunos` : 'Sem vencimento · alunos ilimitados']
  if (state.status === 'courtesy') return ['Ativa', 'Sem vencimento (cortesia da plataforma)']
  return [
    'Ativa',
    `Válida até ${day(state.expiresAt)}${state.daysLeft <= 7 ? ` · vence em ${state.daysLeft} dia(s). Sem renovação, a conta volta para o Grátis.` : ''}`,
  ]
}

function checkoutBox(root) {
  const plans = billing.plans.filter((plan) => !plan.isFree)
  if (!plans.length) return
  const state = billing.state
  const section = el('section', 'panel saas-checkout')
  section.append(el('h2', '', state?.status === 'free' ? 'Passar para o Ilimitado' : 'Renovar o plano'))
  const grid = el('div', 'saas-plan-grid')
  plans.forEach((plan) => {
    const card = planCard(plan, { selectable: true })
    if (state?.planCode === plan.code) card.append(el('em', 'saas-current', 'Seu plano'))
    card.addEventListener('click', () => {
      choice.plan = plan.code
      render()
    })
    grid.append(card)
  })
  section.append(grid)
  const plan = plans.find((item) => item.code === choice.plan)
  if (plan) {
    const price = plan.prices.find((item) => item.cycle === choice.cycle) || plan.prices[0]
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
    // Cartão: formulário seguro dentro do site (o mesmo do aluno).
    card.addEventListener('click', async () => {
      card.disabled = true
      result.replaceChildren(el('p', 'support-muted', 'Abrindo o formulário seguro do cartão…'))
      try {
        await openSecureCardForm(
          (path, body) =>
            path === 'payments/card-config'
              ? fetchBillingCardConfig(plan.code)
              : payBillingCard({ ...body, planCode: plan.code }),
          {
            onApproved: () => {
              showToast('Pagamento aprovado. Assinatura atualizada.')
              void load()
            },
          },
        )
        result.replaceChildren()
      } catch (error) {
        result.replaceChildren(el('p', 'saas-warn', error.message))
      } finally {
        card.disabled = false
      }
    })
    actions.append(pix, card)
    section.append(el('p', 'support-muted', 'Cada pagamento libera 1 mês. Renovar antes de vencer soma o mês ao prazo atual.'), actions, result)
  }
  root.append(section)
}

let pollTimer = 0
function startPolling() {
  window.clearInterval(pollTimer)
  let tries = 0
  pollTimer = window.setInterval(async () => {
    tries += 1
    const before = `${billing?.state?.planCode}|${billing?.state?.expiresAt}`
    await load()
    if (`${billing?.state?.planCode}|${billing?.state?.expiresAt}` !== before) {
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
    if (state.studentLimit) {
      bar.max = state.studentLimit
      bar.value = Math.min(state.students, state.studentLimit)
      usage.append(el('small', '', `${state.students} de ${state.studentLimit} alunos no plano`), bar)
    } else usage.append(el('small', '', `${state.students} aluno(s) · sem limite`))
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
      'Pagamento mensal, sem renovação automática. Se não renovar, a conta volta para o plano Grátis e nada é apagado. Você pode cancelar em até 7 dias da contratação com reembolso (CDC, art. 49). Dúvidas: Falar com o suporte.',
    ),
  )
}

function paintAlerts() {
  const state = billing?.state
  const soon = state?.status === 'active' && state.daysLeft !== null && state.daysLeft <= 5
  const alert = document.querySelector('[data-billing-alert]')
  if (alert) alert.hidden = !soon
  let bar = document.querySelector('[data-billing-banner]')
  if (soon) {
    if (!bar) {
      bar = el('div', 'billing-banner')
      bar.dataset.billingBanner = ''
      document.querySelector('.main-content')?.prepend(bar)
    }
    const link = el('a', 'button button--primary', 'Renovar agora')
    link.href = '#assinatura'
    bar.replaceChildren(
      el('span', '', `⏳ Seu plano ${state.planName} vence em ${state.daysLeft} dia(s). Depois disso a conta volta para o Grátis.`),
      link,
    )
  } else bar?.remove()
}

async function load() {
  if (!sessionStorage.getItem('farisa-coach-api-token')) return
  try {
    billing = await fetchBilling()
  } catch {
    return
  }
  if (!choice.plan) {
    choice.plan = billing.plans.find((plan) => !plan.isFree)?.code || null
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
