// Lista para o Google das páginas dos personais (/p/<endereço>). Entra só quem
// confirmou o e-mail e não está bloqueado; demonstração e biblioteca ficam fora.
// Indicada em public/robots.txt. Se algo falhar, devolve a lista vazia.
const escapeXml = (text) =>
  String(text).replace(/[<>&'"]/gu, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char])

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin
  let rows = []
  try {
    rows =
      (
        await env.DB.prepare(
          `SELECT s.slug, s.updated_at AS updated FROM trainer_site s JOIN trainers t ON t.id=s.trainer_id
           WHERE t.id NOT IN ('demo-trainer','farisa-library') AND COALESCE(t.status,'active')<>'blocked'
             AND t.email_verified_at IS NOT NULL AND s.slug IS NOT NULL
           ORDER BY s.updated_at DESC LIMIT 5000`,
        ).all()
      ).results || []
  } catch {
    rows = []
  }
  const urls = rows
    .filter((row) => /^[a-z0-9-]{3,30}$/u.test(String(row.slug || '')))
    .map((row) => {
      const day = String(row.updated || '').slice(0, 10)
      return `  <url><loc>${escapeXml(`${origin}/p/${row.slug}`)}</loc>${/^\d{4}-\d{2}-\d{2}$/u.test(day) ? `<lastmod>${day}</lastmod>` : ''}</url>`
    })
    .join('\n')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
