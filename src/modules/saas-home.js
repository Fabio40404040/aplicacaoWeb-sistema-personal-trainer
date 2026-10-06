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
  // Abre a conta de aluno de exemplo (o aluno de verdade entra pela página do personal dele).
  ['#demonstracao', 'Ver como aluno', 'student'],
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
    ...NAV.map(([href, label, demo]) => {
      const link = document.createElement('a')
      link.href = href
      link.textContent = label
      if (demo) link.dataset.demoLink = demo
      return link
    }),
  )
  mobile?.replaceChildren(
    ...NAV.map(([href, label, demo], index) => {
      const link = document.createElement('a')
      const number = document.createElement('span')
      link.href = href
      if (demo) link.dataset.demoLink = demo
      number.textContent = String(index + 1).padStart(2, '0')
      link.append(number, label)
      return link
    }),
  )
  // A tela de login do aluno continua no endereço direto (#entrar-aluno), com
  // o aviso de que o caminho certo é a página do personal.
  const login = document.querySelector('[data-student-form="login"]')
  if (login && !login.querySelector('.saas-student-note')) {
    const note = document.createElement('p')
    note.className = 'saas-student-note'
    note.textContent = 'É aluno? Entre pela página do seu personal: use o link que ele enviou para você.'
    login.querySelector('h1')?.after(note)
  }
  // Na vitrine não existe cadastro de aluno (é na página do personal).
  document.querySelectorAll('a[href^="#cadastro-aluno"]').forEach((link) => link.remove())
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
      email.href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(site.contact.email)}`
      email.target = '_blank'
      email.rel = 'noopener noreferrer'
      const label = email.querySelector('span')
      if (label) label.textContent = 'Gmail'
      email.hidden = false
    }
  } catch {
    /* sem conexão */
  }
}

function initDemoButtons() {
  const status = document.querySelector('[data-demo-status]')
  // Itens do menu que abrem a demonstração: mesmo efeito do botão da seção.
  document.querySelectorAll('[data-demo-link]').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelector(`[data-demo="${link.dataset.demoLink}"]`)?.click()
    })
  })
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
// e, quando a pessoa toca ou clica, espera 10 segundos e volta a girar.
function initCarousel() {
  const root = document.querySelector('[data-carousel]')
  const track = root?.querySelector('[data-carousel-track]')
  const dotsBox = root?.querySelector('[data-carousel-dots]')
  if (!track || !dotsBox) return
  const slides = [...track.children]
  // Cópia da primeira tela no fim: depois da última, segue em frente em vez de voltar.
  const clone = slides[0].cloneNode(true)
  clone.setAttribute('aria-hidden', 'true')
  track.append(clone)
  const stops = [...slides, clone]
  let current = 0
  // Depois de um toque ou clique, espera um pouco e volta a girar sozinho.
  let pausedUntil = 0
  const pause = () => {
    pausedUntil = Date.now() + 10000
  }
  const left = (index) => stops[index].offsetLeft - track.offsetLeft
  const go = (index, smooth = true) => {
    if (current === slides.length) {
      track.scrollTo({ left: 0, behavior: 'instant' })
      current = 0
      if (index > slides.length) index = 1
    }
    current = index < 0 ? slides.length - 1 : Math.min(index, slides.length)
    track.scrollTo({ left: left(current), behavior: smooth ? 'smooth' : 'instant' })
  }
  const dots = slides.map((slide, index) => {
    const dot = document.createElement('button')
    dot.type = 'button'
    dot.setAttribute('aria-label', `Mostrar: ${slide.querySelector('figcaption')?.textContent || `tela ${index + 1}`}`)
    dot.addEventListener('click', () => {
      pause()
      go(index)
    })
    dotsBox.append(dot)
    return dot
  })
  const paint = () => dots.forEach((dot, index) => dot.setAttribute('aria-current', String(index === current % slides.length)))
  // A posição real manda (o visitante pode arrastar com o dedo).
  let frame = 0
  let settle = 0
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth))
      if (index !== current && stops[index]) current = index
      paint()
    })
    // Parou na cópia: troca pela primeira de verdade, sem o visitante perceber.
    clearTimeout(settle)
    settle = setTimeout(() => {
      if (Math.round(track.scrollLeft / Math.max(1, track.clientWidth)) !== slides.length) return
      track.scrollTo({ left: 0, behavior: 'instant' })
      current = 0
    }, 250)
  })
  ;['pointerdown', 'touchstart', 'keydown'].forEach((type) => root.addEventListener(type, pause, { passive: true }))
  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') go(current + 1)
    if (event.key === 'ArrowLeft') go(current - 1)
  })
  paint()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  window.setInterval(() => {
    if (Date.now() < pausedUntil || document.visibilityState !== 'visible') return
    go(current + 1)
  }, 3500)
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
