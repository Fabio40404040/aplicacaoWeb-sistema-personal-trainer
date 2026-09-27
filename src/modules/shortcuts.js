export function initShortcuts() {
  const globalSearch = document.querySelector('[data-global-search]')
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      globalSearch.focus()
    }
    if (event.key === 'Escape') document.querySelector('[data-sidebar]').classList.remove('is-open')
  })

  globalSearch.addEventListener('input', () => {
    const studentSearch = document.querySelector('[data-table-search="students"]')
    studentSearch.value = globalSearch.value
    location.hash = '#alunos'
    studentSearch.dispatchEvent(new Event('input'))
  })
}
