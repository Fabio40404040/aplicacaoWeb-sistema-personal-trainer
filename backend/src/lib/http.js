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
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Farisa-Site',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

// Nenhum campo de texto passa de 10 mil caracteres (imagens em data: ficam de
// fora: têm limite próprio em cada rota). Evita inchar o banco com texto gigante.
const MAX_TEXT = 10_000
function clamp(value, depth = 0) {
  if (typeof value === 'string')
    return value.length > MAX_TEXT && !value.startsWith('data:') ? value.slice(0, MAX_TEXT) : value
  if (!value || typeof value !== 'object' || depth > 12) return value
  if (Array.isArray(value)) return value.map((item) => clamp(item, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clamp(item, depth + 1)]))
}

export async function readJson(request) {
  const type = request.headers.get('Content-Type') || ''
  if (!type.includes('application/json')) throw new Error('Envie o corpo como JSON.')
  return clamp(await request.json())
}
