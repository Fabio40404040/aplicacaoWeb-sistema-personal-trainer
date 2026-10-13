// Chama o site para ele processar os avisos de assinatura (ver
// backend/src/routes/billing-notices.js). O site só roda de fato no máximo a
// cada 6 horas e nunca repete o mesmo aviso, então chamar a mais não faz mal.
async function ring(env) {
  const url = `${String(env.SITE_URL || '').replace(/\/$/u, '')}/api/public/cron`
  const response = await fetch(url, {
    method: 'POST',
    // Mesma senha guardada no site (CRON_SECRET), para só o agendador chamar.
    headers: { 'Content-Type': 'application/json', ...(env.CRON_SECRET ? { 'X-Cron-Secret': String(env.CRON_SECRET) } : {}) },
    body: '{}',
  })
  console.log(`Avisos de assinatura: resposta ${response.status}`)
  return response.status
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ring(env).catch((error) => console.error('Falha ao chamar o site.', error)))
  },
  // Sem rota pública: abrir o endereço do worker não faz nada.
  async fetch() {
    return new Response('Not found', { status: 404 })
  },
}
