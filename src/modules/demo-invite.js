// Conta de demonstração: quando o visitante tenta salvar algo, em vez de um
// erro seco aparece um convite para criar a conta grátis.
const DEMO_KEY = 'farisa-demo'
const KEYS = ['farisa-coach-api-token', 'farisa-coach-session-v2', 'farisa-coach-data-v1', 'farisa-student-token', DEMO_KEY]

export const isDemoSession = () => {
  try {
    return Boolean(sessionStorage.getItem(DEMO_KEY))
  } catch {
    return false
  }
}

// Sai da demonstração e vai para o cadastro do personal.
// Sai da demonstração e volta para a vitrine da plataforma.
export function leaveDemoToHome() {
  KEYS.forEach((key) => sessionStorage.removeItem(key))
  location.href = '/#demonstracao'
}
export function leaveDemoToSignup() {
  KEYS.forEach((key) => sessionStorage.removeItem(key))
  location.href = '/personal/#ativar-personal'
}

let box = null
export function showDemoInvite() {
  if (!isDemoSession() || box?.open) return
  box?.remove()
  box = document.createElement('dialog')
  box.className = 'demo-invite'
  const card = document.createElement('div')
  const title = document.createElement('h2')
  title.textContent = 'Gostou?'
  const text = document.createElement('p')
  text.textContent =
    'Esta é uma demonstração, então nada é salvo aqui. Crie sua conta grátis em 1 minuto para fazer isso de verdade, com a sua marca e os seus alunos.'
  const note = document.createElement('small')
  note.textContent = '30 dias com tudo liberado, depois grátis para sempre no plano inicial. Sem cartão.'
  const actions = document.createElement('div')
  actions.className = 'demo-invite-actions'
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'button button--secondary'
  back.textContent = 'Continuar olhando'
  back.addEventListener('click', () => box.close())
  const go = document.createElement('button')
  go.type = 'button'
  go.className = 'button button--primary'
  go.textContent = 'Criar minha conta grátis'
  go.addEventListener('click', leaveDemoToSignup)
  actions.append(back, go)
  card.append(title, text, note, actions)
  box.append(card)
  document.body.append(box)
  box.showModal()
}

// Chamado pelas requisições: 403 numa sessão de demonstração = tentou salvar.
export function demoInviteOn(response) {
  if (response?.status === 403 && isDemoSession()) showDemoInvite()
}
