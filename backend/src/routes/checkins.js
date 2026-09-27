// Resposta do personal a um check-in semanal do aluno. O aluno vê a
// resposta na área dele (e o sininho avisa "O personal respondeu").
export async function answerCheckin(db, trainerId, checkinId, body) {
  const feedback = String(body?.feedback ?? '').trim()
  if (feedback.length > 2000)
    return { error: 'A resposta pode ter no máximo 2000 caracteres.', status: 400 }
  const result = await db.query(
    `UPDATE checkins SET trainer_feedback=$3 WHERE id=$2 AND trainer_id=$1
     RETURNING id, trainer_feedback AS "trainerFeedback"`,
    [trainerId, checkinId, feedback || null],
  )
  if (!result.rows.length) return { error: 'Check-in não encontrado.', status: 404 }
  return { data: result.rows[0] }
}
