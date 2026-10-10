// Erros que acontecem na tela de quem usa (aluno, personal, admin) vão para
// Admin → Registro de ações → Erros do sistema, com a página e o aparelho.
// Assim um problema aparece mesmo que ninguém avise.
const API_URL = import.meta.env.VITE_API_URL || ''
const sent = new Set()
let count = 0

// Ruído que não é defeito do site: extensões do navegador, internet caindo,
// pedidos cancelados, aviso do ResizeObserver, scripts de outros sites.
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|Load failed|NetworkError|network error|Não foi possível conectar/i,
  /AbortError|The operation was aborted|signal is aborted/i,
  /Sua sessão expirou|Sessão inválida/i,
]
const FOREIGN = /^(chrome|moz|safari|safari-web)-extension:|^webkit-masked-url:/i

function area() {
  const path = location.pathname
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/personal')) return 'personal'
  if (location.hash.startsWith('#painel-aluno') || path.startsWith('/p/')) return 'aluno'
  return 'site'
}

function device() {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua)
    ? `iOS ${(ua.match(/OS (\d+[_\d]*)/) || [])[1]?.replace(/_/g, '.') || ''}`
    : /Android/.test(ua)
      ? `Android ${(ua.match(/Android (\d+[.\d]*)/) || [])[1] || ''}`
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'outro'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /CriOS|Chrome\//.test(ua)
      ? 'Chrome'
      : /FxiOS|Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'navegador'
  const app = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone ? ' · app instalado' : ''
  return `${os.trim()} · ${browser} · ${window.innerWidth}×${window.innerHeight}${app}`
}

function report(message, source = '', line = 0, stack = '') {
  const text = String(message || '').slice(0, 200)
  if (!text || IGNORE.some((pattern) => pattern.test(text))) return
  if (FOREIGN.test(String(source)) || FOREIGN.test(String(stack))) return
  const key = `${text}|${source}|${line}`
  if (sent.has(key) || count >= 5) return
  sent.add(key)
  count += 1
  let token
  try {
    token =
      sessionStorage.getItem('farisa-student-token') ||
      sessionStorage.getItem('farisa-coach-api-token') ||
      sessionStorage.getItem('farisa-admin-token') ||
      ''
  } catch {
    token = ''
  }
  const body = JSON.stringify({
    message: text,
    source: String(source || '').replace(location.origin, '').slice(0, 160),
    line,
    stack: String(stack || '').replace(new RegExp(location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').slice(0, 500),
    page: `${location.pathname}${location.hash.split('?')[0]}`,
    area: area(),
    device: device(),
  })
  try {
    void fetch(`${API_URL}/api/public/client-error`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body,
    }).catch(() => {})
  } catch {
    /* sem rede: deixa para lá */
  }
}

export function initClientErrors() {
  window.addEventListener('error', (event) => {
    // Imagem/vídeo que não carregou não é erro de código.
    if (!event.error && event.target && event.target !== window) return
    report(event.message || event.error?.message, event.filename, event.lineno, event.error?.stack)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    report(reason?.message || String(reason || 'Erro sem mensagem'), '', 0, reason?.stack)
  })
}

// Para relatar um erro já tratado, quando fizer sentido.
export const reportClientError = report
