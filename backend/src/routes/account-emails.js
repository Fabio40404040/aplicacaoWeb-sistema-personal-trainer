// E-mails da conta: boas-vindas com confirmação de e-mail, avisos ao personal
// (novo aluno, Pix para conferir, pagamento recebido) e ao aluno (pagamento
// confirmado, acesso vencendo). Migração 036.
import { day, escape, money, notify, siteUrl } from '../lib/notify.js'

const DAY = 86_400_000
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const sha = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

async function trainerOf(db, trainerId) {
  try {
    return (
      await db.query(
        `SELECT t.id, t.name, t.email, s.slug, s.brand_name AS brand FROM trainers t LEFT JOIN trainer_site s ON s.trainer_id=t.id WHERE t.id=$1`,
        [trainerId],
      )
    ).rows[0]
  } catch {
    return (await db.query('SELECT id, name, email FROM trainers WHERE id=$1', [trainerId])).rows[0]
  }
}
const studentPage = (trainer) => `${siteUrl()}${trainer?.slug ? `/p/${trainer.slug}` : '/'}#entrar-aluno`
const panel = (hash) => `${siteUrl()}/personal/#${hash}`

// ---------- boas-vindas + confirmação de e-mail
async function verificationLink(db, kind, accountId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  await db.batch([
    { sql: 'DELETE FROM email_verifications WHERE kind=$1 AND account_id=$2', values: [kind, accountId] },
    {
      sql: 'INSERT INTO email_verifications (token_hash, kind, account_id, expires_at) VALUES ($1,$2,$3,$4)',
      values: [await sha(token), kind, accountId, Date.now() + 7 * DAY],
    },
  ])
  return `${siteUrl()}/api/public/verify-email?token=${token}`
}

export async function sendTrainerWelcome(db, trainer, { resend = false } = {}) {
  try {
    const url = await verificationLink(db, 'trainer', trainer.id)
    return await notify({
      to: trainer.email,
      name: trainer.name,
      subject: resend ? 'Confirme seu e-mail — FARISA' : 'Bem-vindo à FARISA — confirme seu e-mail',
      lines: resend
        ? ['Clique no botão para confirmar que este e-mail é seu. O link vale por 7 dias.']
        : [
            'Sua conta de personal na FARISA está criada, no plano Grátis.',
            'Para começar: monte a sua página em <strong>Meu site</strong>, escolha como receber em <strong>Recebimentos</strong> e cadastre o primeiro aluno.',
            'Confirme seu e-mail para garantir que você recebe os avisos de alunos e de pagamento. O link vale por 7 dias.',
          ],
      button: { label: 'Confirmar meu e-mail', url },
    })
  } catch (error) {
    console.error('[boas-vindas] personal', error?.message)
    return false
  }
}

export async function sendStudentWelcome(db, account, trainerId) {
  try {
    const trainer = await trainerOf(db, trainerId)
    const url = await verificationLink(db, 'student', account.id)
    const who = escape(trainer?.brand || trainer?.name || 'seu personal')
    await notify({
      to: account.email,
      name: account.name,
      subject: `Sua conta de aluno com ${trainer?.brand || trainer?.name || 'seu personal'} — confirme seu e-mail`,
      lines: [
        `Sua conta de aluno com <strong>${who}</strong> foi criada.`,
        'Confirme seu e-mail para receber os avisos de pagamento e de vencimento do seu plano. O link vale por 7 dias.',
        `Para entrar depois, use a página do seu personal: <a href="${studentPage(trainer)}">${escape(studentPage(trainer))}</a>`,
      ],
      button: { label: 'Confirmar meu e-mail', url },
    })
  } catch (error) {
    console.error('[boas-vindas] aluno', error?.message)
  }
}

