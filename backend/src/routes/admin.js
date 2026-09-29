// Área do administrador da plataforma (o dono do SaaS), em /admin.
// A conta de administrador fica na tabela platform_admins, separada das
// contas de personal. As rotas /api/admin/* só aceitam sessão com papel
// "admin" (criada por adminLogin) — sessão de personal ou aluno é recusada.
import { createSession, verifyPassword } from '../lib/session.js'
import { readJson } from '../lib/http.js'

export async function adminLogin(request, env, db) {
  const { email, password } = await readJson(request)
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
  for (const sql of queries) {
    try {
      const rows = (await db.query(sql)).rows
      return rows.map((row, index) => ({
        ...row,
        students: Number(row.students || 0),
        activeStudents: Number(row.activeStudents || 0),
        workouts: Number(row.workouts || 0),
        isOwner: index === 0,
      }))
    } catch {
      /* tenta a próxima versão da consulta */
    }
  }
  return []
}
