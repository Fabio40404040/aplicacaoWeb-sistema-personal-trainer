// Painel do personal se atualiza sozinho: ao voltar para a aba/app, ao
// reconectar e a cada 30 s com a aba à vista. Só redesenha se algo mudou e se
// o personal não está digitando nem com uma janela aberta (não perde nada).
import { accountRequest } from './api-client.js'
import { getData, replaceData } from './state.js'

const EVERY_MS = 30_000
const MIN_GAP_MS = 4_000
let lastRun = 0
let lastRemote = ''
let running = false

function busy() {
  if (document.querySelector('dialog[open]')) return true
  const active = document.activeElement
  if (!active || active === document.body) return false
  if (active.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) && Boolean(active.closest('form, dialog'))
}

async function refresh(force = false) {
  if (running || document.hidden || !sessionStorage.getItem('farisa-coach-api-token')) return
  if (!force && Date.now() - lastRun < MIN_GAP_MS) return
  if (busy()) return
  running = true
  lastRun = Date.now()
  try {
    const remote = await accountRequest('/dashboard')
    const signature = JSON.stringify(remote)
    if (signature !== lastRemote && !busy()) {
      lastRemote = signature
      replaceData({ ...getData(), ...remote })
    }
    // Faixas (e-mail, plano), primeiros passos e sininho.
    window.dispatchEvent(new Event('farisa:billing-refresh'))
  } catch {
    /* sem conexão: tenta de novo depois */
  } finally {
    running = false
  }
}

export function initPanelRefresh() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh(true)
  })
  window.addEventListener('focus', () => void refresh())
  window.addEventListener('online', () => void refresh(true))
  window.setInterval(() => void refresh(), EVERY_MS)
}
