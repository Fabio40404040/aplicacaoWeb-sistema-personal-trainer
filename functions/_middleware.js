// Endereço único do site: quem abre www.farisafit.com.br ou o endereço antigo
// (.pages.dev) é levado para https://farisafit.com.br, no mesmo caminho.
// Só páginas (GET fora de /api): avisos do Mercado Pago e chamadas da API no
// endereço antigo continuam funcionando.
const MAIN = 'farisafit.com.br'
const OLD_HOSTS = new Set(['www.farisafit.com.br', 'aplicacaoweb-sistema-personal-trainer.pages.dev'])

export async function onRequest(context) {
  const url = new URL(context.request.url)
  if (context.request.method === 'GET' && OLD_HOSTS.has(url.hostname) && !url.pathname.startsWith('/api/')) {
    url.hostname = MAIN
    url.protocol = 'https:'
    url.port = ''
    return Response.redirect(url.toString(), 301)
  }
  return context.next()
}
