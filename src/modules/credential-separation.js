function setAutocomplete(form, fieldName, value) {
  form?.querySelector(`[name="${fieldName}"]`)?.setAttribute('autocomplete', value)
}

function clearPersonalLogin() {
  if (location.hash !== '#login') return
  const form = document.querySelector('[data-login-form]')
  if (!form) return
  const email = form.querySelector('[name="email"]')
  const password = form.querySelector('[name="password"]')
  if (email) email.value = ''
  if (password) password.value = ''
}

export function initCredentialSeparation() {
  const personalLogin = document.querySelector('[data-login-form]')
  setAutocomplete(personalLogin, 'email', 'section-personal username')
  setAutocomplete(personalLogin, 'password', 'section-personal current-password')

  const studentLogin = document.querySelector('[data-student-form="login"]')
  setAutocomplete(studentLogin, 'email', 'section-student username')
  setAutocomplete(studentLogin, 'password', 'section-student current-password')

  const studentRegistration = document.querySelector('[data-student-form="register"]')
  setAutocomplete(studentRegistration, 'name', 'section-student name')
  setAutocomplete(studentRegistration, 'email', 'section-student username')
  setAutocomplete(studentRegistration, 'password', 'section-student new-password')

  const studentRecovery = document.querySelector('[data-student-form="forgot"]')
  setAutocomplete(studentRecovery, 'email', 'section-student username')

  clearPersonalLogin()
  window.addEventListener('hashchange', () => {
    clearPersonalLogin()
    if (location.hash === '#login') window.setTimeout(clearPersonalLogin, 250)
  })
  window.addEventListener('pageshow', clearPersonalLogin)
}
