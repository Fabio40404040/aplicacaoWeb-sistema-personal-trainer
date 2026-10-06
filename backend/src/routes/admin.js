// Área do administrador da plataforma (o dono do SaaS), em /admin.
import { payoutModes } from './payout.js'
// A conta de administrador fica na tabela platform_admins, separada das
// contas de personal. As rotas /api/admin/* só aceitam sessão com papel
// "admin" (criada por adminLogin) — sessão de personal ou aluno é recusada.
import { createSession, hashPassword, verifyPassword } from '../lib/session.js'
import { sendNoticeEmail } from '../lib/recovery-email.js'
import { readJson } from '../lib/http.js'

// Segunda etapa do login: código de 6 dígitos enviado ao e-mail do administrador.
const CODE_MINUTES = 10
async function codeHash(env, adminId, code) {
  const data = new TextEncoder().encode(`${adminId}:${code}:${env.SESSION_SECRET || ''}`)
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
// Devolve 'ok', 'sent' (código enviado agora), 'wrong' ou 'skip' (sem e-mail
// configurado ou sem a migração 034: entra só com a senha, como antes).
async function secondStep(env, db, admin, code) {
  const now = Math.floor(Date.now() / 1000)
  let row
  try {
    row = (await db.query('SELECT code_hash, expires_at, attempts FROM admin_login_codes WHERE admin_id=$1', [admin.id]))
      .rows[0]
  } catch {
    return 'skip'
  }
  const typed = String(code || '').replace(/\D/gu, '')
  if (typed) {
    if (!row || Number(row.expires_at) < now || Number(row.attempts) >= 5) return 'wrong'
    if (row.code_hash !== (await codeHash(env, admin.id, typed))) {
      await db.query('UPDATE admin_login_codes SET attempts=attempts+1 WHERE admin_id=$1', [admin.id])
      return 'wrong'
    }
    await db.query('DELETE FROM admin_login_codes WHERE admin_id=$1', [admin.id])
    return 'ok'
  }
  const fresh = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
  let response = null
  try {
    response = await sendNoticeEmail(env, {
      to: admin.email,
      subject: `${fresh} é o seu código de acesso ao FARISA Admin`,
      html: `<p>Olá, ${admin.name || 'administrador'}.</p><p>Seu código de acesso é:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${fresh}</p><p>Ele vale por ${CODE_MINUTES} minutos. Se não foi você que tentou entrar, troque a sua senha.</p>`,
    })
  } catch {
    response = null
  }
  if (!response?.ok) {
    console.error('[admin] não foi possível enviar o código de acesso; entrando só com a senha')
    return 'skip'
  }
  await db.query(
    `INSERT INTO admin_login_codes (admin_id, code_hash, expires_at, attempts) VALUES ($1,$2,$3,0)
     ON CONFLICT(admin_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0`,
    [admin.id, await codeHash(env, admin.id, fresh), now + CODE_MINUTES * 60],
  )
  return 'sent'
}

export async function adminLogin(request, env, db) {
  const { email, password, code } = await readJson(request)
  if (typeof email !== 'string' || typeof password !== 'string')
    return { error: 'Credenciais inválidas.', status: 400 }
  let admin
  try {
    admin = (
      await db.query(
        'SELECT id, name, email, password_hash, auth_version FROM platform_admins WHERE lower(email)=lower($1) LIMIT 1',
        [email.trim()],
      )
    ).rows[0]
  } catch {
    return {
      error: 'Área do administrador ainda não configurada (rode a migração 021).',
      status: 503,
    }
  }
  if (!admin || !(await verifyPassword(password, admin.password_hash)))
    return { error: 'E-mail ou senha incorretos.', status: 401 }
  const step = await secondStep(env, db, admin, code)
  if (step === 'sent')
    return {
      data: { needCode: true, message: `Enviamos um código de 6 dígitos para o seu e-mail. Ele vale por ${CODE_MINUTES} minutos.` },
    }
  if (step === 'wrong')
    return { error: 'Código incorreto ou vencido. Entre de novo com a senha para receber outro.', status: 401 }
  await db.query('UPDATE platform_admins SET last_login_at=CURRENT_TIMESTAMP WHERE id=$1', [
    admin.id,
  ])
  return {
    data: {
      token: await createSession(admin, env, 'admin'),
      user: { id: admin.id, name: admin.name, email: admin.email },
    },
  }
}

// Confere se a sessão ainda vale (senha trocada = auth_version muda).
export async function currentAdmin(db, session) {
  if (session?.role !== 'admin') return null
  try {
    return (
      (
        await db.query(
          'SELECT id, name, email FROM platform_admins WHERE id=$1 AND auth_version=$2 LIMIT 1',
          [session.sub, session.version || 0],
        )
      ).rows[0] || null
    )
  } catch {
    return null
  }
}

const counts = `
  (SELECT COUNT(*) FROM students s WHERE s.trainer_id=t.id) AS "students",
  (SELECT COUNT(*) FROM students s WHERE s.trainer_id=t.id AND s.access_status='active'
     AND s.payment_status IN ('paid','waived')) AS "activeStudents",
  (SELECT COUNT(*) FROM workouts w WHERE w.trainer_id=t.id) AS "workouts"`

export async function adminTrainers(db) {
  const queries = [
    // Completa (migrações 018 e 020).
    `SELECT t.id, t.name, t.email, t.created_at AS "createdAt", t.last_login_at AS "lastLoginAt",
       t.avatar, t.plan_name AS "planName", t.student_limit AS "studentLimit", ${counts}
     FROM trainers t ORDER BY t.created_at`,
    // Sem a migração 020 (último acesso).
    `SELECT t.id, t.name, t.email, t.created_at AS "createdAt", NULL AS "lastLoginAt",
       t.avatar, t.plan_name AS "planName", t.student_limit AS "studentLimit", ${counts}
     FROM trainers t ORDER BY t.created_at`,
    // Banco antigo, sem a migração 018 (perfil).
    `SELECT t.id, t.name, t.email, t.created_at AS "createdAt", NULL AS "lastLoginAt",
       NULL AS "avatar", NULL AS "planName", NULL AS "studentLimit", ${counts}
     FROM trainers t ORDER BY t.created_at`,
  ]
  const extras = new Map((await adminTrainerExtras(db)).map((row) => [row.id, row]))
  const payout = await payoutModes(db)
  for (const sql of queries) {
    try {
      const rows = (await db.query(sql)).rows
      return rows.map((row, index) => ({
        status: 'active',
        ...extras.get(row.id),
        openTickets: Number(extras.get(row.id)?.openTickets || 0),
        revenue30Cents: Number(extras.get(row.id)?.revenue30Cents || 0),
        ...row,
        planName: extras.get(row.id)?.planName ?? row.planName,
        studentLimit: Number(extras.get(row.id)?.studentLimit ?? row.studentLimit ?? 0),
        students: Number(row.students || 0),
        activeStudents: Number(row.activeStudents || 0),
        workouts: Number(row.workouts || 0),
        isOwner: index === 0,
        payoutMode: payout.get(row.id) || 'none',
      }))
    } catch {
      /* tenta a próxima versão da consulta */
    }
  }
  return []
}

// ---------------------------------------------------------------------------
// Administração completa (migração 026): criar, editar, bloquear, nova senha,
// excluir personal, entrar no painel dele (suporte), registro de ações e
// central de suporte. Toda ação fica gravada em admin_audit.
// ---------------------------------------------------------------------------
const text = (value, max = 200) => {
  const clean = String(value ?? '').trim().slice(0, max)
  return clean || null
}
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(value || '').trim())

