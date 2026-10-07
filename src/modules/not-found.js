// Tela de "página não encontrada": endereço que não existe no site ou
// página de personal que não existe (mais útil do que cair na página inicial
// sem explicação).
const KNOWN = /^\/(index\.html)?$|^\/p\/[a-z0-9-]{3,30}\/?$|^\/personal\/?$/iu

export function showNotFound(kind = 'page') {
  if (document.querySelector('[data-not-found]')) return
  const box = document.createElement('main')
  box.dataset.notFound = ''
  box.className = 'not-found'
  const card = document.createElement('div')
  const code = document.createElement('span')
  code.textContent = '404'
  const title = document.createElement('h1')
  title.textContent = kind === 'trainer' ? 'Página do personal não encontrada' : 'Página não encontrada'
  const text = document.createElement('p')
  text.textContent =
    kind === 'trainer'
      ? 'Este endereço não existe ou foi alterado. Confira o link com o seu personal.'
      : 'O endereço que você abriu não existe. Confira o link ou volte para o início.'
  const home = document.createElement('a')
  home.className = 'button button--primary'
  home.href = '/'
  home.textContent = 'Ir para o início'
  card.append(code, title, text, home)
  box.append(card)
  document.title = `${title.textContent} — FARISA`
  // Some com o resto da página para não aparecer nada por trás.
  document.body.replaceChildren(box)
  document.documentElement.removeAttribute('data-site-loading')
}

// Endereço desconhecido (o servidor devolve a página inicial para qualquer caminho).
export function initNotFound() {
  if (!KNOWN.test(location.pathname)) showNotFound('page')
}
