export function json(data, status = 200, headers = {}) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    // Respostas da API: o navegador não adivinha o tipo, não guarda em cache
    // (têm dados de conta) e não vaza o endereço para outros sites.
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...headers,
    },
  })
}

export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin')
  const allowed = env.ALLOWED_ORIGIN === '*' || origin === env.ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin': allowed ? origin || env.ALLOWED_ORIGIN : env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export async function readJson(request) {
  const type = request.headers.get('Content-Type') || ''
  if (!type.includes('application/json')) throw new Error('Envie o corpo como JSON.')
  return request.json()
}