// Link do e-mail: confirma e mostra uma página simples (rota pública).
export async function verifyEmailPage(db, token) {
  let ok = false
  let back = `${siteUrl()}/`
  try {
    if (/^[a-f0-9]{64}$/u.test(String(token || ''))) {
      const row = (
        await db.query('SELECT kind, account_id AS "accountId", expires_at AS "expiresAt" FROM email_verifications WHERE token_hash=$1', [
          await sha(token),
        ])
      ).rows[0]
      if (row && Number(row.expiresAt) > Date.now()) {
        const table = row.kind === 'trainer' ? 'trainers' : 'student_accounts'
        await db.batch([
          { sql: `UPDATE ${table} SET email_verified_at=CURRENT_TIMESTAMP WHERE id=$1`, values: [row.accountId] },
          { sql: 'DELETE FROM email_verifications WHERE kind=$1 AND account_id=$2', values: [row.kind, row.accountId] },
        ])
        ok = true
        if (row.kind === 'trainer') back = panel('painel')
        else {
          const trainerId = (await db.query('SELECT trainer_id AS id FROM student_accounts WHERE id=$1', [row.accountId])).rows[0]?.id
          back = studentPage(await trainerOf(db, trainerId))
        }
      }
    }
  } catch (error) {
    console.error('[confirmação de e-mail]', error?.message)
  }
  const title = ok ? 'E-mail confirmado' : 'Link inválido ou vencido'
  const text = ok
    ? 'Pronto! Seu e-mail foi confirmado.'
    : 'Este link já foi usado ou passou do prazo. Entre na sua conta e peça um novo e-mail de confirmação.'
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — FARISA</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1220;color:#e2e8f0;font-family:Arial,Helvetica,sans-serif">
<main style="max-width:420px;margin:24px;padding:32px;border-radius:20px;background:#162033;text-align:center">
<p style="font-size:44px;margin:0">${ok ? '✅' : '⚠️'}</p><h1 style="font-size:24px;margin:12px 0">${title}</h1><p style="line-height:1.5;color:#cbd5e1">${text}</p>
<p><a href="${back}" style="display:inline-block;margin-top:8px;padding:12px 20px;border-radius:10px;background:#1557f0;color:#fff;text-decoration:none;font-weight:700">Continuar</a></p></main></body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  )
}

export async function emailStatus(db, trainerId) {
  try {
    const row = (await db.query('SELECT email, email_verified_at AS at FROM trainers WHERE id=$1', [trainerId])).rows[0]
    return { email: row?.email || '', verified: !row || Boolean(row.at) }
  } catch {
    return { email: '', verified: true } // sem a migração 036
  }
}

export async function resendVerification(db, trainerId) {
  const trainer = (await db.query('SELECT id, name, email, email_verified_at AS at FROM trainers WHERE id=$1', [trainerId])).rows[0]
  if (!trainer) return { error: 'Conta não encontrada.', status: 404 }
  if (trainer.at) return { data: { verified: true } }
  const sent = await sendTrainerWelcome(db, trainer, { resend: true })
  return sent
    ? { data: { sent: true } }
    : { error: 'Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.', status: 503 }
}

// ---------- avisos ao personal
export async function notifyNewStudent(db, trainerId, student, planName) {
  const trainer = await trainerOf(db, trainerId)
  if (!trainer) return
  await notify({
    to: trainer.email,
    name: trainer.name,
    subject: `Novo aluno: ${student.name}`,
    lines: [
      `<strong>${escape(student.name)}</strong> acabou de se cadastrar pela sua página${planName ? `, no plano <strong>${escape(planName)}</strong>` : ''}.`,
      'O acesso é liberado quando o pagamento for confirmado. Se vocês combinaram de outro jeito, você pode liberar pelo painel.',
    ],
    button: { label: 'Ver meus alunos', url: panel('alunos') },
  })
}

export async function notifyPixToCheck(db, intentId) {
  try {
    const row = (
      await db.query(
        `SELECT i.trainer_id AS "trainerId", i.amount_cents AS "amountCents", s.name FROM payment_intents i
         JOIN students s ON s.id=i.student_id WHERE i.id=$1`,
        [intentId],
      )
    ).rows[0]
    const trainer = row && (await trainerOf(db, row.trainerId))
    if (!trainer) return
    await notify({
      to: trainer.email,
      name: trainer.name,
      subject: `Pix para conferir: ${row.name} avisou que pagou ${money(row.amountCents)}`,
      lines: [
        `<strong>${escape(row.name)}</strong> avisou que fez um Pix de <strong>${money(row.amountCents)}</strong> para a sua chave.`,
        'Confira no extrato do seu banco e confirme no painel para liberar o acesso do aluno.',
      ],
      button: { label: 'Conferir o Pix', url: panel('recebimentos') },
    })
  } catch (error) {
    console.error('[aviso] Pix para conferir', error?.message)
  }
}

