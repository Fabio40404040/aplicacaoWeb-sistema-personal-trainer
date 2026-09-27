function setMenuState(menu, toggle, open) {
  menu.hidden = !open
  toggle.setAttribute('aria-expanded', String(open))
  toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu')
  toggle.querySelector('use')?.setAttribute('href', open ? '#icon-close' : '#icon-menu')
}

function closeMenu(menu, toggle) {
  setMenuState(menu, toggle, false)
}

export function initPublicMenu() {
  const menu = document.querySelector('[data-public-menu]')
  const toggle = document.querySelector('[data-public-menu-toggle]')
  const wrapper = toggle.closest('.public-menu-wrap')
  const desktop = window.matchMedia('(min-width: 821px)')

  toggle.addEventListener('click', () => {
    setMenuState(menu, toggle, menu.hidden)
  })

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu(menu, toggle)
  })

  document.addEventListener('click', (event) => {
    if (!menu.hidden && !wrapper.contains(event.target)) closeMenu(menu, toggle)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu(menu, toggle)
      toggle.focus()
    }
  })

  desktop.addEventListener('change', (event) => {
    if (event.matches) closeMenu(menu, toggle)
  })
}
