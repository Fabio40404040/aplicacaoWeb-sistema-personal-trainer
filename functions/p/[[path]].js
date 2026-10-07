// Página de cada personal (/p/<endereço>): entrega o mesmo site, mas com o
// título e a prévia de compartilhamento (WhatsApp, Instagram, Google) com a
// marca dele. Se algo falhar aqui, a página abre normalmente, sem a troca.
const clean = (text) => String(text || '').replace(/\s+/gu, ' ').trim()

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url)
  const page = await env.ASSETS.fetch(new Request(new URL('/', url), request))
  try {
    const slug = String([].concat(params.path || [])[0] || '').toLowerCase()
    if (!/^[a-z0-9-]{3,30}$/u.test(slug) || !env.DB) return page
    const row = await env.DB.prepare(
      `SELECT s.slug, s.brand_name AS brand, t.name FROM trainer_site s JOIN trainers t ON t.id=s.trainer_id WHERE s.slug=?1`,
    )
      .bind(slug)
      .first()
    // Endereço que não existe: mesma página (ela mostra "não encontrada"), com o código certo.
    if (!row) return new Response(page.body, { status: 404, headers: page.headers })
    const name = clean(row.brand || row.name)
    const title = `${name} — treinos e acompanhamento`
    const description = `Treine com ${name}: fichas com vídeo, avaliação física, agenda e acompanhamento pelo celular. Veja os planos e comece agora.`
    const here = `${url.origin}/p/${row.slug}`
    const set = (value) => ({
      element(element) {
        element.setAttribute('content', value)
      },
    })
    return new HTMLRewriter()
      .on('title', {
        element(element) {
          element.setInnerContent(title)
        },
      })
      .on('meta[name="description"]', set(description))
      .on('meta[property="og:title"]', set(title))
      .on('meta[property="og:description"]', set(description))
      .on('meta[property="og:site_name"]', set(name))
      .on('meta[property="og:url"]', set(here))
      .on('meta[property="og:image"]', set(`${url.origin}/api/public/site-icon/${row.slug}/512`))
      .on('link[rel="canonical"]', {
        element(element) {
          element.setAttribute('href', here)
        },
      })
      .transform(page)
  } catch (error) {
    console.error('[página do personal] prévia não aplicada', error?.message)
    return page
  }
}
