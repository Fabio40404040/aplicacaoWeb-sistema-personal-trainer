// Ícone do app "FARISA Painel" na cor que o personal escolheu em Meu site
// (no Grátis, azul). Só no Painel (/personal/) e só com o personal conectado:
// o site principal FARISA continua azul e o app do aluno tem o seu próprio.
import { fetchSiteSettings } from './api-client.js'

const COLORS = ['blue', 'green', 'teal', 'purple', 'pink', 'red', 'orange', 'gold']
const EVERY_MS = 5 * 60_000
let lastCheck = 0
const COLOR_KEY = 'farisa-painel-cor'
// Começa com a cor que o <head> já usou (não troca o manifesto à toa: trocar
// a cada abertura fazia o app instalado mostrar "Atualização disponível").
let current = (() => {
  try {
    const saved = localStorage.getItem(COLOR_KEY) || 'blue'
    return COLORS.includes(saved) ? saved : 'blue'
  } catch {
    return 'blue'
  }
})()

function setIcon(color) {
  if (color === current) return
  current = color
  try {
    localStorage.setItem(COLOR_KEY, color)
  } catch {
    /* sem armazenamento */
  }
  const set = (selector, attr, value) => document.querySelector(selector)?.setAttribute(attr, value)
  set('link[rel="apple-touch-icon"]', 'href', `/icons/painel-${color}-apple-touch-icon.png?v=3`)
  set('link[rel="icon"]', 'href', `/icons/painel-${color}-192.png?v=3`)
  set('link[rel="manifest"]', 'href', `/painel-${color}.webmanifest`)
}

async function refresh(force = false) {
  if (document.documentElement.dataset.surface !== 'painel') return
  // Sem ninguém conectado: mantém a cor atual (não volta para azul e depois troca de novo).
  if (!sessionStorage.getItem('farisa-coach-api-token')) return
  if (!force && Date.now() - lastCheck < EVERY_MS) return
  lastCheck = Date.now()
  try {
    const site = await fetchSiteSettings()
    setIcon(!site?.brandLocked && COLORS.includes(site?.accent) ? site.accent : 'blue')
  } catch {
    /* sem conexão: fica como está */
  }
}

export function initPanelIcon() {
  if (document.documentElement.dataset.surface !== 'painel') return
  // Ícones da cor salva desde o início (o manifesto o <head> já pôs).
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', `/icons/painel-${current}-apple-touch-icon.png?v=3`)
  document.querySelector('link[rel="icon"]')?.setAttribute('href', `/icons/painel-${current}-192.png?v=3`)
  void refresh(true)
  let first = true
  window.addEventListener('farisa:data-changed', () => {
    void refresh(first)
    first = false
  })
  // Salvou a cor em Meu site, ou o painel se atualizou sozinho.
  window.addEventListener('farisa:billing-refresh', () => void refresh())
  window.addEventListener('farisa:site-saved', () => void refresh(true))
  window.addEventListener('hashchange', () => {
    if (location.hash === '#meu-site' || location.hash === '#acesso-farisa') void refresh(true)
  })
}
