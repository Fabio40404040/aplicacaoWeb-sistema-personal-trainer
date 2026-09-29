const routes = new Set(['painel', 'alunos', 'agenda', 'treinos', 'exercicios', 'avaliacoes', 'checkins', 'evolucao', 'admin'])

function setMenuState(open) {
  const sidebar = document.querySelector('[data-sidebar]')
  const toggle = document.querySelector('[data-menu-toggle]')
  sidebar.classList.toggle('is-open', open)
  toggle.setAttribute('aria-expanded', String(open))
  toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu')
  toggle.querySelector('use')?.setAttribute('href', open ? '#icon-close' : '#icon-menu')
}

function closeMenu() {
  setMenuState(false)
}

function renderRoute() {
  const requested = location.hash.slice(1)
  if (!routes.has(requested)) return
  const route = routes.has(requested) ? requested : 'painel'
  document
    .querySelectorAll('[data-route]')
    .forEach((page) => page.classList.toggle('is-active', page.dataset.route === route))
  document.querySelectorAll('[data-route-link]').forEach((link) => {
    const active = link.dataset.routeLink === route
    link.classList.toggle('is-active', active)
    if (active) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  document.title = 'FARISA Personal Trainer'
  window.scrollTo({ top: 0, behavior: 'smooth' })
  closeMenu()
}

export function initNavigation() {
  window.addEventListener('hashchange', renderRoute)
  document.querySelector('[data-menu-toggle]').addEventListener('click', () => {
    const sidebar = document.querySelector('[data-sidebar]')
    setMenuState(!sidebar.classList.contains('is-open'))
  })
  document.querySelector('[data-sidebar-backdrop]').addEventListener('click', closeMenu)
  renderRoute()
}
