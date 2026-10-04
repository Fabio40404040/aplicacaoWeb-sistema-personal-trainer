// Página principal = vitrine da plataforma para personais. O <head> marca
// html[data-home="saas"] antes de pintar; aqui a página do personal sai do
// DOM, o menu vira o da plataforma e os botões de demonstração funcionam.
import { leaveDemoToSignup } from './demo-invite.js'

const API_URL = String(import.meta.env.VITE_API_URL || '').replace(/\/$/u, '')
const DEMO_KEY = 'farisa-demo'
const isHome = () => document.documentElement.dataset.home === 'saas'

const money = (cents) => {
  const value = Number(cents) / 100
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })
}

const NAV = [
  ['#inicio', 'Início'],
  ['#demonstracao', 'Demonstração'],
  ['#recursos', 'Recursos'],
  ['#planos', 'Planos'],
  ['#entrar-aluno', 'Área do Aluno'],
  ['/personal/#acesso-farisa', 'Entrar'],
]

function buildHome() {
  const main = document.querySelector('[data-saas-main]')
  if (!main) return
  // A página do personal não existe aqui: sai do DOM para os endereços
  // (#inicio, #planos…) apontarem para as seções da vitrine.
  document.querySelector('.public-main')?.remove()
  main.querySelectorAll('[data-anchor]').forEach((section) => {
    section.id = section.dataset.anchor
  })
  const desktop = document.querySelector('.public-desktop-nav')
  const mobile = document.querySelector('[data-public-menu]')
  desktop?.replaceChildren(
    ...NAV.map(([href, label]) => {
      const link = document.createElement('a')
      link.href = href
      link.textContent = label
      return link
    }),
  )
  mobile?.replaceChildren(
    ...NAV.map(([href, label], index) => {
      const link = document.createElement('a')
      const number = document.createElement('span')
      link.href = href
      number.textContent = String(index + 1).padStart(2, '0')
      link.append(number, label)
      return link
    }),
  )
  document.querySelectorAll('[data-public-screen] .brand-name').forEach((node) => {
    node.textContent = 'Plataforma'
  })
  const footer = document.querySelector('.public-footer p')
  if (footer?.firstChild?.nodeType === Node.TEXT_NODE)
    footer.firstChild.textContent = `© ${new Date().getFullYear()} FARISA · `
  document.querySelectorAll('[data-whatsapp-float]').forEach((link) => {
    link.hidden = true
  })
  document.title = 'FARISA — site e app para personal trainers'
  // Chegou com #planos etc. antes de as seções terem id: rola até lá.
  if (location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView()
}

async function fillPlans() {
  try {
    const plans = await (await fetch(`${API_URL}/api/public/saas-plans`)).json()
    const free = plans.find((plan) => plan.isFree)
    const paid = plans.find((plan) => !plan.isFree)
    const limit = (plan) => (Number(plan?.studentLimit) ? `Até ${plan.studentLimit} alunos` : 'Alunos ilimitados')
    if (free) document.querySelector('[data-saas-free-limit]').textContent = limit(free)
    if (paid) {
      document.querySelector('[data-saas-paid-limit]').textContent = limit(paid)
      document.querySelector('[data-saas-paid-price]').textContent = money(paid.priceCents)
    }
  } catch {
    /* sem conexão: ficam os textos padrão */
  }
}

// Contato da plataforma = o que o dono preencheu em "Meu site".
async function fillContact() {
  try {
    const site = await (await fetch(`${API_URL}/api/public/site`)).json()
    const whatsapp = document.querySelector('[data-saas-whatsapp]')
    const email = document.querySelector('[data-saas-email]')
    if (site.contact?.whatsapp && whatsapp) {
      whatsapp.href = `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent('Olá! Sou personal e quero saber mais sobre a FARISA.')}`
      whatsapp.hidden = false
    }
    if (site.contact?.email && email) {
      email.href = `mailto:${site.contact.email}`
      email.hidden = false
    }
  } catch {
    /* sem conexão */
  }
}

function initDemoButtons() {
  const status = document.querySelector('[data-demo-status]')
  document.querySelectorAll('[data-demo]').forEach((button) => {
    button.addEventListener('click', async () => {
      const kind = button.dataset.demo
      button.disabled = true
      status.textContent = 'Abrindo a demonstração…'
      try {
        const response = await fetch(`${API_URL}/api/public/demo/${kind}`, { method: 'POST' })
        const data = await response.json()
        if (!response.ok || !data.token) throw new Error(data.error || 'Não foi possível abrir a demonstração.')
        sessionStorage.setItem(DEMO_KEY, kind)
        if (kind === 'trainer') {
          sessionStorage.removeItem('farisa-coach-data-v1')
          sessionStorage.setItem('farisa-coach-api-token', data.token)
          sessionStorage.setItem('farisa-coach-session-v2', 'active')
          location.href = '/personal/#painel'
        } else {
          sessionStorage.setItem('farisa-student-token', data.token)
          location.href = '/p/demo#painel-aluno'
        }
      } catch (error) {
        status.textContent = error.message
        button.disabled = false
      }
    })
  })
}

// Faixa fixa enquanto o visitante está numa conta de demonstração.
function demoBanner() {
  const kind = sessionStorage.getItem(DEMO_KEY)
  const active =
    (kind === 'trainer' && sessionStorage.getItem('farisa-coach-api-token')) ||
    (kind === 'student' && sessionStorage.getItem('farisa-student-token'))
  if (!active) {
    if (kind) sessionStorage.removeItem(DEMO_KEY)
    return
  }
  const bar = document.createElement('div')
  bar.className = 'demo-banner'
  const text = document.createElement('span')
  text.textContent = 'Demonstração · nada é salvo'
  const link = document.createElement('a')
  link.href = '/personal/#ativar-personal'
  link.textContent = 'Criar minha conta grátis'
  link.addEventListener('click', (event) => {
    event.preventDefault()
    leaveDemoToSignup() // sai da demonstração antes de ir para o cadastro
  })
  bar.append(text, link)
  document.body.append(bar)
}

// Carrossel do topo: página do personal → painel → app do aluno. Troca devagar
// e para quando a pessoa toca, passa o mouse ou usa o teclado.
function initCarousel() {
  const root = document.querySelector('[data-carousel]')
  const track = root?.querySelector('[data-carousel-track]')
  const dotsBox = root?.querySelector('[data-carousel-dots]')
  if (!track || !dotsBox) return
  const slides = [...track.children]
  let current = 0
  let paused = false
  const go = (index, smooth = true) => {
    current = (index + slides.length) % slides.length
    track.scrollTo({ left: slides[current].offsetLeft - track.offsetLeft, behavior: smooth ? 'smooth' : 'auto' })
  }
  const dots = slides.map((slide, index) => {
    const dot = document.createElement('button')
    dot.type = 'button'
    dot.setAttribute('aria-label', `Mostrar: ${slide.querySelector('figcaption')?.textContent || `tela ${index + 1}`}`)
    dot.addEventListener('click', () => {
      paused = true
      go(index)
    })
    dotsBox.append(dot)
    return dot
  })
  const paint = () => dots.forEach((dot, index) => dot.setAttribute('aria-current', String(index === current)))
  // A posição real manda (o visitante pode arrastar com o dedo).
  let frame = 0
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth))
      if (index !== current && slides[index]) current = index
      paint()
    })
  })
  ;['pointerdown', 'keydown', 'focusin'].forEach((type) =>
    root.addEventListener(type, () => {
      paused = true
    }),
  )
  let hovering = false
  root.addEventListener('mouseenter', () => (hovering = true))
  root.addEventListener('mouseleave', () => (hovering = false))
  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') go(current + 1)
    if (event.key === 'ArrowLeft') go(current - 1)
  })
  paint()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  window.setInterval(() => {
    if (paused || hovering || document.visibilityState !== 'visible') return
    go(current + 1)
  }, 5000)
}

export function initSaasHome() {
  demoBanner()
  if (!isHome()) return
  buildHome()
  initCarousel()
  initDemoButtons()
  void fillPlans()
  void fillContact()
}
