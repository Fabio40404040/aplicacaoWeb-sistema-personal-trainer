import { clearApiSession, login, logoutRemote, syncRemoteData } from './api-client.js'

const SESSION_KEY = 'farisa-coach-session-v2'
// Em /personal/ (FARISA Painel) só existem o login e o painel do personal: as
// telas do site público e do aluno não abrem ali.
const isPainel = () => document.documentElement.dataset.surface === 'painel'
const appTitle = () => (isPainel() ? 'FARISA Painel' : 'FARISA Personal Trainer')
// Tela de entrada do personal: /personal/#acesso-farisa no Painel e #login no site.
const loginHash = () => (isPainel() ? '#acesso-farisa' : '#login')
const isLoginHash = (hash) => hash === '#login' || hash === '#acesso-farisa'
const PAINEL_ROUTES = new Set([
  'login',
  'acesso-farisa',
  'recuperar-senha-personal',
  'nova-senha-personal',
  'ativar-personal',
])

function showApp() {
  document.querySelector('[data-public-screen]').hidden = true
  document.querySelector('[data-login-screen]').hidden = true
  document.querySelector('[data-app-shell]').hidden = false
  if (!location.hash || isLoginHash(location.hash)) location.hash = '#painel'
}

function showLogin() {
  document.querySelector('[data-public-screen]').hidden = true
  document.querySelector('[data-login-screen]').hidden = false
  document.querySelector('[data-app-shell]').hidden = true
  document.title = appTitle()
  if (location.hash !== loginHash()) location.hash = loginHash()
}

function showPublic() {
  document.querySelector('[data-public-screen]').hidden = false
  document.querySelector('[data-login-screen]').hidden = true
  document.querySelector('[data-app-shell]').hidden = true
  document.title = appTitle()
}

function handleLocation() {
  const route = location.hash.slice(1)
  if (isPainel()) {
    const base = route.split('?')[0]
    const panelRoute = document.querySelector(`[data-route="${base}"]`)
    if (!PAINEL_ROUTES.has(base) && !panelRoute) {
      location.replace('#painel')
      return
    }
  }
  document.querySelectorAll('[data-student-screen]').forEach((screen) => {
    screen.hidden = true
  })
  document.querySelectorAll('[data-personal-screen]').forEach((screen) => {
    screen.hidden = true
  })
  const studentRoute = route.split('?')[0]
  if (
    ['entrar-aluno', 'cadastro-aluno', 'painel-aluno', 'recuperar-senha', 'nova-senha'].includes(
      studentRoute,
    )
  ) {
    document.querySelector('[data-public-screen]').hidden = true
    document.querySelector('[data-login-screen]').hidden = true
    document.querySelector('[data-app-shell]').hidden = true
    document.querySelector(`[data-student-screen="${studentRoute}"]`).hidden = false
    document.title = appTitle()
    return
  }
  if (
    ['recuperar-senha-personal', 'nova-senha-personal', 'ativar-personal'].includes(studentRoute)
  ) {
    document.querySelector('[data-public-screen]').hidden = true
    document.querySelector('[data-login-screen]').hidden = true
    document.querySelector('[data-app-shell]').hidden = true
    document.querySelector(`[data-personal-screen="${studentRoute}"]`).hidden = false
    document.title = appTitle()
    return
  }
  if (!route || ['inicio', 'consultoria', 'planos', 'aluno', 'faq', 'contato', 'demonstracao', 'recursos'].includes(route)) {
    showPublic()
    return
  }
  if (route === 'login' || route === 'acesso-farisa') {
    // Já conectado ("Lembrar de mim" e o app abrindo na tela de entrar):
    // vai direto para o painel.
    if (sessionStorage.getItem(SESSION_KEY) && sessionStorage.getItem('farisa-coach-api-token')) {
      showApp()
      return
    }
    showLogin()
    return
  }
  if (sessionStorage.getItem(SESSION_KEY)) showApp()
  else showLogin()
}

export function initAuth() {
  const form = document.querySelector('[data-login-form]')
  let pendingLogin = null
  const status = form.querySelector('[data-personal-login-status]')
  const button = form.querySelector('[type="submit"]')

  handleLocation()
  window.addEventListener('hashchange', () => {
    if (!isLoginHash(location.hash) && pendingLogin) {
      pendingLogin.abort()
      pendingLogin = null
      clearApiSession()
      button.disabled = false
      status.textContent = ''
    }
    handleLocation()
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    if (pendingLogin) return
    const controller = new AbortController()
    pendingLogin = controller
    const credentials = Object.fromEntries(new FormData(form))
    button.disabled = true
    status.textContent = 'Verificando seus dados…'
    try {
      await login(credentials, controller.signal)
      // Some com o formulário logo após entrar: assim o iPhone/Chrome entende
      // que o login deu certo e oferece "Salvar senha".
      status.textContent = 'Abrindo seu painel…'
      form.classList.add('is-signing-in')
      await syncRemoteData()
      if (controller.signal.aborted || !isLoginHash(location.hash)) return
      pendingLogin = null
      sessionStorage.setItem(SESSION_KEY, 'active')
      status.textContent = ''
      form.classList.remove('is-signing-in')
      showApp()
    } catch (error) {
      form.classList.remove('is-signing-in')
      if (controller.signal.aborted) return
      sessionStorage.removeItem(SESSION_KEY)
      clearApiSession()
      status.textContent = error.message
    } finally {
      if (pendingLogin === controller) pendingLogin = null
      if (!pendingLogin) button.disabled = false
    }
  })

  // Login vencido (a API respondeu 401): volta para a tela de entrada com um
  // aviso, em vez de deixar o painel aberto tentando carregar tudo sem acesso.
  window.addEventListener('farisa:session-expired', () => {
    if (!sessionStorage.getItem(SESSION_KEY)) return
    sessionStorage.removeItem(SESSION_KEY)
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close())
    showLogin()
    status.textContent = 'Sua sessão expirou. Entre de novo para continuar.'
  })

  document.querySelector('[data-logout]').addEventListener('click', () => {
    logoutRemote()
    sessionStorage.removeItem(SESSION_KEY)
    clearApiSession()
    if (isPainel()) {
      showLogin()
      return
    }
    location.hash = '#inicio'
    showPublic()
  })
}
