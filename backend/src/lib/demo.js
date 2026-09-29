// Contas de demonstração do portfólio (ver backend/demo/demo-seed.sql).
// Qualquer visitante entra nelas, então algumas ações ficam bloqueadas no
// servidor: recuperar/trocar senha, enviar arquivos e fazer pagamentos.
export const DEMO_TRAINER_EMAIL = 'demo@farisa.example'
export const DEMO_STUDENT_EMAIL = 'aluno.demo@farisa.example'

const DEMO_EMAILS = new Set([DEMO_TRAINER_EMAIL, DEMO_STUDENT_EMAIL])

export function isDemoEmail(email) {
  return DEMO_EMAILS.has(String(email || '').trim().toLowerCase())
}

export const demoBlocked = {
  error: 'Este recurso fica desativado na conta de demonstração.',
  status: 403,
}

// Na demo o envio de arquivos funciona, mas com limites, para o visitante
// poder testar sem ocupar o armazenamento. Tudo que for enviado é apagado
// na restauração diária (worker demo-reset).
const DEMO_UPLOAD_LIMITS = {
  'exercise-gifs': { table: 'exercise_gifs', max: 30, megabytes: 4, label: 'GIFs' },
  'exercise-videos': { table: 'exercise_videos', max: 3, megabytes: 20, label: 'vídeos MP4' },
  'ready-workouts': { table: 'ready_workout_pdfs', max: 3, megabytes: 6, label: 'PDFs' },
}

export async function demoUploadCheck(request, db, trainerId, route) {
  const rule = DEMO_UPLOAD_LIMITS[route]
  if (!rule) return null
  const size = Number(request.headers.get('content-length') || 0)
  if (size > rule.megabytes * 1024 * 1024)
    return {
      error: `Na demonstração, cada arquivo pode ter até ${rule.megabytes} MB.`,
      status: 413,
    }
  const count = Number(
    (await db.query(`SELECT count(*) AS total FROM ${rule.table} WHERE trainer_id=$1`, [trainerId]))
      .rows[0]?.total || 0,
  )
  if (count >= rule.max)
    return {
      error: `A demonstração permite até ${rule.max} ${rule.label}. Eles são apagados na restauração diária`,
      status: 429,
    }
  return null
}
