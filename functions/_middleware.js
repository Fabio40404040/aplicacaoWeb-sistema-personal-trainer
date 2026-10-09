// Endereço único do site: quem abre www.farisafit.com.br ou o endereço antigo
// (.pages.dev) é levado para https://farisafit.com.br, no mesmo caminho.
// Só páginas (GET fora de /api): avisos do Mercado Pago e chamadas da API no
// endereço antigo continuam funcionando.
const MAIN = 'farisafit.com.br'
const OLD_HOSTS = new Set(['www.farisafit.com.br', 'aplicacaoweb-sistema-personal-trainer.pages.dev'])

// Ícones com versão: o iPhone guarda o ícone da Tela de Início em cache e,
// sem isto, repetia o ícone do outro app.
const ICON_VERSION = '2'

// Cada app instalável precisa chegar com nome, ícone e manifesto próprios já
// no HTML (o Safari do iPhone lê o HTML original ao "Adicionar à Tela de
// Início", antes de o JavaScript trocar).
function appHead(pathname) {
  const path = pathname.replace(/\/+$/u, '')
  if (path === '/personal')
    return {
      title: 'FARISA Painel',
      manifest: '/painel.webmanifest',
      touch: `/icons/painel-apple-touch-icon.png?v=${ICON_VERSION}`,
      icon: '/icons/painel-192.png',
      theme: '#047857',
    }
  const page = path.match(/^\/p\/([a-z0-9-]{3,30})$/iu)
  if (page) {
    const slug = page[1].toLowerCase()
    return {
      slug,
      manifest: `/api/public/site-manifest/${slug}`,
      touch: `/api/public/site-icon/${slug}/192`,
    }
  }
  if (path === '' || path === '/index.html')
    return { touch: `/icons/apple-touch-icon.png?v=${ICON_VERSION}` }
  return null
}

const setAttr = (attr, value) => ({
  element(element) {
    if (value) element.setAttribute(attr, value)
  },
})

export async function onRequest(context) {
  const url = new URL(context.request.url)
  if (context.request.method === 'GET' && OLD_HOSTS.has(url.hostname) && !url.pathname.startsWith('/api/')) {
    url.hostname = MAIN
    url.protocol = 'https:'
    url.port = ''
    return Response.redirect(url.toString(), 301)
  }
  const response = await context.next()
  const head = context.request.method === 'GET' && !url.pathname.startsWith('/api/') ? appHead(url.pathname) : null
  if (!head || !(response.headers.get('content-type') || '').includes('text/html')) return response
  // Página de um personal: o app instalado é o "FARISA Aluno", na cor dele.
  if (head.slug) {
    try {
      const manifest = await fetch(new URL(head.manifest, url.origin), { signal: AbortSignal.timeout(2500) })
      if (manifest.ok) {
        const data = await manifest.json()
        head.title = String(data.short_name || data.name || '').slice(0, 30) || undefined
        const touch = data.icons?.find((icon) => icon.sizes === '180x180') || data.icons?.[0]
        if (touch?.src) head.touch = String(touch.src)
        head.theme = String(data.theme_color || '') || undefined
      }
    } catch {
      /* sem o nome: segue com o manifesto e o ícone dele */
    }
  }
  try {
    const rewriter = new HTMLRewriter()
      .on('link[rel="manifest"]', setAttr('href', head.manifest))
      .on('link[rel="apple-touch-icon"]', setAttr('href', head.touch))
      .on('link[rel="icon"]', setAttr('href', head.icon))
      .on('meta[name="theme-color"]', setAttr('content', head.theme))
      .on('meta[name="apple-mobile-web-app-title"]', setAttr('content', head.title))
    const pageTitle = head.slug ? '' : head.title
    if (pageTitle)
      rewriter.on('title', {
        element(element) {
          element.setInnerContent(pageTitle)
        },
      })
    return rewriter.transform(response)
  } catch {
    return response
  }
}
