const MAX_PDF_BYTES = 15 * 1024 * 1024

const selectFields = `id,name,goal,level,duration,muscle_groups AS "muscleGroups",description,
  original_filename AS "originalFilename",size_bytes AS "sizeBytes",published,created_at AS "createdAt"`

function storageUnavailable() {
  return {
    error:
      'O armazenamento de arquivos ainda não foi ativado. Habilite o Cloudflare R2 e vincule o bucket MEDIA.',
    status: 503,
  }
}

function fileResponse(object, filename) {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Length', String(object.size))
  headers.set('Cache-Control', 'private, no-store')
  headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  return new Response(object.body, { headers })
}

export async function listReadyWorkouts(db, trainerId) {
  return (
    await db.query(
      `SELECT ${selectFields} FROM ready_workout_pdfs
       WHERE trainer_id=$1 ORDER BY created_at DESC`,
      [trainerId],
    )
  ).rows
}

export async function uploadReadyWorkout(request, env, db, trainerId) {
  if (!env.MEDIA) return storageUnavailable()
  const form = await request.formData()
  const file = form.get('pdf')
  if (!(file instanceof File) || !file.name.toLocaleLowerCase('pt-BR').endsWith('.pdf'))
    return { error: 'Selecione um arquivo PDF válido.', status: 400 }
  if (!file.size || file.size > MAX_PDF_BYTES)
    return { error: 'O PDF deve ter no máximo 15 MB.', status: 400 }

  const name = String(form.get('name') || '').trim()
  const goal = String(form.get('goal') || '').trim()
  const level = String(form.get('level') || '').trim()
  const duration = String(form.get('duration') || '').trim()
  const muscleGroups = String(form.get('muscleGroups') || '').trim()
  const description = String(form.get('description') || '').trim()
  if (!name || !goal || !level || !duration || !muscleGroups)
    return { error: 'Preencha os dados obrigatórios do treino.', status: 400 }

  const bytes = await file.arrayBuffer()
  const signature = new TextDecoder().decode(bytes.slice(0, 5))
  if (signature !== '%PDF-') return { error: 'O arquivo enviado não é um PDF válido.', status: 400 }

  const id = crypto.randomUUID().replaceAll('-', '')
  const objectKey = `trainers/${trainerId}/ready-workouts/${id}.pdf`
  await env.MEDIA.put(objectKey, bytes, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { originalFilename: file.name, trainerId },
  })
  try {
    return (
      await db.query(
        `INSERT INTO ready_workout_pdfs
          (id,trainer_id,name,goal,level,duration,muscle_groups,description,object_key,original_filename,size_bytes,published)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING ${selectFields}`,
        [
          id,
          trainerId,
          name,
          goal,
          level,
          duration,
          muscleGroups,
          description || null,
          objectKey,
          file.name,
          file.size,
          form.get('published') === '1' ? 1 : 0,
        ],
      )
    ).rows[0]
  } catch (error) {
    await env.MEDIA.delete(objectKey)
    throw error
  }
}

export async function deleteReadyWorkout(env, db, trainerId, id) {
  if (!env.MEDIA) return storageUnavailable()
  const row = (
    await db.query(
      'SELECT object_key AS "objectKey" FROM ready_workout_pdfs WHERE id=$1 AND trainer_id=$2 LIMIT 1',
      [id, trainerId],
    )
  ).rows[0]
  if (!row) return { error: 'PDF não encontrado.', status: 404 }
  await env.MEDIA.delete(row.objectKey)
  await db.query('DELETE FROM ready_workout_pdfs WHERE id=$1 AND trainer_id=$2', [id, trainerId])
  return null
}

export async function updateReadyWorkout(db, trainerId, id, body) {
  const published = body?.published === true || body?.published === 1 ? 1 : 0
  const row = (
    await db.query(
      `UPDATE ready_workout_pdfs SET published=$3,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND trainer_id=$2 RETURNING ${selectFields}`,
      [id, trainerId, published],
    )
  ).rows[0]
  return row || { error: 'PDF não encontrado.', status: 404 }
}

export async function trainerReadyWorkoutFile(env, db, trainerId, id) {
  if (!env.MEDIA) return storageUnavailable()
  const row = (
    await db.query(
      `SELECT object_key AS "objectKey",original_filename AS "originalFilename"
       FROM ready_workout_pdfs WHERE id=$1 AND trainer_id=$2 LIMIT 1`,
      [id, trainerId],
    )
  ).rows[0]
  if (!row) return { error: 'PDF não encontrado.', status: 404 }
  const object = await env.MEDIA.get(row.objectKey)
  return object ? fileResponse(object, row.originalFilename) : { error: 'Arquivo não encontrado.', status: 404 }
}

export async function studentReadyWorkoutFile(env, db, accountId, id) {
  if (!env.MEDIA) return storageUnavailable()
  const row = (
    await db.query(
      `SELECT r.object_key AS "objectKey",r.original_filename AS "originalFilename"
       FROM student_accounts a
       JOIN students s ON s.id=a.student_id AND s.account_id=a.id
       JOIN ready_workout_pdfs r ON r.trainer_id=s.trainer_id
       WHERE a.id=$1 AND r.id=$2 AND r.published=1 AND s.plan_code='ready'
         AND s.access_status='active' AND s.payment_status='paid' LIMIT 1`,
      [accountId, id],
    )
  ).rows[0]
  if (!row) return { error: 'PDF indisponível para esta conta.', status: 403 }
  const object = await env.MEDIA.get(row.objectKey)
  return object ? fileResponse(object, row.originalFilename) : { error: 'Arquivo não encontrado.', status: 404 }
}
