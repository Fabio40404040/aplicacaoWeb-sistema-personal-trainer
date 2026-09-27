export function initPasswordControls() {
  document.querySelectorAll('input[type="password"]').forEach((input, index) => {
    input.id ||= `password-${index}`
    const wrapper = document.createElement('span')
    wrapper.className = 'password-control'
    input.replaceWith(wrapper)
    const button = document
      .querySelector('#password-toggle-template')
      .content.firstElementChild.cloneNode(true)
    button.setAttribute('aria-controls', input.id)
    wrapper.append(input, button)
    function conceal() {
      input.type = 'password'
      button.setAttribute('aria-label', 'Mostrar senha')
      button.setAttribute('aria-pressed', 'false')
    }
    button.addEventListener('click', () => {
      const reveal = input.type === 'password'
      input.type = reveal ? 'text' : 'password'
      button.setAttribute('aria-label', reveal ? 'Ocultar senha' : 'Mostrar senha')
      button.setAttribute('aria-pressed', String(reveal))
    })
    input.form?.addEventListener('reset', conceal)
    window.addEventListener('hashchange', conceal)
  })
}
