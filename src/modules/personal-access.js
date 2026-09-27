import { syncRemoteData } from './api-client.js'

const API_URL = import.meta.env.VITE_API_URL || ''
const API_TOKEN_KEY = 'farisa-coach-api-token'
const PERSONAL_SESSION_KEY = 'farisa-coach-session-v2'

async function personalRequest(action, data) {
  const response = await fetch(`${API_URL}/api/auth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {
    throw new Error('Não foi possível conectar ao serviço de contas. Tente novamente mais tarde.')
  })
  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('O serviço de contas está indisponível. Tente novamente mais tarde.')
  }
  if (!response.ok) throw new Error(result?.error || 'Não foi possível concluir a solicitação.')
  return result
}

export function initPersonalAccess() {
  document.querySelectorAll('[data-personal-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      if (!form.reportValidity()) return
      const status = form.querySelector('[role="status"]')
      const button = form.querySelector('[type="submit"]')
      const defaultButtonLabel = button.textContent.trim()
      const restoreSubmitButton = () => {
        if (!button.dataset.resetUrl) return
        delete button.dataset.resetUrl
        button.type = 'submit'
        button.textContent = defaultButtonLabel
        button.onclick = null
        status.textContent = ''
      }
      form.addEventListener('input', restoreSubmitButton, { once: true })
      const action = form.dataset.personalForm
      const data = Object.fromEntries(new FormData(form))
      if (action === 'reset')
        data.token = new URLSearchParams(location.hash.split('?')[1] || '').get('token')
      button.disabled = true
      status.textContent = 'Aguarde…'
      try {
        const result = await personalRequest(action, data)
        form.reset()
        status.replaceChildren(document.createTextNode(result.message))
        if (action === 'forgot' && result.resetUrl) {
          button.dataset.resetUrl = result.resetUrl
          button.type = 'button'
          button.textContent = 'Abrir link de recuperação'
          button.onclick = () => location.assign(button.dataset.resetUrl)
        }
        if (action === 'reset') {
          if (!result.token) throw new Error('O servidor não retornou uma sessão válida.')
          sessionStorage.setItem(API_TOKEN_KEY, result.token)
          sessionStorage.setItem(PERSONAL_SESSION_KEY, 'active')
          await syncRemoteData()
          location.hash = '#painel'
        }
      } catch (error) {
        status.textContent = error.message
      } finally {
        button.disabled = false
      }
    })
  })
}
