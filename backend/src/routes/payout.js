// Recebimento de cada personal (migração 029). Os pagamentos dos alunos caem
// na conta do próprio personal:
//  - "mercadopago": conta dele, conectada por autorização (OAuth) — Pix e
//    cartão com liberação automática;
//  - "pix": chave Pix de qualquer banco — o aluno paga, avisa, e o personal
//    confere e confirma;
//  - "platform": conta da plataforma (só o dono/admin).
// Os tokens das contas conectadas ficam cifrados no banco (AES-GCM).
import { safeEqual } from '../lib/session.js'

const encoder = new TextEncoder()
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const unb64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

async function cipherKey(env) {
  const secret = String(env.PAYOUT_ENCRYPTION_KEY || env.SESSION_SECRET || '')
  if (secret.length < 16) throw new Error('Chave de segurança da plataforma não configurada.')
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`farisa-payout:${secret}`))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cipherKey(env), encoder.encode(text))
  return `${b64(iv)}.${b64(data)}`
}
async function unseal(env, sealed) {
  const [iv, data] = String(sealed || '').split('.')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await cipherKey(env), unb64(data))
  return new TextDecoder().decode(plain)
}
async function hmac(env, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(env.SESSION_SECRET || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(text)))
}

const siteUrl = (env) => String(env.PUBLIC_SITE_URL || '').replace(/\/$/u, '')
const redirectUri = (env) => `${siteUrl(env)}/api/payments/mercadopago/oauth`
export const mpConnectAvailable = (env) =>
  Boolean(env.MERCADO_PAGO_CLIENT_ID && env.MERCADO_PAGO_CLIENT_SECRET && siteUrl(env))

async function payoutRow(db, trainerId) {
  return (await db.query('SELECT * FROM trainer_payout WHERE trainer_id=$1', [trainerId])).rows[0] || null
}

async function oauthToken(env, body) {
  const response = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: String(env.MERCADO_PAGO_CLIENT_ID),
      client_secret: String(env.MERCADO_PAGO_CLIENT_SECRET),
      ...body,
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token) {
    console.error('[recebimento] Mercado Pago recusou a autorização', response.status, data?.error || data?.message)
    throw new Error('O Mercado Pago não autorizou a conexão. Tente conectar de novo.')
  }
  return data
}

async function saveTokens(env, db, trainerId, data, { activate = false } = {}) {
  const expiresAt = new Date(Date.now() + Number(data.expires_in || 15552000) * 1000).toISOString()
  await db.query(
    `INSERT INTO trainer_payout (trainer_id, mode, mp_user_id, mp_access_token, mp_refresh_token, mp_public_key,
       mp_expires_at, mp_connected_at) VALUES ($1,'mercadopago',$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)
     ON CONFLICT(trainer_id) DO UPDATE SET mp_user_id=excluded.mp_user_id, mp_access_token=excluded.mp_access_token,
       mp_refresh_token=excluded.mp_refresh_token, mp_public_key=excluded.mp_public_key,
       mp_expires_at=excluded.mp_expires_at, updated_at=CURRENT_TIMESTAMP
       ${activate ? ", mode='mercadopago', mp_connected_at=CURRENT_TIMESTAMP" : ''}`,
    [
      trainerId,
      String(data.user_id || ''),
      await seal(env, String(data.access_token)),
      data.refresh_token ? await seal(env, String(data.refresh_token)) : null,
      String(data.public_key || ''),
      expiresAt,
    ],
  )
}

// Com que conta este personal recebe. Devolve o "env" de pagamento a usar nas
// chamadas ao Mercado Pago (o da plataforma ou o da conta conectada).
export async function resolvePay(db, env, trainerId) {
  let row
  try {
    row = await payoutRow(db, trainerId)
  } catch {
    return { mode: 'platform', env } // sem a migração 029: como era antes
  }
  if (!row || row.mode === 'none') return { mode: 'none', env: null }
  if (row.mode === 'platform') return { mode: 'platform', env }
  if (row.mode === 'pix')
    return row.pix_key ? { mode: 'pix', env: null, pix: row } : { mode: 'none', env: null }
  if (!row.mp_access_token) return { mode: 'none', env: null }
  try {
    let token = await unseal(env, row.mp_access_token)
    let publicKey = row.mp_public_key
    // Renova a autorização quando faltam menos de 30 dias para vencer.
    const soon = row.mp_expires_at && Date.parse(row.mp_expires_at) - Date.now() < 30 * 86_400_000
    if (soon && row.mp_refresh_token && mpConnectAvailable(env)) {
      try {
        const data = await oauthToken(env, {
          grant_type: 'refresh_token',
          refresh_token: await unseal(env, row.mp_refresh_token),
        })
        await saveTokens(env, db, trainerId, data)
        token = String(data.access_token)
        publicKey = String(data.public_key || publicKey)
      } catch (error) {
        console.error('[recebimento] não foi possível renovar a conexão', trainerId, error?.message)
      }
    }
    return {
      mode: 'mercadopago',
      trainerId,
      env: { ...env, MERCADO_PAGO_ACCESS_TOKEN: token, MERCADO_PAGO_PUBLIC_KEY: publicKey },
    }
  } catch (error) {
    console.error('[recebimento] conexão inválida', trainerId, error?.message)
    return { mode: 'none', env: null }
  }
}

