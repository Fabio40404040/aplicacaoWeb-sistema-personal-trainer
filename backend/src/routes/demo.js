// Demonstração aberta na página principal: o visitante entra, sem cadastro,
// no painel de um personal fictício e no app de um aluno fictício (dados de
// backend/demo/demo-seed.sql). As sessões são de leitura: nada é gravado.
import { DEMO_STUDENT_EMAIL, DEMO_TRAINER_EMAIL } from '../lib/demo.js'
import { createSession } from '../lib/session.js'

const unavailable = { error: 'A demonstração está sendo preparada. Tente de novo em instantes.', status: 503 }

export async function demoSession(env, db, kind) {
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
