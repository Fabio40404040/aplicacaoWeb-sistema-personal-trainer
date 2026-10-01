// Atalho discreto: tocar rápido na logo do site público.
// 5 toques → FARISA Painel (personal) · 6 toques → FARISA Admin.
const WAIT_MS = 700
const TARGETS = {
  5: '/personal/#acesso-farisa',
  6: '/admin/#acesso-farisa',
}

export function initLogoSecret() {
  if (document.documentElement.dataset.surface === 'painel') return
  const logos = document.querySelectorAll('.public-brand')
  if (!logos.length) return

  let count = 0
  let timer = 0
  const decide = () => {
    const target = TARGETS[count]
    count = 0
    if (target) location.href = target
  }

  logos.forEach((logo) =>
    logo.addEventListener('click', () => {
      count += 1
      window.clearTimeout(timer)
      timer = window.setTimeout(decide, WAIT_MS)
    }),
  )
}