export const NOT_CONFIGURED =
  'O pagamento pelo site ainda não foi ativado pelo seu personal. Fale com ele para combinar o pagamento.'

// ---------- Pix "copia e cola" (BR Code) para chave de qualquer banco
const plain = (text, max) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^A-Za-z0-9 ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
const tlv = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`
function crc16(text) {
  let crc = 0xffff
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}
export function pixBrCode({ key, holder, city, amountCents, txid }) {
  const payload =
    tlv('00', '01') +
    tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', key)) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', (amountCents / 100).toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', plain(holder, 25) || 'RECEBEDOR') +
    tlv('60', plain(city, 15) || 'BRASIL') +
    tlv('62', tlv('05', String(txid).replace(/[^A-Za-z0-9]/gu, '').slice(0, 25) || '***')) +
    '6304'
  return payload + crc16(payload)
}

const validCpf = (digits) => {
  if (!/^\d{11}$/u.test(digits) || /^(\d)\1{10}$/u.test(digits)) return false
  const check = (size) => {
    let sum = 0
    for (let index = 0; index < size; index += 1) sum += Number(digits[index]) * (size + 1 - index)
    return ((sum * 10) % 11) % 10 === Number(digits[size])
  }
  return check(9) && check(10)
}
function normalizePixKey(type, raw) {
  const value = String(raw || '').trim()
  const digits = value.replace(/\D/gu, '')
  if (type === 'cpf') return validCpf(digits) ? digits : null
  if (type === 'cnpj') return /^\d{14}$/u.test(digits) ? digits : null
  if (type === 'phone') {
    const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
    return /^\d{10,11}$/u.test(local) ? `+55${local}` : null
  }
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) && value.length <= 77 ? value.toLowerCase() : null
  if (type === 'random')
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value) ? value.toLowerCase() : null
  return null
}

// ---------- painel do personal
async function pendingManual(db, trainerId) {
  return (
    await db.query(
      `SELECT i.id, i.amount_cents AS "amountCents", i.status, i.plan_code AS "planCode", i.billing_cycle AS "billingCycle",
         i.updated_at AS "updatedAt", s.name AS "studentName", p.name AS "planName"
       FROM payment_intents i JOIN students s ON s.id=i.student_id LEFT JOIN plans p ON p.code=i.plan_code
       WHERE i.trainer_id=$1 AND i.provider='manual' AND i.status='in_review' ORDER BY i.updated_at`,
      [trainerId],
    )
  ).rows
}

export async function payoutInfo(db, env, trainerId) {
  let row
  try {
    row = await payoutRow(db, trainerId)
  } catch {
    return { data: { ready: false } }
  }
  return {
    data: {
      ready: true,
      mode: row?.mode || 'none',
      mpAvailable: mpConnectAvailable(env),
      mp: row?.mp_access_token
        ? { connected: true, userId: row.mp_user_id, connectedAt: row.mp_connected_at }
        : { connected: false },
      pix: row?.pix_key
        ? { type: row.pix_key_type, key: row.pix_key, holder: row.pix_holder, city: row.pix_city }
        : null,
      pending: await pendingManual(db, trainerId),
    },
  }
}

export async function payoutConnectUrl(env, trainerId) {
  if (!mpConnectAvailable(env))
    return { error: 'A conexão com o Mercado Pago ainda não foi ativada pela plataforma. Use a chave Pix por enquanto.', status: 503 }
  const body = `${trainerId}.${Date.now() + 15 * 60_000}`
  const state = `${body}.${await hmac(env, `mp-oauth:${body}`)}`
  const query = new URLSearchParams({
    client_id: String(env.MERCADO_PAGO_CLIENT_ID),
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: redirectUri(env),
  })
  return { data: { url: `https://auth.mercadopago.com.br/authorization?${query}` } }
}