// Pagamento de aluno aprovado: recibo para o aluno e aviso para o personal.
export async function notifyStudentPayment(db, intent) {
  try {
    const row = (
      await db.query(
        `SELECT s.name, s.access_expires_at AS "expiresAt", s.access_type AS "accessType",
           COALESCE(a.email, s.email) AS email, p.name AS "planName"
         FROM students s LEFT JOIN student_accounts a ON a.id=s.account_id LEFT JOIN plans p ON p.code=$2 WHERE s.id=$1`,
        [intent.student_id, intent.plan_code],
      )
    ).rows[0]
    const trainer = await trainerOf(db, intent.trainer_id)
    if (!row || !trainer) return
    const amount = money(intent.amount_cents)
    const plan = escape(row.planName || 'seu plano')
    await notify({
      to: row.email,
      name: row.name,
      subject: 'Pagamento confirmado — seu acesso está liberado',
      lines: [
        `Recebemos o seu pagamento de <strong>${amount}</strong> do plano <strong>${plan}</strong> com ${escape(trainer.brand || trainer.name)}.`,
        row.accessType === 'permanent' || !row.expiresAt ? 'Seu acesso é permanente.' : `Seu acesso vale até <strong>${day(row.expiresAt)}</strong>.`,
        'Guarde este e-mail como comprovante.',
      ],
      button: { label: 'Abrir a área do aluno', url: studentPage(trainer) },
      footer: `${trainer.brand || trainer.name} · enviado pela plataforma FARISA.`,
    })
    await notify({
      to: trainer.email,
      name: trainer.name,
      subject: `Pagamento recebido: ${row.name} · ${amount}`,
      lines: [
        `<strong>${escape(row.name)}</strong> pagou <strong>${amount}</strong> pelo plano <strong>${plan}</strong>. O acesso já foi liberado.`,
      ],
      button: { label: 'Ver recebimentos', url: panel('recebimentos') },
    })
  } catch (error) {
    console.error('[aviso] pagamento de aluno', error?.message)
  }
}

// ---------- avisos ao aluno: acesso vencendo em 7 dias e em 1 dia
export async function runStudentNotices(db) {
  const sent = { week: 0, tomorrow: 0 }
  try {
    const now = Date.now()
    const rows = (
      await db.query(
        `SELECT s.id, s.name, s.trainer_id AS "trainerId", s.access_expires_at AS "expiresAt",
           COALESCE(a.email, s.email) AS email, p.name AS "planName"
         FROM students s LEFT JOIN student_accounts a ON a.id=s.account_id LEFT JOIN plans p ON p.code=s.plan_code
         WHERE s.access_status='active' AND s.payment_status IN ('paid','waived') AND s.access_expires_at IS NOT NULL
           AND s.access_expires_at > datetime('now') AND s.access_expires_at < datetime('now','+7 day')`,
      )
    ).rows
    for (const row of rows) {
      const left = Date.parse(row.expiresAt) - now
      if (!Number.isFinite(left) || left <= 0) continue
      const kind = left <= DAY ? 'st-tomorrow' : 'st-week'
      const claimed = (
        await db.query(
          `INSERT INTO saas_notices (trainer_id, kind, ref) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING trainer_id`,
          [row.id, kind, String(row.expiresAt)],
        )
      ).rows[0]
      if (!claimed) continue
      const trainer = await trainerOf(db, row.trainerId)
      const ok = await notify({
        to: row.email,
        name: row.name,
        subject: left <= DAY ? 'Seu plano vence em menos de 24 horas' : `Seu plano vence em ${Math.ceil(left / DAY)} dias`,
        lines: [
          `Seu plano <strong>${escape(row.planName || '')}</strong> com ${escape(trainer?.brand || trainer?.name || 'seu personal')} vence em <strong>${day(row.expiresAt)}</strong>.`,
          'Renove pela área do aluno para continuar com seus treinos e o acompanhamento sem interrupção.',
        ],
        button: { label: 'Renovar meu plano', url: studentPage(trainer) },
        footer: `${trainer?.brand || trainer?.name || 'Seu personal'} · enviado pela plataforma FARISA.`,
      })
      if (ok) sent[left <= DAY ? 'tomorrow' : 'week'] += 1
      else await db.query('DELETE FROM saas_notices WHERE trainer_id=$1 AND kind=$2 AND ref=$3', [row.id, kind, String(row.expiresAt)])
    }
  } catch (error) {
    console.error('[avisos do aluno]', error?.message)
  }
  return sent
}
