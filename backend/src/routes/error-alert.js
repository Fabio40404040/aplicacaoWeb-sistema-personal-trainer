// Aviso de erros por e-mail ao administrador: no máximo um resumo por hora,
// só quando apareceu erro novo em Admin → Registro de ações → Erros do sistema.
// Roda junto com as visitas ao site e com o agendador (sem custo extra).
import { escape } from '../lib/notify.js'
import { hasRecoveryEmailProvider, sendNoticeEmail } from '../lib/recovery-email.js'

const HOUR = 3_600_000

export async function runErrorAlert(env, db) {
  if (!hasRecoveryEmailProvider(env)) return
  const now = Date.now()
  try {
    const previous = Number(
      (await db.query("SELECT ran_at FROM job_runs WHERE name='error-alert'")).rows[0]?.ran_at || now - HOUR,
    )
    // Só uma execução por hora (mesmo com várias visitas ao mesmo tempo).
    const turn = (
      await db.query(
        `INSERT INTO job_runs (name, ran_at) VALUES ('error-alert', $1)
         ON CONFLICT(name) DO UPDATE SET ran_at=excluded.ran_at WHERE job_runs.ran_at < $2 RETURNING name`,
        [now, now - HOUR],
      )
    ).rows[0]
    if (!turn) return
    const since = new Date(previous).toISOString().slice(0, 19).replace('T', ' ')
    const rows = (
      await db.query(
        `SELECT route, message, created_at AS "createdAt" FROM error_log WHERE created_at > $1 ORDER BY id DESC LIMIT 20`,
        [since],
      )
    ).rows
    if (!rows.length) return
    const total = Number(
      (await db.query('SELECT COUNT(*) AS n FROM error_log WHERE created_at > $1', [since])).rows[0]?.n || rows.length,
    )
    const site = String(env.PUBLIC_API_URL || 'https://farisafit.com.br').replace(/\/$/u, '')
    const list = rows
      .map((row) => `<li style="margin:4px 0"><b>${escape(row.route || '')}</b> · ${escape(String(row.message || '').slice(0, 200))}</li>`)
      .join('')
    const admins = (await db.query('SELECT email FROM platform_admins')).rows
    for (const admin of admins)
      await sendNoticeEmail(env, {
        to: admin.email,
        subject: `FARISA: ${total} erro(s) novo(s) no sistema`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18212d">
          <h1 style="font-size:20px">${total} erro(s) novo(s) na última hora</h1>
          <ul style="padding-left:18px">${list}</ul>
          ${total > rows.length ? `<p>E mais ${total - rows.length}.</p>` : ''}
          <p><a href="${site}/admin/" style="display:inline-block;background:#1c67db;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir Erros do sistema</a></p>
          <p style="color:#64748b;font-size:12px">Admin → Registro de ações → Erros do sistema. Você recebe no máximo um resumo por hora.</p>
        </div>`,
      }).catch(() => {})
  } catch (error) {
    console.error('[erros] aviso não enviado', error?.message)
  }
}
