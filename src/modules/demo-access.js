// Acesso de demonstração para o portfólio.
// Mostra o e-mail e a senha das contas demo nas telas de login e um botão
// "Entrar como visitante". Também esconde o "Esqueci a senha" (o servidor
// já recusa recuperar a senha das contas demo).
//
// Para desligar (por exemplo, no site entregue a um cliente), coloque
// VITE_DEMO_MODE=false no .env.production e publique de novo.
const DEMO_ENABLED = String(import.meta.env.VITE_DEMO_MODE ?? 'true').trim() !== 'false'

const DEMO_ACCOUNTS = {
  personal: { email: 'demo@farisa.example', password: 'Demo@2026' },
  student: { email: 'aluno.demo@farisa.example', password: 'Demo@2026' },
}

function setValue(input, value) {
  if (!input) return
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function createBox(account, form) {
  const box = document.createElement('div')
  box.className = 'demo-access'
  box.setAttribute('role', 'note')

  const title = document.createElement('strong')
  title.textContent = 'Acesso de demonstração'

  const email = document.createElement('span')
  email.append('E-mail: ')
  const emailCode = document.createElement('code')
  emailCode.textContent = account.email
  email.append(emailCode)

  const password = document.createElement('span')
  password.append('Senha: ')
  const passwordCode = document.createElement('code')
  passwordCode.textContent = account.password
  password.append(passwordCode)

  const note = document.createElement('small')
  note.textContent = 'Dados fictícios. Tudo volta ao original todos os dias.'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--secondary demo-access__button'
  button.textContent = 'Entrar como visitante'
  button.addEventListener('click', () => {
    setValue(form.querySelector('[name="email"]'), account.email)
    setValue(form.querySelector('[name="password"]'), account.password)
    form.requestSubmit()
  })

  box.append(title, email, password, note, button)
  return box
}

function addBox(form, account) {
  if (!form || form.querySelector('.demo-access')) return
  const submit = form.querySelector('button[type="submit"]')
  const box = createBox(account, form)
  if (submit) submit.before(box)
  else form.append(box)
}

export function initDemoAccess() {
  if (!DEMO_ENABLED) return

  const personalForm = document.querySelector('[data-login-form]')
  addBox(personalForm, DEMO_ACCOUNTS.personal)
  const personalRecovery = personalForm?.querySelector('a[href="#recuperar-senha-personal"]')
  if (personalRecovery) personalRecovery.hidden = true

  const studentForm = document.querySelector('[data-student-form="login"]')
  addBox(studentForm, DEMO_ACCOUNTS.student)
  const studentRecovery = studentForm?.querySelector('a[href="#recuperar-senha"]')
  if (studentRecovery) studentRecovery.hidden = true
}
