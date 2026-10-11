// Olho para mostrar/ocultar a senha em todo campo de senha, inclusive nos que
// aparecem depois (janelas como "Corrigir e-mail" e "Excluir conta").
function enhance(input, index) {
  if (input.dataset.passwordControl || input.closest('.password-control')) return
  const template = document.querySelector('#password-toggle-template')
  if (!template) return
  input.dataset.passwordControl = '1'
  input.id ||= `password-${index}-${Math.random().toString(36).slice(2, 7)}`
  const wrapper = document.createElement('span')
  wrapper.className = 'password-control'
  input.replaceWith(wrapper)
  const button = template.content.firstElementChild.cloneNode(true)
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
}

export function initPasswordControls() {
  let count = 0
  const scan = (root) => {
    if (root.matches?.('input[type="password"]')) enhance(root, count++)
    root.querySelectorAll?.('input[type="password"]').forEach((input) => enhance(input, count++))
  }
  scan(document)
  new MutationObserver((changes) => {
    changes.forEach((change) => change.addedNodes.forEach((node) => node.nodeType === 1 && scan(node)))
  }).observe(document.body, { childList: true, subtree: true })
}
