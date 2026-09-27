import { createSession, verifyPassword } from '../lib/session.js'
import { readJson } from '../lib/http.js'

export async function login(request, env, db) {
  const { email, password } = await readJson(request)
  if (typeof email !== 'string' || typeof password !== 'string')
    return { error: 'Credenciais inválidas.', status: 400 }
  const result = await db.query(
    'SELECT id, name, email, password_hash, auth_version FROM trainers WHERE lower(email) = lower($1) LIMIT 1',
    [email.trim()],
  )
  const trainer = result.rows[0]
  if (!trainer || !(await verifyPassword(password, trainer.password_hash)))
    return { error: 'E-mail ou senha incorretos.', status: 401 }
  return {
    data: {
      token: await createSession(trainer, env),
      user: { id: trainer.id, name: trainer.name, email: trainer.email },
    },
  }
}
