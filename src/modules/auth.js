import { clearApiSession, login, syncRemoteData } from './api-client.js'

const SESSION_KEY = 'farisa-coach-session-v2'

function showApp() {
  document.querySelector('[data-public-screen]').hidden = true
  document.querySelector('[data-login-screen]').hidden = true
  document.querySelector('[data-app-shell]').hidden = false
  if (!location.hash || location.hash === '#login') location.hash = '#painel'
}

function showLogin() {
  document.querySelector('[data-public-screen]').hidden = true
  document.querySelector('[data-login-screen]').hidden = false
  document.querySelector('[data-app-shell]').hidden = true
  document.title = 'FARISA Personal Trainer'
  location.hash = '#login'
}

function showPublic() {
  document.querySelector('[data-public-screen]').hidden = false
  document.querySelector('[data-login-screen]').hidden = true
  document.querySelector('[data-app-shell]').hidden = true
  document.title = 'FARISA Personal Trainer'
}

function handleLocation() {
  const route = location.hash.slice(1)
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
    document.title = 'FARISA Personal Trainer'
    return
  }
  if (
    ['recuperar-senha-personal', 'nova-senha-personal', 'ativar-personal'].includes(studentRoute)
  ) {
    document.querySelector('[data-public-screen]').hidden = true
    document.querySelector('[data-login-screen]').hidden = true
    document.querySelector('[data-app-shell]').hidden = true
    document.querySelector(`[data-personal-screen="${studentRoute}"]`).hidden = false
    document.title = 'FARISA Personal Trainer'
    return
  }
  if (!route || ['inicio', 'consultoria', 'planos', 'aluno', 'faq', 'contato'].includes(route)) {
    showPublic()
    return
  }
  if (route === 'login') {
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
    if (location.hash !== '#login' && pendingLogin) {
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
      await syncRemoteData()
      if (controller.signal.aborted || location.hash !== '#login') return
      pendingLogin = null
      sessionStorage.setItem(SESSION_KEY, 'active')
      status.textContent = ''
      showApp()
    } catch (error) {
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
    sessionStorage.removeItem(SESSION_KEY)
    clearApiSession()
    location.hash = '#inicio'
    showPublic()
  })
}