function temporaryPassword() {
  const pick = (chars, n) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => chars[v % chars.length]).join('')
  const raw =
    pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 3) +
    pick('abcdefghijkmnpqrstuvwxyz', 4) +
    pick('23456789', 3) +
    pick('@#$%&*!', 1)
  return raw
    .split('')
    .sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] > 127 ? 1 : -1))
    .join('')
}

export async function audit(db, admin, action, target = {}, details = '') {
  try {
    await db.query(
      `INSERT INTO admin_audit (admin_id,admin_email,action,target_type,target_id,target_label,details)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        admin?.id || null,
        admin?.email || null,
        action,
        target.type || null,
        target.id || null,
        target.label || null,
        text(details, 1000),
      ],
    )
  } catch {
    /* sem a migração 026 */
  }
}

async function trainerById(db, id) {
  return (
    await db.query('SELECT id, name, email, auth_version FROM trainers WHERE id=$1 LIMIT 1', [id])
  ).rows[0]
}

export async function adminOverview(db) {
  const one = async (sql, values = []) => {
    try {
      return (await db.query(sql, values)).rows[0] || {}
    } catch {
      return {}
    }
  }
  const [revenue, tickets, blocked] = await Promise.all([
    one(
      `SELECT COALESCE(SUM(amount_cents),0) AS cents, COUNT(*) AS n FROM payments
       WHERE status='paid' AND paid_at >= datetime('now','-30 day')`,
    ),
    one(`SELECT COUNT(*) AS n FROM support_tickets WHERE admin_unread=1 AND status<>'closed'`),
    one(`SELECT COUNT(*) AS n FROM trainers WHERE status='blocked'`),
  ])
  return {
    revenue30Cents: Number(revenue.cents || 0),
    payments30: Number(revenue.n || 0),
    openTickets: Number(tickets.n || 0),
    blockedTrainers: Number(blocked.n || 0),
  }
}

export async function adminTrainerExtras(db) {
  try {
    return (
      await db.query(
        `SELECT t.id, t.status, t.blocked_reason AS "blockedReason", t.admin_notes AS "adminNotes",
           t.phone, t.cref, t.saas_plan_code AS "saasPlan", t.saas_expires_at AS "saasExpiresAt",
           t.saas_student_limit AS "customLimit",
           COALESCE(t.saas_student_limit, (SELECT p.student_limit FROM saas_plans p WHERE p.code=t.saas_plan_code)) AS "studentLimit",
           (SELECT p.name FROM saas_plans p WHERE p.code=t.saas_plan_code) AS "planName",
           (SELECT COUNT(*) FROM support_tickets k WHERE k.trainer_id=t.id AND k.admin_unread=1 AND k.status<>'closed') AS "openTickets",
           (SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p WHERE p.trainer_id=t.id AND p.status='paid'
              AND p.paid_at >= datetime('now','-30 day')) AS "revenue30Cents"
         FROM trainers t`,
      )
    ).rows
  } catch {
    return []
  }
}

export async function adminCreateTrainer(db, admin, body) {
  const name = text(body?.name, 120)
  const email = String(body?.email || '').trim().toLowerCase()
  if (!name || name.length < 3) return { error: 'Informe o nome do personal.', status: 400 }
  if (!validEmail(email)) return { error: 'Informe um e-mail válido.', status: 400 }
  const exists = (await db.query('SELECT id FROM trainers WHERE lower(email)=$1', [email])).rows[0]
  if (exists) return { error: 'Já existe um personal com este e-mail.', status: 409 }
  const password = temporaryPassword()
  const row = (
    await db.query(
      `INSERT INTO trainers (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,name,email`,
      [name, email, await hashPassword(password)],
    )
  ).rows[0]
  try {
    await db.query('UPDATE trainers SET phone=$2, cref=$3 WHERE id=$1', [row.id, text(body?.phone, 30), text(body?.cref, 30)])
    await db.query("UPDATE trainers SET saas_plan_code='free', saas_expires_at=NULL WHERE id=$1", [row.id])
  } catch {
    /* sem a migração 018 */
  }
  await audit(db, admin, 'trainer_created', { type: 'trainer', id: row.id, label: email })
  return { data: { ...row, temporaryPassword: password }, status: 201 }
}

export async function adminUpdateTrainer(db, admin, id, body) {
  const trainer = await trainerById(db, id)
  if (!trainer) return { error: 'Personal não encontrado.', status: 404 }
  const email = String(body?.email || trainer.email).trim().toLowerCase()
  if (!validEmail(email)) return { error: 'Informe um e-mail válido.', status: 400 }
  const clash = (
    await db.query('SELECT id FROM trainers WHERE lower(email)=$1 AND id<>$2', [email, id])
  ).rows[0]
  if (clash) return { error: 'Outro personal já usa este e-mail.', status: 409 }
  await db.query(
    `UPDATE trainers SET name=$2, email=$3, phone=$4, cref=$5, admin_notes=$6 WHERE id=$1`,
    [
      id,
      text(body?.name, 120) || trainer.name,
      email,
      text(body?.phone, 30),
      text(body?.cref, 30),
      text(body?.adminNotes, 2000),
    ],
  )
  await audit(db, admin, 'trainer_updated', { type: 'trainer', id, label: email })
  return { data: { id } }
}

export async function adminSetTrainerStatus(db, admin, id, body) {
  const trainer = await trainerById(db, id)
  if (!trainer) return { error: 'Personal não encontrado.', status: 404 }
  const block = body?.status === 'blocked'
  const reason = text(body?.reason, 300)
  if (block && !reason) return { error: 'Informe o motivo do bloqueio.', status: 400 }
  await db.query(
    // Bloquear também derruba as sessões abertas (auth_version + 1).
    `UPDATE trainers SET status=$2, blocked_reason=$3,
       auth_version = CASE WHEN $2='blocked' THEN auth_version + 1 ELSE auth_version END WHERE id=$1`,
    [id, block ? 'blocked' : 'active', block ? reason : null],
  )
  await audit(
    db,
    admin,
    block ? 'trainer_blocked' : 'trainer_unblocked',
    { type: 'trainer', id, label: trainer.email },
    reason || '',
  )
  return { data: { id, status: block ? 'blocked' : 'active' } }
}

export async function adminResetTrainerPassword(db, admin, id) {
  const trainer = await trainerById(db, id)
  if (!trainer) return { error: 'Personal não encontrado.', status: 404 }
  const password = temporaryPassword()
  await db.query(
    'UPDATE trainers SET password_hash=$2, auth_version=auth_version+1 WHERE id=$1',
    [id, await hashPassword(password)],
  )
  await audit(db, admin, 'trainer_password_reset', { type: 'trainer', id, label: trainer.email })
  return { data: { temporaryPassword: password } }
}

export async function adminDeleteTrainer(env, db, admin, id, body) {
  const trainer = await trainerById(db, id)
  if (!trainer) return { error: 'Personal não encontrado.', status: 404 }
  if (String(body?.confirmEmail || '').trim().toLowerCase() !== trainer.email.toLowerCase())
    return { error: 'Digite o e-mail do personal para confirmar a exclusão.', status: 400 }
  // Arquivos (GIFs, vídeos, PDFs) do personal no R2.
  let removedFiles = 0
  if (env.MEDIA) {
    let cursor
    do {
      const page = await env.MEDIA.list({ prefix: `trainers/${id}/`, cursor })
      const keys = page.objects.map((object) => object.key)
      if (keys.length) {
        await env.MEDIA.delete(keys)
        removedFiles += keys.length
      }
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
  }
  // As contas de login dos alunos não têm ligação automática com o personal:
  // apaga junto (LGPD) e libera os e-mails para novo cadastro. A última linha
  // também limpa contas que ficaram órfãs de exclusões antigas.
  // ON DELETE CASCADE apaga alunos, fichas, avaliações, agenda etc.
  let removedAccounts = 0
  try {
    removedAccounts = Number(
      (
        await db.query(
          `SELECT COUNT(*) AS total FROM student_accounts WHERE trainer_id=$1
             OR id IN (SELECT account_id FROM students WHERE trainer_id=$1 AND account_id IS NOT NULL)`,
          [id],
        )
      ).rows[0]?.total || 0,
    )
  } catch {
    // só para o registro
  }
  await db.batch([
    {
      sql: `DELETE FROM student_accounts WHERE trainer_id=$1
              OR id IN (SELECT account_id FROM students WHERE trainer_id=$1 AND account_id IS NOT NULL)`,
      values: [id],
    },
    { sql: 'DELETE FROM trainers WHERE id=$1', values: [id] },
    {
      sql: `DELETE FROM student_accounts WHERE trainer_id IS NOT NULL
              AND trainer_id NOT IN (SELECT id FROM trainers)`,
      values: [],
    },
  ])
  await audit(
    db,
    admin,
    'trainer_deleted',
    { type: 'trainer', id, label: trainer.email },
    `${text(body?.reason, 300) || 'sem motivo informado'} · ${removedFiles} arquivo(s) e ${removedAccounts} conta(s) de aluno removido(s)`,
  )
  return { data: { deleted: true, removedFiles, removedAccounts } }
}

// Entrar no painel do personal para dar suporte. Exige motivo e fica no registro.
export async function adminImpersonate(env, db, admin, id, body) {
  const reason = text(body?.reason, 300)
  if (!reason) return { error: 'Informe o motivo do acesso de suporte.', status: 400 }
  const trainer = await trainerById(db, id)
  if (!trainer) return { error: 'Personal não encontrado.', status: 404 }
  await audit(db, admin, 'trainer_impersonated', { type: 'trainer', id, label: trainer.email }, reason)
  return {
    data: {
      token: await createSession(
        { ...trainer, auth_version: trainer.auth_version || 0 },
        { ...env, SESSION_TTL_SECONDS: 3600 },
        'coach',
        { support: admin.email || admin.id },
      ),
      trainer: { id: trainer.id, name: trainer.name, email: trainer.email },
    },
  }
}

export async function adminAuditLog(db) {
  try {
    return (
      await db.query(
        `SELECT id, admin_email AS "adminEmail", action, target_type AS "targetType", target_label AS "targetLabel",
           details, created_at AS "createdAt" FROM admin_audit ORDER BY created_at DESC LIMIT 300`,
      )
    ).rows
  } catch {
    return []
  }
}

// ---------- suporte (lado do admin)
export async function adminTickets(db) {
  try {
    return (
      await db.query(
        `SELECT k.id, k.subject, k.category, k.status, k.admin_unread AS "unread", k.created_at AS "createdAt",
           k.updated_at AS "updatedAt", t.id AS "trainerId", t.name AS "trainerName", t.email AS "trainerEmail",
           (SELECT body FROM support_messages m WHERE m.ticket_id=k.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessage"
         FROM support_tickets k JOIN trainers t ON t.id=k.trainer_id
         ORDER BY (k.status='closed'), k.updated_at DESC LIMIT 300`,
      )
    ).rows.map((row) => ({ ...row, unread: Boolean(row.unread) }))
  } catch {
    return []
  }
}

export async function ticketMessages(db, ticketId) {
  return (
    await db.query(
      `SELECT id, author, body, created_at AS "createdAt" FROM support_messages WHERE ticket_id=$1 ORDER BY created_at`,
      [ticketId],
    )
  ).rows
}

export async function adminTicket(db, id) {
  const ticket = (
    await db.query(
      `SELECT k.id, k.subject, k.category, k.status, k.created_at AS "createdAt", t.name AS "trainerName",
         t.email AS "trainerEmail" FROM support_tickets k JOIN trainers t ON t.id=k.trainer_id WHERE k.id=$1`,
      [id],
    )
  ).rows[0]
  if (!ticket) return { error: 'Chamado não encontrado.', status: 404 }
  await db.query('UPDATE support_tickets SET admin_unread=0 WHERE id=$1', [id])
  return { data: { ...ticket, messages: await ticketMessages(db, id) } }
}

export async function adminReplyTicket(env, db, admin, id, body) {
  const message = text(body?.body, 5000)
  const status = ['open', 'answered', 'closed'].includes(body?.status) ? body.status : null
  const ticket = (
    await db.query(
      `SELECT k.id, k.subject, t.email AS "trainerEmail" FROM support_tickets k JOIN trainers t ON t.id=k.trainer_id WHERE k.id=$1`,
      [id],
    )
  ).rows[0]
  if (!ticket) return { error: 'Chamado não encontrado.', status: 404 }
  if (!message && !status) return { error: 'Escreva a resposta.', status: 400 }
  const queries = []
  if (message)
    queries.push({
      sql: "INSERT INTO support_messages (ticket_id,author,body) VALUES ($1,'admin',$2)",
      values: [id, message],
    })
  queries.push({
    sql: `UPDATE support_tickets SET status=$2, trainer_unread=CASE WHEN $3=1 THEN 1 ELSE trainer_unread END,
            admin_unread=0, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
    values: [id, status || 'answered', message ? 1 : 0],
  })
  await db.batch(queries)
  if (message) {
    try {
      await sendNoticeEmail(env, {
        to: ticket.trainerEmail,
        subject: `Suporte FARISA respondeu: ${ticket.subject}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18212d">
          <h1 style="font-size:20px">Resposta do suporte</h1>
          <p style="white-space:pre-wrap">${message.replace(/[&<>]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</p>
          <p style="font-size:13px;color:#526075">Veja e responda em Suporte, no FARISA Painel.</p></div>`,
      })
    } catch {
      /* e-mail é só aviso */
    }
  }
  await audit(db, admin, message ? 'support_replied' : `support_${status}`, {
    type: 'ticket',
    id,
    label: ticket.subject,
  })
  return { data: { id } }
}
