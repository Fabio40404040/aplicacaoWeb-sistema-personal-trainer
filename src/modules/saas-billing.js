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
import { accountCard, paintEmailBanner, paintOnboarding, storageLine } from './account-extras.js'
import { openSecureCardForm } from './mercado-pago-card.js'
import { createQrCodeImage } from './pix.js'
import { showPaidDialog } from './paid-dialog.js'

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
  const yearly = plan.prices.find((price) => price.cycle === 'yearly')
  card.append(
    el('strong', '', plan.name),
    el(
      'span',
      'saas-plan-price',
      plan.isFree
        ? 'Grátis para sempre'
        : selectable
          ? `${money(monthly?.amountCents)}/mês`
          : `Grátis por 30 dias · depois ${money(monthly?.amountCents)}/mês`,
    ),
    el('small', '', limitText(plan.studentLimit)),
  )
  if (yearly?.discount && !selectable)
    card.append(el('small', 'saas-plan-annual', `ou ${money(yearly.amountCents)}/ano (${yearly.discount}% de desconto)`))
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
        el('small', 'saas-plans-title', 'Você começa com 30 dias do Ilimitado grátis. Depois escolhe: seguir no Grátis ou assinar.'),
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
  if (state.status === 'free' && state.inTrial)
    return [
      'Teste completo',
      `Todas as ferramentas liberadas por mais ${state.trialDaysLeft} dia(s), até ${day(state.trialEndsAt)}. Depois a conta segue no Grátis, com as ferramentas básicas${state.studentLimit ? ` e até ${state.studentLimit} alunos` : ''}.`,
    ]
  if (state.status === 'free')
    return ['Grátis', state.studentLimit ? `Sem vencimento · até ${state.studentLimit} alunos` : 'Sem vencimento · alunos ilimitados']
  if (state.status === 'courtesy') return ['Ativa', 'Sem vencimento (cortesia da plataforma)']
  return [
    state.cycle === 'yearly' ? 'Ativa · anual' : 'Ativa',
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
    // Período: mensal ou anual com desconto.
    const cycles = el('div', 'saas-cycles')
    cycles.setAttribute('role', 'radiogroup')
    cycles.setAttribute('aria-label', 'Período da assinatura')
    plan.prices.forEach((option) => {
      const button = el('button', `saas-cycle${option.cycle === choice.cycle ? ' is-active' : ''}`)
      button.type = 'button'
      button.setAttribute('role', 'radio')
      button.setAttribute('aria-checked', String(option.cycle === choice.cycle))
      const full = plan.prices.find((item) => item.cycle === 'monthly')
      button.append(
        el('strong', '', option.cycle === 'yearly' ? 'Anual' : 'Mensal'),
        el('span', '', option.cycle === 'yearly' ? `${money(option.amountCents)}/ano` : `${money(option.amountCents)}/mês`),
      )
      if (option.cycle === 'yearly') {
        button.append(el('small', '', `equivale a ${money(option.monthlyCents)}/mês`))
        if (option.discount && full)
          button.append(
            el('em', 'saas-cycle-save', `${option.discount}% off · economize ${money(full.amountCents * 12 - option.amountCents)}`),
          )
      }
      button.addEventListener('click', () => {
        choice.cycle = option.cycle
        render()
      })
      cycles.append(button)
    })
    if (plan.prices.length > 1) section.append(cycles)
    const price = plan.prices.find((item) => item.cycle === choice.cycle) || plan.prices[0]
    const actions = el('div', 'saas-pay-actions')
    const pix = el('button', 'button button--primary', `Pagar ${money(price.amountCents)} com Pix`)
    const card = el('button', 'button button--secondary', `Pagar ${money(price.amountCents)} com cartão`)
    pix.type = card.type = 'button'
    const result = el('div', 'saas-pay-result')
    const pay = async (method, button) => {
      button.disabled = true
      result.replaceChildren(el('p', 'support-muted', 'Preparando o pagamento seguro do Mercado Pago…'))
      try {
        const checkout = await startBillingCheckout({ planCode: plan.code, cycle: price.cycle, method })
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
              ? fetchBillingCardConfig(plan.code, price.cycle)
              : payBillingCard({ ...body, planCode: plan.code, cycle: price.cycle }),
          {
            onApproved: async () => {
              await load()
              subscriptionPaid()
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
        const period = price.cycle === 'yearly' ? '12 meses' : '1 mês'
    section.append(
      el('p', 'support-muted', `Este pagamento libera ${period}. Renovar antes de vencer soma o período ao prazo atual.`),
      actions,
      result,
    )
  }
  root.append(section)
}

// Assinatura paga: janela com o carimbo "PAGO".
function subscriptionPaid() {
  const state = billing?.state || {}
  showPaidDialog({
    title: 'Assinatura confirmada!',
    text: `${state.planName ? `Plano ${state.planName}` : 'Seu plano'}${state.expiresAt ? ` ativo até ${day(state.expiresAt)}` : ' ativo'}. Obrigado por usar a FARISA!`,
    button: 'Continuar',
  })
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
      subscriptionPaid()
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
    if (state.heldSeats)
      usage.append(
        el(
          'small',
          '',
          `Inclui ${state.heldSeats} vaga(s) em espera: no Grátis, a vaga de um aluno apagado volta a ficar livre depois de 30 dias. No Ilimitado libera na hora.`,
        ),
      )
    const storage = storageLine(billing.storage)
    if (storage) summary.append(storage)
  }
  root.append(summary)
  // O que fica só no Ilimitado (aparece durante o teste e depois dele).
  if (state?.status === 'free' && (state.inTrial || state.lockedTools?.length)) {
    const tools = el('section', 'panel saas-locked')
    tools.append(
      el('h2', '', state.inTrial ? 'Depois do teste, ficam só no Ilimitado' : '🔒 Ferramentas do plano Ilimitado'),
      el(
        'p',
        'support-muted',
        state.inTrial
          ? 'Você está usando tudo. Ao fim dos 30 dias, estas ferramentas pausam e nada é apagado.'
          : 'Estas ferramentas estão pausadas no Grátis. Nada foi apagado: ao assinar, tudo volta como estava.',
      ),
    )
    const list = el('ul', 'saas-locked-list')
    ;(state.lockedTools?.length
      ? state.lockedTools
      : [
          'Pagamento automático pelo site (cartão e Pix do Mercado Pago)',
          'Sua marca e sua cor na página',
          'Relatório de avaliação em PDF',
          'Agendamento feito pelo aluno',
          'Check-in semanal',
          'Envio de vídeos próprios',
        ]
    ).forEach((tool) => list.append(el('li', '', tool)))
    tools.append(list)
    root.append(tools)
  }
  if (billing.pending?.length)
    root.append(el('p', 'support-muted', 'Há um pagamento em análise. Assim que o Mercado Pago aprovar, a assinatura é atualizada sozinha.'))
  checkoutBox(root)
  root.append(
    el(
      'p',
      'support-muted saas-legal',
      'Pagamento mensal ou anual, sem renovação automática. Se não renovar, a conta volta para o plano Grátis e nada é apagado. Você pode cancelar em até 7 dias da contratação com reembolso (CDC, art. 49). Dúvidas: Falar com o suporte.',
    ),
    accountCard(),
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
  // O sininho usa isto para avisar quando um aluno ficou sem vaga.
  window.farisaBilling = billing
  window.dispatchEvent(new Event('farisa:billing-loaded'))
  paintAlerts()
  paintEmailBanner(billing.email)
  void paintOnboarding()
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
