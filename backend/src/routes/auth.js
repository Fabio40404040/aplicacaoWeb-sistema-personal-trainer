import { createSession, verifyPassword } from '../lib/session.js'
import { readJson } from '../lib/http.js'

export async function login(request, env, db) {
  const { email, password, remember } = await readJson(request)
  if (typeof email !== 'string' || typeof password !== 'string')
    return { error: 'Credenciais inválidas.', status: 400 }
  const result = await db.query(
    'SELECT id, name, email, password_hash, auth_version FROM trainers WHERE lower(email) = lower($1) LIMIT 1',
    [email.trim()],
  )
  const trainer = result.rows[0]
  if (!trainer || !(await verifyPassword(password, trainer.password_hash)))
    return { error: 'E-mail ou senha incorretos.', status: 401 }
  // Conta bloqueada pelo dono da plataforma (migração 026).
  const blocked = await db
    .query('SELECT status, blocked_reason AS reason FROM trainers WHERE id=$1', [trainer.id])
    .then((result) => result.rows[0])
    .catch(() => null)
  if (blocked?.status === 'blocked')
    return {
      error: `Conta bloqueada${blocked.reason ? `: ${blocked.reason}` : ''}. Fale com o suporte FARISA.`,
      status: 403,
    }
  // Último acesso (migração 020). Sem a migração, o login segue normal.
  try {
    await db.query('UPDATE trainers SET last_login_at=CURRENT_TIMESTAMP WHERE id=$1', [trainer.id])
  } catch {
    /* coluna ainda não existe */
  }
  // "Lembrar de mim": sessão de 30 dias neste aparelho (Sair encerra antes).
  const keep = remember === true || remember === 'on' || remember === 'true'
  return {
    data: {
      token: await createSession(trainer, env, 'coach', {}, keep ? 30 * 86_400 : 0),
      remember: keep,
      user: { id: trainer.id, name: trainer.name, email: trainer.email },
    },
  }
}
