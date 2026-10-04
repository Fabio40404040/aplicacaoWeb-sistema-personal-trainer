// Demonstração aberta na página principal: o visitante entra, sem cadastro,
// no painel de um personal fictício e no app de um aluno fictício (dados de
// backend/demo/demo-seed.sql). As sessões são de leitura: nada é gravado.
import { DEMO_STUDENT_EMAIL, DEMO_TRAINER_EMAIL } from '../lib/demo.js'
import { createSession } from '../lib/session.js'

const unavailable = { error: 'A demonstração está sendo preparada. Tente de novo em instantes.', status: 503 }

// Mantém a demonstração "em dia" sozinha: as datas dos dados fictícios
// (agenda, check-ins, avaliações, vencimentos) andam junto com o calendário.
// O marcador é a data de atualização da página /p/demo.
const DEMO_ID = 'demo-trainer'
async function refreshDemoDates(db) {
  const marker = (
    await db.query(
      `SELECT CAST(julianday('now') - julianday(updated_at) AS INTEGER) AS days FROM trainer_site WHERE trainer_id=$1`,
      [DEMO_ID],
    )
  ).rows[0]
  const days = Number(marker?.days || 0)
  if (days < 1) return
  const shift = `+${days} days`
  const moved = (column) => `${column}=datetime(${column}, $2)`
  const iso = (column) => `${column}=strftime('%Y-%m-%dT%H:%M:00.000Z', ${column}, $2)`
  const values = [DEMO_ID, shift]
  await db.batch([
    {
      sql: `UPDATE students SET assessment_date=date(assessment_date, $2), ${moved('access_expires_at')},
              ${moved('authorized_at')}, ${moved('created_at')}, ${moved('updated_at')} WHERE trainer_id=$1`,
      values,
    },
    { sql: `UPDATE workouts SET ${moved('published_at')}, ${moved('created_at')}, ${moved('updated_at')} WHERE trainer_id=$1`, values },
    { sql: `UPDATE assessments SET ${moved('published_at')}, ${moved('assessed_at')} WHERE trainer_id=$1`, values },
    { sql: `UPDATE checkins SET ${moved('created_at')} WHERE trainer_id=$1`, values },
    { sql: `UPDATE appointments SET ${iso('starts_at')}, ${iso('ends_at')} WHERE trainer_id=$1`, values },
    { sql: `UPDATE payments SET ${moved('paid_at')}, ${moved('created_at')} WHERE trainer_id=$1`, values },
    { sql: `UPDATE trainer_site SET ${moved('updated_at')} WHERE trainer_id=$1`, values },
  ])
}

export async function demoSession(env, db, kind) {
  try {
    await refreshDemoDates(db)
  } catch (error) {
    console.error('[demo] não foi possível atualizar as datas', error?.message)
  }
  if (kind === 'trainer') {
    const trainer = (
      await db.query('SELECT id, name, email, auth_version FROM trainers WHERE lower(email)=$1 LIMIT 1', [DEMO_TRAINER_EMAIL])
    ).rows[0]
    if (!trainer) return unavailable
    return {
      data: {
        token: await createSession(trainer, env, 'coach', { demo: true }),
        user: { id: trainer.id, name: trainer.name, email: trainer.email },
      },
    }
  }
  if (kind === 'student') {
    const account = (
      await db.query(
        'SELECT id, name, email, auth_version FROM student_accounts WHERE lower(email)=$1 LIMIT 1',
        [DEMO_STUDENT_EMAIL],
      )
    ).rows[0]
    if (!account) return unavailable
    return {
      data: {
        token: await createSession(account, env, 'student', { demo: true }),
        user: { id: account.id, name: account.name, email: account.email },
      },
    }
  }
  return { error: 'Rota não encontrada.', status: 404 }
}
