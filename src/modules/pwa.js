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

  const installButtons = [...document.querySelectorAll('[data-install-app]')]
  const dialog = document.querySelector('[data-install-dialog]')
  const instructions = dialog.querySelector('[data-install-instructions]')
  const isIos = /iPad|iPhone|iPod/u.test(navigator.userAgent)
  const showButtons = (visible) =>
    installButtons.forEach((button) => {
      button.hidden = !visible
    })
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  if (isStandalone) {
    showButtons(false)
    return
  }

  let installPrompt
  if (isIos) showButtons(true)

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event
    showButtons(true)
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    showButtons(false)
  })
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', (event) => {
    if (event.matches) showButtons(false)
  })

  const install = async () => {
    if (installPrompt) {
      const prompt = installPrompt
      installPrompt = null
      prompt.prompt()
      const choice = await prompt.userChoice.catch(() => null)
      // Só some quando instalar; se recusar, o botão continua (mostra as instruções).
      if (choice?.outcome === 'accepted') showButtons(false)
      return
    }
    // iPhone dentro de outro app (Instagram, Facebook, Chrome…): só o Safari
    // instala. Mostra como abrir no Safari e um botão para copiar o link.
    const inApp = isIos && /FBAN|FBAV|Instagram|Line\/|CriOS|FxiOS|EdgiOS|GSA\//u.test(navigator.userAgent)
    instructions.textContent = inApp
      ? 'Para instalar, abra esta página no Safari: toque em Copiar link, abra o Safari e cole o link na barra de endereço. Depois toque em Compartilhar e escolha “Adicionar à Tela de Início”.'
      : isIos
        ? 'No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Depois toque em Adicionar.'
        : 'Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.'
    let copy = dialog.querySelector('[data-install-copy]')
    if (inApp && !copy) {
      copy = document.createElement('button')
      copy.type = 'button'
      copy.dataset.installCopy = ''
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.href.split('#')[0])
          copy.textContent = 'Link copiado'
        } catch {
          copy.textContent = location.href.split('#')[0]
        }
      })
      dialog.querySelector('[data-close-install]').before(copy)
    }
    if (copy) {
      copy.hidden = !inApp
      copy.textContent = 'Copiar link'
    }
    dialog.showModal()
  }
  installButtons.forEach((button) => button.addEventListener('click', install))
  dialog.querySelector('[data-close-install]').addEventListener('click', () => dialog.close())
}
