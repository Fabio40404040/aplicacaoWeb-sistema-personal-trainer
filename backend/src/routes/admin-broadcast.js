// Avisos por e-mail do administrador para os personais (manutenção, novidade,
// etc.). Envia para um personal, para todos os personais ativos ou um teste
// para o próprio administrador. O envio vai em partes (o painel chama de novo
// com "offset") para não passar do limite de chamadas de cada requisição.
import { isDemoEmail } from '../lib/demo.js'
import { escape, notify } from '../lib/notify.js'
import { audit } from './admin.js'

// Brevo grátis ≈ 300 e-mails por dia na conta toda (senha, pagamentos…).
// Um aviso geral não pode passar disso para não travar os e-mails do sistema.
export const BROADCAST_MAX = 200
const CHUNK = 25

const clean = (value, max) => String(value || '').trim().slice(0, max)

// Texto digitado → parágrafos em HTML (linha em branco separa parágrafos).
const toLines = (message) =>
  message
    .split(/\n\s*\n/u)
    .map((part) => escape(part.trim()).replace(/\n/gu, '<br>'))
    .filter(Boolean)

async function recipients(db, admin, body) {
  const audience = String(body?.audience || '')
  if (audience === 'me') return [{ name: admin.name, email: admin.email }]
  if (audience === 'one') {
    const id = String(body?.trainerId || '')
    const rows = (
      await db.query(
        `SELECT name, email FROM trainers WHERE id=$1 AND id NOT IN ('farisa-library','demo-trainer') LIMIT 1`,
        [id],
      )
    ).rows
    return rows.filter((row) => row.email && !isDemoEmail(row.email))
  }
  if (audience === 'all') {
    const rows = (
      await db.query(
        `SELECT name, email FROM trainers
         WHERE id NOT IN ('farisa-library','demo-trainer') AND COALESCE(status,'active')='active'
           AND email IS NOT NULL AND email<>''
         ORDER BY created_at, id`,
      )
    ).rows
    return rows.filter((row) => !isDemoEmail(row.email))
  }
  return null
}

export async function adminBroadcast(db, admin, body) {
  const list = await recipients(db, admin, body)
  if (!list) return { error: 'Escolha para quem enviar.', status: 400 }
  if (!list.length) return { error: 'Nenhum destinatário encontrado.', status: 400 }
  const total = list.length
  if (total > BROADCAST_MAX)
    return {
      error: `São ${total} destinatários e o limite por aviso é ${BROADCAST_MAX} (o plano grátis da Brevo envia cerca de 300 e-mails por dia, contando os do sistema). Para enviar a mais gente, é preciso o plano pago da Brevo.`,
      status: 400,
    }
  if (body?.preview) return { data: { total } }

  const subject = clean(body?.subject, 150)
  const message = clean(body?.message, 5000)
  if (subject.length < 3) return { error: 'Escreva o assunto.', status: 400 }
  if (message.length < 3) return { error: 'Escreva a mensagem.', status: 400 }

  const offset = Math.max(0, Math.floor(Number(body?.offset) || 0))
  const part = list.slice(offset, offset + CHUNK)
  const lines = toLines(message)
  const results = await Promise.all(
    part.map((person) => notify({ to: person.email, name: person.name, subject, lines })),
  )
  const sent = results.filter(Boolean).length
  if (offset === 0 && body?.audience !== 'me')
    await audit(
      db,
      admin,
      'broadcast_sent',
      { type: 'email', label: subject },
      body?.audience === 'all' ? `Aviso para todos os personais (${total})` : `Aviso para ${list[0].email}`,
    )
  const next = offset + CHUNK < total ? offset + CHUNK : null
  return { data: { total, sent, failed: part.length - sent, next } }
}
