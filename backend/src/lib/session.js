const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function isStrongPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[a-z]/u.test(password) &&
    /[A-Z]/u.test(password) &&
    /[0-9]/u.test(password) &&
    /[^A-Za-z0-9\s]/u.test(password) &&
    !/\s/u.test(password)
  )
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function decodeBase64url(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0))
}

async function signature(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))))
}

export async function createSession(trainer, env, role = 'coach') {
  const expiresAt = Math.floor(Date.now() / 1000) + Number(env.SESSION_TTL_SECONDS || 43200)
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        sub: trainer.id,
        email: trainer.email,
        role,
        version: trainer.auth_version || 0,
        exp: expiresAt,
      }),
    ),
  )
  return `${payload}.${await signature(payload, env.SESSION_SECRET)}`
}

export async function readSession(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/u, '')
  if (!token) return null
  const [payload, suppliedSignature] = token.split('.')
  if (
    !payload ||
    !suppliedSignature ||
    (await signature(payload, env.SESSION_SECRET)) !== suppliedSignature
  )
    return null
  const session = JSON.parse(decoder.decode(decodeBase64url(payload)))
  return session.exp > Math.floor(Date.now() / 1000) ? session : null
}

export async function verifyPassword(password, encodedHash) {
  const [scheme, iterations, salt, expected] = encodedHash.split('$')
  if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: decodeBase64url(salt),
      iterations: Number(iterations),
    },
    key,
    256,
  )
  return base64url(new Uint8Array(bits)) === expected
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iterations = 100000
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return `pbkdf2$${iterations}$${base64url(salt)}$${base64url(new Uint8Array(bits))}`
}
