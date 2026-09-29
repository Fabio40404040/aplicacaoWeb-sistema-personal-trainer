// Painel do administrador da plataforma (o dono do SaaS).
// Quem é administrador: os e-mails listados em ADMIN_EMAILS (separados por
// vírgula, no wrangler.jsonc). Sem ADMIN_EMAILS, o administrador é o personal
// dono do site (o primeiro cadastrado).
export async function isPlatformAdmin(db, env, session) {
  const emails = String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  if (emails.length) {
    const trainer = (
      await db.query('SELECT email FROM trainers WHERE id=$1 LIMIT 1', [session.sub])
    ).rows[0]
    return Boolean(trainer && emails.includes(String(trainer.email).toLowerCase()))
  }
  const owner = (await db.query('SELECT id FROM trainers ORDER BY created_at LIMIT 1')).rows[0]
  return owner?.id === session.sub
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