// Volta do Mercado Pago depois que o personal autoriza (rota pública; quem
// garante a origem é o "state" assinado pelo servidor, válido por 15 minutos).
export async function payoutOAuthCallback(request, env, db) {
  const url = new URL(request.url)
  const back = (result) => Response.redirect(`${siteUrl(env) || url.origin}/personal/?mp=${result}#recebimentos`, 302)
  const [trainerId, expires, signature] = String(url.searchParams.get('state') || '').split('.')
  const code = String(url.searchParams.get('code') || '')
  if (!trainerId || !signature || !safeEqual(await hmac(env, `mp-oauth:${trainerId}.${expires}`), signature))
    return back('invalido')
  if (Number(expires) < Date.now()) return back('expirou')
  if (!/^[\w-]{6,200}$/u.test(code)) return back('cancelado')
  try {
    const data = await oauthToken(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(env) })
    await saveTokens(env, db, trainerId, data, { activate: true })
    return back('ok')
  } catch {
    return back('erro')
  }
}

export async function payoutDisconnect(db, trainerId) {
  await db.query(
    `UPDATE trainer_payout SET mp_user_id=NULL, mp_access_token=NULL, mp_refresh_token=NULL, mp_public_key=NULL,
       mp_expires_at=NULL, mp_connected_at=NULL,
       mode=CASE WHEN mode='mercadopago' THEN (CASE WHEN pix_key IS NOT NULL THEN 'pix' ELSE 'none' END) ELSE mode END,
       updated_at=CURRENT_TIMESTAMP WHERE trainer_id=$1`,
    [trainerId],
  )
  return { data: { ok: true } }
}

export async function payoutSavePix(db, trainerId, body) {
  const type = String(body?.type || '')
  const key = normalizePixKey(type, body?.key)
  if (!key) return { error: 'Confira a chave Pix: ela não combina com o tipo escolhido.', status: 400 }
  const holder = String(body?.holder || '').trim().slice(0, 80)
  const city = String(body?.city || '').trim().slice(0, 40)
  if (holder.length < 3) return { error: 'Informe o nome do titular da conta, como aparece no banco.', status: 400 }
  if (city.length < 2) return { error: 'Informe a cidade do titular.', status: 400 }
  await db.query(
    `INSERT INTO trainer_payout (trainer_id, mode, pix_key_type, pix_key, pix_holder, pix_city) VALUES ($1,'pix',$2,$3,$4,$5)
     ON CONFLICT(trainer_id) DO UPDATE SET pix_key_type=excluded.pix_key_type, pix_key=excluded.pix_key,
       pix_holder=excluded.pix_holder, pix_city=excluded.pix_city, updated_at=CURRENT_TIMESTAMP,
       mode=CASE WHEN trainer_payout.mode='none' THEN 'pix' ELSE trainer_payout.mode END`,
    [trainerId, type, key, holder, city],
  )
  return { data: { ok: true } }
}

export async function payoutRemovePix(db, trainerId) {
  await db.query(
    `UPDATE trainer_payout SET pix_key_type=NULL, pix_key=NULL, pix_holder=NULL, pix_city=NULL,
       mode=CASE WHEN mode='pix' THEN (CASE WHEN mp_access_token IS NOT NULL THEN 'mercadopago' ELSE 'none' END) ELSE mode END,
       updated_at=CURRENT_TIMESTAMP WHERE trainer_id=$1`,
    [trainerId],
  )
  return { data: { ok: true } }
}

// Qual das formas configuradas está valendo.
export async function payoutSetMode(db, trainerId, body) {
  const row = await payoutRow(db, trainerId)
  const mode = String(body?.mode || '')
  if (row?.mode === 'platform') return { error: 'Esta conta recebe pela conta da plataforma.', status: 400 }
  if (mode === 'mercadopago' && !row?.mp_access_token) return { error: 'Conecte o Mercado Pago primeiro.', status: 400 }
  if (mode === 'pix' && !row?.pix_key) return { error: 'Cadastre a chave Pix primeiro.', status: 400 }
  if (!['mercadopago', 'pix'].includes(mode)) return { error: 'Forma de recebimento inválida.', status: 400 }
  await db.query('UPDATE trainer_payout SET mode=$2, updated_at=CURRENT_TIMESTAMP WHERE trainer_id=$1', [trainerId, mode])
  return { data: { ok: true } }
}

// Modo de cada personal, para a lista do admin.
export async function payoutModes(db) {
  try {
    return new Map((await db.query('SELECT trainer_id AS id, mode FROM trainer_payout')).rows.map((row) => [row.id, row.mode]))
  } catch {
    return new Map()
  }
}
