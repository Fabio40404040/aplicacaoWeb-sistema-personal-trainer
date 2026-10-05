// Suporte do personal: abre chamados e conversa com o dono da plataforma
// (migração 026). O dono responde em /admin → Suporte.
import { sendNoticeEmail } from '../lib/recovery-email.js'
import { ticketMessages } from './admin.js'
import { saasState } from './saas.js'

const CATEGORIES = ['duvida', 'problema', 'pagamento', 'sugestao', 'conta']
// No plano Grátis o suporte atende só pagamento e conta (para ninguém ficar
// sem saída se o plano não ativar ou a conta travar). O suporte completo é do
// plano Ilimitado.
const FREE_CATEGORIES = ['pagamento', 'conta']
async function hasFullSupport(db, trainerId) {
  const state = await saasState(db, trainerId).catch(() => null)
  return !state || !state.isFree
}
export async function supportAccess(db, trainerId) {
  const full = await hasFullSupport(db, trainerId)
  return { data: { full, categories: full ? CATEGORIES : FREE_CATEGORIES } }
}

const text = (value, max) => String(value ?? '').trim().slice(0, max)
const escape = (value) =>
  String(value).replace(/[&<>]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

async function notifyAdmins(env, db, subject, lines) {
  try {
    const admins = (await db.query('SELECT email FROM platform_admins')).rows
    for (const admin of admins)
      await sendNoticeEmail(env, {
        to: admin.email,
        subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18212d">
          <h1 style="font-size:20px">${escape(subject)}</h1>
          ${lines.map((line) => `<p style="white-space:pre-wrap;margin:6px 0">${line}</p>`).join('')}
          <p style="font-size:13px;color:#526075">Responda em FARISA Admin → Suporte.</p></div>`,
      })
  } catch {
    /* e-mail é só aviso */
  }
}

export async function trainerTickets(db, trainerId) {
  try {
    return {
      data: (
        await db.query(
          `SELECT id, subject, category, status, trainer_unread AS "unread", created_at AS "createdAt",
             updated_at AS "updatedAt" FROM support_tickets WHERE trainer_id=$1 ORDER BY updated_at DESC LIMIT 100`,
          [trainerId],
        )
      ).rows.map((row) => ({ ...row, unread: Boolean(row.unread) })),
    }
  } catch {
    return { error: 'Suporte indisponível: rode a migração 026.', status: 503 }
  }
}

export async function trainerTicket(db, trainerId, id) {
  const ticket = (
    await db.query(
      `SELECT id, subject, category, status, created_at AS "createdAt" FROM support_tickets WHERE id=$1 AND trainer_id=$2`,
      [id, trainerId],
    )
  ).rows[0]
  if (!ticket) return { error: 'Chamado não encontrado.', status: 404 }
  await db.query('UPDATE support_tickets SET trainer_unread=0 WHERE id=$1', [id])
  return { data: { ...ticket, messages: await ticketMessages(db, id) } }
}

export async function createTicket(env, db, trainerId, body) {
  const subject = text(body?.subject, 120)
  const message = text(body?.message, 5000)
  const category = CATEGORIES.includes(body?.category) ? body.category : 'duvida'
  if (subject.length < 3) return { error: 'Informe o assunto.', status: 400 }
  if (message.length < 5) return { error: 'Descreva o que precisa.', status: 400 }
  if (!FREE_CATEGORIES.includes(category) && !(await hasFullSupport(db, trainerId)))
    return {
      error: 'O suporte direto faz parte do plano Ilimitado. No plano Grátis você pode abrir chamado sobre pagamento ou sobre a sua conta.',
      status: 403,
    }
  const id = crypto.randomUUID().replace(/-/gu, '')
  await db.batch([
    {
      sql: 'INSERT INTO support_tickets (id,trainer_id,subject,category) VALUES ($1,$2,$3,$4)',
      values: [id, trainerId, subject, category],
    },
    {
      sql: "INSERT INTO support_messages (ticket_id,author,body) VALUES ($1,'trainer',$2)",
      values: [id, message],
    },
  ])
  const trainer = (await db.query('SELECT name, email FROM trainers WHERE id=$1', [trainerId])).rows[0]
  await notifyAdmins(env, db, `Novo chamado de suporte: ${subject}`, [
    `<b>${escape(trainer?.name || '')}</b> (${escape(trainer?.email || '')}) · ${category}`,
    escape(message),
  ])
  return { data: { id }, status: 201 }
}

export async function replyTicket(env, db, trainerId, id, body) {
  const message = text(body?.body, 5000)
  if (!message) return { error: 'Escreva a mensagem.', status: 400 }
  const ticket = (
    await db.query('SELECT id, subject FROM support_tickets WHERE id=$1 AND trainer_id=$2', [id, trainerId])
  ).rows[0]
  if (!ticket) return { error: 'Chamado não encontrado.', status: 404 }
  await db.batch([
    {
      sql: "INSERT INTO support_messages (ticket_id,author,body) VALUES ($1,'trainer',$2)",
      values: [id, message],
    },
    {
      sql: `UPDATE support_tickets SET status='open', admin_unread=1, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      values: [id],
    },
  ])
  await notifyAdmins(env, db, `Nova mensagem no chamado: ${ticket.subject}`, [escape(message)])
  return { data: { id } }
}
