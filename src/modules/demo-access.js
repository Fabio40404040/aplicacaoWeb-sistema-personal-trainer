// Acesso de demonstração para o portfólio.
// Mostra o e-mail e a senha das contas demo nas telas de login e botões
// "Entrar como visitante". Também esconde o "Esqueci a senha" (o servidor
// já recusa recuperar a senha das contas demo).
//
// Para desligar (por exemplo, no site entregue a um cliente), coloque
// VITE_DEMO_MODE=false no .env.production e publique de novo.
const DEMO_ENABLED = String(import.meta.env.VITE_DEMO_MODE ?? 'true').trim() !== 'false'
const DEMO_PASSWORD = 'Demo@2026'

const DEMO_ACCOUNTS = {
  personal: [{ label: 'Entrar como visitante', email: 'demo@farisa.example' }],
  student: [
    { label: 'Entrar como aluno de consultoria', email: 'aluno.demo@farisa.example' },
    { label: 'Entrar como aluno de Treinos Prontos', email: 'aluno.pronto@farisa.example' },
  ],
}

function setValue(input, value) {
  if (!input) return
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function line(label, value) {
  const span = document.createElement('span')
  span.append(`${label}: `)
  const code = document.createElement('code')
  code.textContent = value
  span.append(code)
  return span
}

function createBox(accounts, form) {
  const box = document.createElement('div')
  box.className = 'demo-access'
  box.setAttribute('role', 'note')

  const title = document.createElement('strong')
  title.textContent = 'Acesso de demonstração'
  box.append(title)
  accounts.forEach((account) => box.append(line('E-mail', account.email)))
  box.append(line('Senha', DEMO_PASSWORD))

  const note = document.createElement('small')
  note.textContent = 'Dados fictícios. Tudo volta ao original todos os dias.'
  box.append(note)

  accounts.forEach((account, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `button button--secondary demo-access__button${index ? ' demo-access__button--next' : ''}`
    button.textContent = account.label
    button.addEventListener('click', () => {
      setValue(form.querySelector('[name="email"]'), account.email)
      setValue(form.querySelector('[name="password"]'), DEMO_PASSWORD)
      form.requestSubmit()
    })
    box.append(button)
  })
  return box
}

function addBox(form, accounts) {
  if (!form || form.querySelector('.demo-access')) return
  const submit = form.querySelector('button[type="submit"]')
  const box = createBox(accounts, form)
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
