function loadedAppScript() {
  const script = [...document.scripts].find((item) => /\/assets\/index-[^/]+\.js$/u.test(item.src))
  return script ? new URL(script.src, location.origin).pathname : ''
}

async function reloadWhenAppChanged() {
  if (document.visibilityState === 'hidden' || !navigator.onLine) return
  try {
    const response = await fetch(`/?app-version=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return
    const html = await response.text()
    const match = html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/u)
    if (!match) return
    const latestScript = new URL(match[1], location.origin).pathname
    if (loadedAppScript() && latestScript !== loadedAppScript()) location.reload()
  } catch {
    // Sem internet, mantém a versão instalada disponível.
  }
}

export function initPwa() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return

  const hadController = Boolean(navigator.serviceWorker.controller)
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return
    refreshing = true
    location.reload()
  })

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      })
      await registration.update()
      await reloadWhenAppChanged()
    } catch (error) {
      console.warn('Não foi possível preparar a instalação do aplicativo.', error)
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reloadWhenAppChanged()
  })
  window.addEventListener('pageshow', () => void reloadWhenAppChanged())

  const installButton = document.querySelector('[data-install-app]')
  const dialog = document.querySelector('[data-install-dialog]')
  const instructions = dialog.querySelector('[data-install-instructions]')
  const isIos = /iPad|iPhone|iPod/u.test(navigator.userAgent)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  if (isStandalone) return

  let installPrompt
  if (isIos) installButton.hidden = false

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event
    installButton.hidden = false
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    installButton.hidden = true
  })

  installButton.addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt()
      await installPrompt.userChoice
      installPrompt = null
      installButton.hidden = true
      return
    }
    instructions.textContent = isIos
      ? 'No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Depois toque em Adicionar.'
      : 'Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.'
    dialog.showModal()
  })
  dialog.querySelector('[data-close-install]').addEventListener('click', () => dialog.close())
}
