// LGPD: o aluno pode excluir a própria conta e todos os dados (ficha,
// avaliações, check-ins, agenda, pagamentos registrados aqui). O registro
// do pagamento continua no Mercado Pago, como exige a lei fiscal.
import { verifyPassword } from '../lib/session.js'
import { sendNoticeEmail } from '../lib/recovery-email.js'

export async function deleteStudentAccount(env, db, accountId, body) {
  const account = (
    await db.query(
      `SELECT a.id, a.password_hash, a.student_id AS "studentId", a.trainer_id AS "trainerId", a.name,
         t.email AS "trainerEmail"
       FROM student_accounts a LEFT JOIN trainers t ON t.id=a.trainer_id WHERE a.id=$1 LIMIT 1`,
      [accountId],
    )
  ).rows[0]
  if (!account) return { error: 'Conta não encontrada.', status: 404 }
  if (typeof body?.password !== 'string' || !(await verifyPassword(body.password, account.password_hash)))
    return { error: 'Senha incorreta.', status: 401 }
  if (body?.confirm !== 'EXCLUIR')
    return { error: 'Digite EXCLUIR para confirmar.', status: 400 }
  const queries = [{ sql: 'DELETE FROM student_accounts WHERE id=$1', values: [account.id] }]
  // ON DELETE CASCADE em students apaga fichas, avaliações, check-ins, agenda e pagamentos.
  // Todos os cadastros ligados à conta (com todos os personais).
  queries.unshift({ sql: 'DELETE FROM students WHERE account_id=$1', values: [account.id] })
  if (account.studentId)
    queries.unshift({ sql: 'DELETE FROM students WHERE id=$1', values: [account.studentId] })
  await db.batch(queries)
  try {
    await db.query("INSERT INTO privacy_events (trainer_id, kind) VALUES ($1,'student_self_deleted')", [
      account.trainerId,
    ])
  } catch {
    /* sem a migração 026 */
  }
  if (account.trainerEmail)
    try {
      await sendNoticeEmail(env, {
        to: account.trainerEmail,
        subject: 'Um aluno excluiu a própria conta',
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18212d">
          <p>Um aluno usou o direito de exclusão de dados (LGPD) e apagou a conta no FARISA.</p>
          <p>Os dados dele (ficha, avaliações, check-ins e agenda) foram removidos da plataforma.</p></div>`,
      })
    } catch {
      /* aviso opcional */
    }
  return { data: { deleted: true } }
}
