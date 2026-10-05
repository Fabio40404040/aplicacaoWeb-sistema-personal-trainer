// Página de cada personal. A estrutura do site é uma só; aqui entram a marca,
// a cor, o banner, o contato e os preços do personal dono do endereço:
//   /            → site do dono
//   /p/<slug>    → página de um personal (o cadastro do aluno cai para ele)
import { setWhatsappContact } from './whatsapp.js'

const API_URL = String(import.meta.env.VITE_API_URL || '').replace(/\/$/u, '')
const SLUG_KEY = 'farisa-site-slug'

export const ACCENTS = {
  blue: { label: 'Azul', main: '#3d8bfd', light: '#77b5ff', dark: '#1c67db' },
  green: { label: 'Verde', main: '#16a34a', light: '#4ade80', dark: '#15803d' },
  teal: { label: 'Turquesa', main: '#0d9488', light: '#2dd4bf', dark: '#0f766e' },
  purple: { label: 'Roxo', main: '#7c3aed', light: '#a78bfa', dark: '#6d28d9' },
  pink: { label: 'Rosa', main: '#db2777', light: '#f472b6', dark: '#be185d' },
  red: { label: 'Vermelho', main: '#dc2626', light: '#f87171', dark: '#b91c1c' },
  orange: { label: 'Laranja', main: '#ea580c', light: '#fb923c', dark: '#c2410c' },
  gold: { label: 'Dourado', main: '#ca8a04', light: '#facc15', dark: '#a16207' },
}

// Endereço da página atual: "" no site principal.
export function currentSiteSlug() {
  const match = location.pathname.match(/^\/p\/([a-z0-9-]{3,30})\/?$/iu)
  return match ? match[1].toLowerCase() : ''
}

const money = (cents) => {
  const value = Number(cents) / 100
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })
}
const rgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)).join(', ')

export function applyAccent(name, root = document.documentElement) {
  const accent = ACCENTS[name]
  if (!accent || name === 'blue') {
    root.removeAttribute('data-accent')
    return
  }
  root.dataset.accent = name
  root.style.setProperty('--accent', accent.main)
  root.style.setProperty('--accent-light', accent.light)
  root.style.setProperty('--accent-dark', accent.dark)
  root.style.setProperty('--accent-rgb', rgb(accent.main))
}

function setText(selector, text) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = text
  })
}

function applyBrand(site) {
  const mark = site.brandMark || (site.isOwner ? 'FARISA' : (site.trainerName || 'Personal').split(/\s+/u)[0].slice(0, 14))
  const name = site.brandName || 'Personal'
  // Só o site público e as telas do aluno; o painel do personal continua FARISA.
  document
    .querySelectorAll('[data-public-screen] .brand-mark, [data-student-screen] .brand-mark, .student-access-shell .brand-mark')
    .forEach((node) => {
      node.textContent = mark
    })
  setText('[data-public-screen] .brand-name', name)
  setText('.public-hero .public-kicker', `${mark} ${name}`)
  const footer = document.querySelector('.public-footer p')
  if (footer?.firstChild?.nodeType === Node.TEXT_NODE)
    footer.firstChild.textContent = `© ${new Date().getFullYear()} ${mark} ${name} · `
  document.title = `${mark} ${name}`
  document.querySelector('.public-brand')?.setAttribute('aria-label', `${mark} ${name} — início`)
  // Nome do app instalado no iPhone e no aviso de instalação.
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', mark)
  const installTitle = document.querySelector('[data-install-title]')
  if (installTitle) installTitle.textContent = `Adicionar ${mark} ${name} à tela inicial`
  return `${mark} ${name}`
}

function applyHero(site) {
  const screen = document.querySelector('[data-public-screen]')
  if (!screen) return
  // As fotos de evolução do topo são do dono; nas outras páginas ficam ocultas.
  screen.classList.toggle('is-trainer-page', !site.isOwner)
  const hero = site.hero || {}
  // Fundo: o escolhido em "Meu site"; páginas de outros personais sem escolha
  // usam o fundo 1 (a foto padrão do site principal é do dono).
  const background = hero.url || (site.isOwner ? null : '/banners/banner-1.webp')
  if (background) {
    screen.style.setProperty('--hero-bg', `url("${background}")`)
    screen.classList.add('has-hero-bg')
  }
  // Foto do personal (fundo transparente) por cima do fundo. Sem foto própria,
  // só o dono mantém a foto padrão — e nem ele, se usa uma foto como fundo inteiro.
  if (hero.cutoutUrl) screen.style.setProperty('--hero-cutout', `url("${hero.cutoutUrl}")`)
  else if (!site.isOwner || hero.kind === 'upload') screen.style.setProperty('--hero-cutout', 'none')
  screen.classList.toggle('has-hero-cutout', Boolean(hero.cutoutUrl) || !site.isOwner || hero.kind === 'upload')
}

let sitePlans = null
export const currentSitePlans = () => sitePlans

