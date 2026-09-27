// Link "Esqueci a senha" da tela de login do personal (mesma recuperação por
// e-mail da área do aluno). Troque para false se quiser esconder o link.
const ENABLE_PERSONAL_PASSWORD_RECOVERY = true

// O quadro "Dados para testar o painel", que mostrava o e-mail e a senha na
// tela de login, foi retirado: a senha real ficava visível para qualquer
// pessoa que abrisse o site.
export function initPersonalTestAccess() {
  const form = document.querySelector('[data-login-form]')
  if (!form) return

  const recoveryLink = form.querySelector('a[href="#recuperar-senha-personal"]')
  if (recoveryLink) recoveryLink.hidden = !ENABLE_PERSONAL_PASSWORD_RECOVERY
}
