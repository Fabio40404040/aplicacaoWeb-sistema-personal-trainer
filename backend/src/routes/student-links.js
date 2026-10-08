// Um aluno, vários personais. A conta de login (student_accounts) é uma só;
// cada personal tem o seu cadastro do aluno (students.account_id aponta para a
// conta). O personal "ativo" é o de student_accounts.student_id/trainer_id:
// é ele que a área do aluno mostra. Trocar de personal = trocar o ativo.

// A coluna students.account_seen chegou na migração 044.
export async function linkSeenReady(db) {
  try {
    await db.query('SELECT account_seen FROM students LIMIT 1')
    return true
  } catch {
    return false
  }
}

// Personal adicionou um aluno que já tinha conta: a foto do aluno fica oculta
// para ele até o aluno entrar na página desse personal.
export async function markLinkUnseen(db, studentId) {
  await db.query('UPDATE students SET account_seen=0 WHERE id=$1', [studentId]).catch(() => {})
}

// Personais ligados à conta (para o seletor "Meus personais").
export async function linkedTrainers(db, accountId) {
  try {
    return (
      await db.query(
        `SELECT s.id AS "studentId", s.trainer_id AS "trainerId", t.name AS "trainerName",
           ts.slug, ts.brand_mark AS "brandMark", ts.brand_name AS "brandName",
           s.access_status AS "accessStatus", s.payment_status AS "paymentStatus",
           (a.student_id = s.id) AS active
         FROM students s
         JOIN student_accounts a ON a.id=s.account_id
         JOIN trainers t ON t.id=s.trainer_id
         LEFT JOIN trainer_site ts ON ts.trainer_id=s.trainer_id
         WHERE s.account_id=$1 ORDER BY s.created_at`,
        [accountId],
      )
    ).rows.map((row) => ({ ...row, active: Boolean(row.active) }))
  } catch {
    return []
  }
}

// Deixa ativo o cadastro do aluno com este personal (se existir).
export async function activateTrainer(db, accountId, trainerId) {
  if (!accountId || !trainerId) return false
  const row = (
    await db.query('SELECT id FROM students WHERE account_id=$1 AND trainer_id=$2 LIMIT 1', [accountId, trainerId])
  ).rows[0]
  if (!row) return false
  await db.query('UPDATE student_accounts SET student_id=$2, trainer_id=$3 WHERE id=$1', [accountId, row.id, trainerId])
  await db.query('UPDATE students SET account_seen=1 WHERE id=$1', [row.id]).catch(() => {})
  return true
}

// Aluno escolhe outro personal na área dele.
export async function switchTrainer(db, accountId, body) {
  const trainerId = String(body?.trainerId || '')
  if (!(await activateTrainer(db, accountId, trainerId)))
    return { error: 'Você não tem cadastro com este personal.', status: 404 }
  const slug = (await db.query('SELECT slug FROM trainer_site WHERE trainer_id=$1', [trainerId]).catch(() => ({ rows: [] })))
    .rows[0]?.slug
  return { data: { trainerId, slug: slug || null } }
}

// Antes de apagar o cadastro de um aluno: se a conta dele também é usada com
// outro personal, ela fica (só passa a apontar para o outro); senão é apagada.
// Devolve a consulta que apaga a conta, ou null quando ela deve ficar.
export async function detachStudent(db, studentId) {
  const student = (
    await db.query('SELECT account_id AS "accountId" FROM students WHERE id=$1', [studentId])
  ).rows[0]
  if (!student?.accountId) return null
  const other = (
    await db.query('SELECT id, trainer_id AS "trainerId" FROM students WHERE account_id=$1 AND id<>$2 ORDER BY created_at LIMIT 1', [
      student.accountId,
      studentId,
    ])
  ).rows[0]
  if (!other) return { sql: 'DELETE FROM student_accounts WHERE id=$1', values: [student.accountId] }
  await db.query(
    `UPDATE student_accounts SET student_id=$2, trainer_id=$3 WHERE id=$1 AND (student_id=$4 OR student_id IS NULL)`,
    [student.accountId, other.id, other.trainerId, studentId],
  )
  return null
}