function applyPlans(site) {
  const plans = new Map((site.plans || []).map((plan) => [plan.code, plan]))
  document.querySelectorAll('a[href^="#cadastro-aluno?plan="]').forEach((link) => {
    const code = new URLSearchParams(link.getAttribute('href').split('?')[1]).get('plan')
    const card = link.closest('.plan-card')
    const plan = plans.get(code)
    if (!card) return
    card.hidden = !plan
    const price = card.querySelector('.plan-price strong')
    if (plan && price) price.textContent = money(plan.priceCents)
  })
  document.querySelectorAll('select[name="planCode"] option').forEach((option) => {
    if (!option.value) return
    const plan = plans.get(option.value)
    option.hidden = option.disabled = !plan
  })
  document.querySelectorAll('select[name="planCode"]').forEach((select) => {
    if (select.selectedOptions[0]?.disabled) select.value = [...select.options].find((option) => !option.disabled)?.value || ''
  })
  // O pré-cadastro (plano e período) usa os mesmos preços dos cartões.
  sitePlans = site.plans || []
  window.dispatchEvent(new CustomEvent('farisa:site-plans', { detail: sitePlans }))
}

function applyContact(site, brand) {
  const contact = site.contact || {}
  const configured = Object.values(contact).some(Boolean)
  if (!configured && site.isOwner) return // site principal ainda sem "Meu site" preenchido
  const details = document.querySelector('.contact-details')
  if (details) {
    const line = (label, value) => {
      const span = document.createElement('span')
      const strong = document.createElement('strong')
      strong.textContent = label
      span.append(strong, value)
      return span
    }
    const phone = contact.whatsapp
      ? contact.whatsapp.replace(/^55(\d{2})(\d{4,5})(\d{4})$/u, '($1) $2-$3')
      : ''
    details.replaceChildren(
      ...[
        contact.address && line('Endereço', contact.address),
        contact.email && line('E-mail', contact.email),
        phone && line('Celular', phone),
      ].filter(Boolean),
    )
  }
  document.querySelector('.contact-demo-note')?.remove()
  const links = {
    'Falar pelo WhatsApp': contact.whatsapp && `https://wa.me/${contact.whatsapp}`,
    'Abrir Instagram': contact.instagram && `https://instagram.com/${contact.instagram}`,
    'Abrir Facebook': contact.facebook && `https://www.facebook.com/${contact.facebook}`,
    'Abrir TikTok': contact.tiktok && `https://www.tiktok.com/@${contact.tiktok}`,
  }
  document.querySelectorAll('.public-main .contact-links a').forEach((link) => {
    const label = link.getAttribute('aria-label') || ''
    if (label in links) {
      link.hidden = !links[label]
      if (links[label]) link.href = links[label]
    } else {
      // E-mail
      link.hidden = !contact.email
      if (contact.email) {
        // Abre o Gmail já com o destinatário preenchido.
        link.href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contact.email)}`
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.setAttribute('aria-label', 'Enviar e-mail pelo Gmail (abre em nova aba)')
        const text = link.querySelector('span')
        if (text) text.textContent = 'Gmail'
      }
    }
  })
  document.querySelectorAll('[data-whatsapp-float]').forEach((link) => {
    link.hidden = !contact.whatsapp
  })
  if (contact.whatsapp) setWhatsappContact({ number: contact.whatsapp, brand })
}

// Selo "Feito com FARISA" (páginas do plano Grátis): leva à vitrine da plataforma.
function applyBadge(site) {
  if (!site.badge || document.querySelector('.farisa-badge')) return
  const badge = document.createElement('a')
  badge.className = 'farisa-badge'
  badge.href = '/'
  badge.target = '_blank'
  badge.rel = 'noopener'
  badge.textContent = 'Feito com FARISA · crie a sua página grátis'
  document.querySelector('.public-footer')?.append(badge)
}

export function applySite(site) {
  applyBadge(site)
  applyAccent(site.accent)
  const brand = applyBrand(site)
  applyHero(site)
  applyPlans(site)
  applyContact(site, brand)
}

export async function initSiteBrand() {
  // O painel do personal e o admin não usam a marca da página.
  if (document.documentElement.dataset.surface === 'painel') return
  const slug = currentSiteSlug()
  // A página principal é a vitrine da plataforma (saas-home.js), não a de um personal.
  if (!slug && document.documentElement.dataset.home === 'saas') return
  try {
    if (slug) sessionStorage.setItem(SLUG_KEY, slug)
    else sessionStorage.removeItem(SLUG_KEY)
  } catch {
    /* navegação privada */
  }
  try {
    const response = await fetch(`${API_URL}/api/public/site${slug ? `/${slug}` : ''}`)
    if (response.status === 404 && slug) {
      location.replace('/') // endereço que não existe: volta ao site principal
      return
    }
    if (!response.ok) return
    applySite(await response.json())
  } catch {
    /* sem conexão: fica o site padrão */
  } finally {
    document.documentElement.removeAttribute('data-site-loading')
  }
}
