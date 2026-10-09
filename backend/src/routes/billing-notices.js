// E-mails da assinatura do personal (plano Ilimitado): recibo do pagamento,
// aviso 7 dias e 1 dia antes de vencer, e aviso de que venceu e a conta voltou
// para o Grátis. Cada aviso sai uma vez só (tabela saas_notices, migração 035).
import { isDemoEmail } from '../lib/demo.js'
import { sendNoticeEmail } from '../lib/recovery-email.js'
import { runStudentNotices } from './account-emails.js'

const DAY = 86_400_000
const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const day = (value) =>
  new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Fortaleza' })
const escape = (text) =>
  String(text || '').replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

function page(env, name, lines, button) {
  const site = String(env.PUBLIC_SITE_URL || '').replace(/\/$/u, '')
  const link = `${site}/personal/#assinatura`
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#0f172a;max-width:520px">
<p>Olá, ${escape(String(name || '').split(' ')[0] || 'personal')}.</p>
${lines.map((line) => `<p>${line}</p>`).join('\n')}
<p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#1557f0;color:#ffffff;text-decoration:none;font-weight:700">${button}</a></p>
<p style="font-size:13px;color:#64748b">FARISA · você recebe este e-mail porque tem uma conta de personal na plataforma.</p>
</div>`
}

// Marca o aviso como enviado; devolve false se ele já tinha saído.
async function claim(db, trainerId, kind, ref) {
  const row = (
    await db.query(
      `INSERT INTO saas_notices (trainer_id, kind, ref) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING trainer_id`,
      [trainerId, kind, String(ref)],
    )
  ).rows[0]
  return Boolean(row)
}
// Não saiu (falha no envio): libera para tentar de novo na próxima rodada.
const release = (db, trainerId, kind, ref) =>
  db.query('DELETE FROM saas_notices WHERE trainer_id=$1 AND kind=$2 AND ref=$3', [trainerId, kind, String(ref)])

async function send(env, db, trainer, kind, ref, subject, lines, button) {
  if (!trainer?.email || isDemoEmail(trainer.email)) return false
  if (!(await claim(db, trainer.id, kind, ref))) return false
  let ok = false
  try {
    const response = await sendNoticeEmail(env, { to: trainer.email, subject, html: page(env, trainer.name, lines, button) })
    ok = Boolean(response?.ok)
  } catch {
    ok = false
  }
  if (!ok) await release(db, trainer.id, kind, ref)
  return ok
}

// Recibo: chamado logo depois de um pagamento aprovado.
export async function sendSaasReceipt(env, db, intentId) {
  try {
    const row = (
      await db.query(
        `SELECT i.id, i.amount_cents AS "amountCents", i.method, t.id AS "trainerId", t.name, t.email,
           t.saas_expires_at AS "expiresAt", p.name AS "planName"
         FROM saas_payment_intents i JOIN trainers t ON t.id=i.trainer_id
         LEFT JOIN saas_plans p ON p.code=i.plan_code WHERE i.id=$1 AND i.status='approved'`,
        [intentId],
      )
    ).rows[0]
    if (!row) return
    await send(
      env,
      db,
      { id: row.trainerId, name: row.name, email: row.email },
      'receipt',
      row.id,
      'Pagamento confirmado — FARISA',
      [
        `Recebemos o seu pagamento de <strong>${money(row.amountCents)}</strong> (${row.method === 'pix' ? 'Pix' : 'cartão'}) do plano <strong>${escape(row.planName || 'Ilimitado')}</strong>.`,
        row.expiresAt ? `Seu plano está ativo até <strong>${day(row.expiresAt)}</strong>.` : 'Seu plano já está ativo.',
        'Guarde este e-mail como comprovante.',
      ],
      'Ver minha assinatura',
    )
  } catch (error) {
    console.error('[assinatura] recibo não enviado', error?.message)
  }
}

// Avisos de vencimento. Roda no máximo a cada 6 horas (job_runs).
export async function runBillingNotices(env, db, { force = false } = {}) {
  const now = Date.now()
  try {
    if (!force) {
      const turn = (
        await db.query(
          `INSERT INTO job_runs (name, ran_at) VALUES ('billing-notices', $1)
           ON CONFLICT(name) DO UPDATE SET ran_at=excluded.ran_at WHERE job_runs.ran_at < $2 RETURNING name`,
          [now, now - 6 * 3_600_000],
        )
      ).rows[0]
      if (!turn) return { skipped: true }
    }
    const trainers = (
      await db.query(
        `SELECT t.id, t.name, t.email, t.saas_plan_code AS "planCode", t.saas_expires_at AS "expiresAt",
           p.name AS "planName", p.price_cents AS "priceCents"
         FROM trainers t JOIN saas_plans p ON p.code=t.saas_plan_code
         WHERE t.saas_expires_at IS NOT NULL AND p.price_cents > 0`,
      )
    ).rows
    const free = (await db.query(`SELECT code, student_limit AS "limit" FROM saas_plans WHERE price_cents=0 ORDER BY position LIMIT 1`)).rows[0]
    const sent = { week: 0, tomorrow: 0, expired: 0 }
    for (const trainer of trainers) {
      const expires = Date.parse(trainer.expiresAt)
      if (!Number.isFinite(expires)) continue
      const left = expires - now
      const plan = escape(trainer.planName || 'Ilimitado')
      if (left <= 0) {
        // Venceu: avisa e volta para o Grátis (o mesmo que acontecia ao abrir o
        // painel). Se o e-mail falhar, tenta de novo na próxima rodada.
        const limit = Number(free?.limit) ? `O plano Grátis permite até ${Number(free.limit)} alunos; acima disso, novos alunos não conseguem se cadastrar.` : ''
        const delivered = await send(env, db, trainer, 'expired', trainer.expiresAt, `Seu plano ${trainer.planName || 'Ilimitado'} venceu — FARISA`, [
          `Seu plano <strong>${plan}</strong> venceu em ${day(trainer.expiresAt)} e a sua conta voltou para o plano Grátis.`,
          `Nada foi apagado: seus alunos, treinos e avaliações continuam lá. ${limit}`,
          `Para voltar ao ${plan}, é só renovar por ${money(trainer.priceCents)}.`,
        ], 'Renovar agora')
        const noticed =
          delivered ||
          Boolean(
            (await db.query(`SELECT 1 AS x FROM saas_notices WHERE trainer_id=$1 AND kind='expired' AND ref=$2`, [trainer.id, String(trainer.expiresAt)])).rows[0],
          )
        if (free && noticed)
          await db.query(
            `UPDATE trainers SET saas_plan_code=$2, saas_cycle=NULL, saas_expires_at=NULL WHERE id=$1 AND saas_expires_at=$3`,
            [trainer.id, free.code, trainer.expiresAt],
          )
        if (delivered)
          sent.expired += 1
      } else if (left <= DAY) {
        if (
          await send(env, db, trainer, 'tomorrow', trainer.expiresAt, `Seu plano ${trainer.planName || 'Ilimitado'} vence em menos de 24 horas — FARISA`, [
            `Seu plano <strong>${plan}</strong> vence em <strong>${day(trainer.expiresAt)}</strong>.`,
            `A renovação não é automática. Renove por ${money(trainer.priceCents)} com Pix ou cartão para continuar sem limite de alunos.`,
            'Se não renovar, a conta volta para o plano Grátis e nada é apagado.',
          ], 'Renovar agora')
        )
          sent.tomorrow += 1
      } else if (left <= 7 * DAY) {
        if (
          await send(env, db, trainer, 'week', trainer.expiresAt, `Seu plano ${trainer.planName || 'Ilimitado'} vence em ${Math.ceil(left / DAY)} dias — FARISA`, [
            `Seu plano <strong>${plan}</strong> vence em <strong>${day(trainer.expiresAt)}</strong>.`,
            `A renovação não é automática. Renovando antes do vencimento, o novo período (mês ou ano) é somado ao prazo atual: você não perde nenhum dia.`,
            `Valor: ${money(trainer.priceCents)}, com Pix ou cartão.`,
          ], 'Renovar agora')
        )
          sent.week += 1
      }
    }
    // Mesma rodada: alunos com o acesso para vencer.
    return { sent, students: await runStudentNotices(db) }
  } catch (error) {
    console.error('[assinatura] avisos não processados', error?.message)
    return { error: true }
  }
}
