// Biblioteca FARISA: exercícios (GIF/MP4, nome, grupo, instruções) que o dono
// da plataforma abastece pelo admin e que aparecem para todos os personais.
// Ela é guardada como uma "conta" interna (LIBRARY_ID), sem login próprio: o
// admin abre essa conta no painel do personal e usa as mesmas ferramentas de
// biblioteca (arrastar pastas, conferir, editar). Essa conta fica fora das
// listas, do faturamento e dos limites de plano.
import { createSession } from '../lib/session.js'
import { audit } from './admin.js'

export const LIBRARY_ID = 'farisa-library'
export const LIBRARY_NAME = 'Biblioteca FARISA'

export async function ensureLibraryTrainer(db) {
  const random = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('')
  await db.query(
    `INSERT INTO trainers (id, name, email, password_hash) VALUES ($1,$2,'biblioteca@farisa.internal',$3)
     ON CONFLICT(id) DO NOTHING`,
    // "password_hash" que não é um hash válido: ninguém entra com e-mail e senha.
    [LIBRARY_ID, LIBRARY_NAME, `no-login:${random}`],
  )
  await db.query('UPDATE trainers SET email_verified_at=COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id=$1', [LIBRARY_ID]).catch(() => {})
}

// GIF ou MP4 enviado sozinho na Biblioteca FARISA (aba GIFs/Vídeos) ainda
// não é um exercício — e os personais só veem exercícios. Este botão do admin
// cria um exercício para cada arquivo solto, com o nome e a pasta do arquivo.
// Não mexe no que já existe.
export async function syncLibraryExercises(db) {
  try {
    await db.query(
      `INSERT INTO exercises (trainer_id,name,muscle_group,equipment,difficulty,media_type,gif_id)
       SELECT g.trainer_id, g.name, g.muscle_group, 'Sem equipamento', 'Intermediário', 'gif', g.id
       FROM exercise_gifs g
       WHERE g.trainer_id=$1
         AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.trainer_id=$1 AND e.gif_id=g.id)`,
      [LIBRARY_ID],
    )
  } catch {
    /* sem a tabela de GIFs */
  }
  try {
    // Vídeo enviado pela aba Vídeos: o exercício nasce com o mesmo id do vídeo.
    await db.query(
      `UPDATE exercises SET video_id=id
       WHERE trainer_id=$1 AND video_id IS NULL AND id IN (SELECT id FROM exercise_videos WHERE trainer_id=$1)`,
      [LIBRARY_ID],
    )
    await db.query(
      `INSERT INTO exercises (trainer_id,name,muscle_group,equipment,difficulty,media_type,video_id)
       SELECT v.trainer_id, v.name, v.muscle_group, COALESCE(v.equipment,'Sem equipamento'), COALESCE(v.difficulty,'Intermediário'), 'video', v.id
       FROM exercise_videos v
       WHERE v.trainer_id=$1
         AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.trainer_id=$1 AND (e.video_id=v.id OR e.id=v.id))`,
      [LIBRARY_ID],
    )
  } catch {
    /* sem a coluna video_id */
  }
}

// Números para a aba do admin.
export async function libraryOverview(db) {
  const count = async (sql) => {
    try {
      return Number((await db.query(sql, [LIBRARY_ID])).rows[0]?.n || 0)
    } catch {
      return 0
    }
  }
  const [exercises, gifs, videos, folders, looseGifs, looseVideos] = await Promise.all([
    count('SELECT COUNT(*) AS n FROM exercises WHERE trainer_id=$1'),
    count('SELECT COUNT(*) AS n FROM exercises WHERE trainer_id=$1 AND gif_id IS NOT NULL'),
    count('SELECT COUNT(*) AS n FROM exercises WHERE trainer_id=$1 AND video_id IS NOT NULL'),
    count(
      `SELECT COUNT(DISTINCT muscle_group) AS n FROM exercises WHERE trainer_id=$1 AND muscle_group IS NOT NULL AND muscle_group<>''`,
    ),
    count(
      `SELECT COUNT(*) AS n FROM exercise_gifs g WHERE g.trainer_id=$1
         AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.trainer_id=$1 AND e.gif_id=g.id)`,
    ),
    count(
      `SELECT COUNT(*) AS n FROM exercise_videos v WHERE v.trainer_id=$1
         AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.trainer_id=$1 AND (e.video_id=v.id OR e.id=v.id))`,
    ),
  ])
  return { exercises, gifs, videos, folders, looseGifs, looseVideos }
}

// Abre a Biblioteca FARISA no painel (sessão de 4 horas, registrada).
export async function adminOpenLibrary(env, db, admin) {
  await ensureLibraryTrainer(db)
  const trainer = (
    await db.query('SELECT id, name, email, auth_version FROM trainers WHERE id=$1', [LIBRARY_ID])
  ).rows[0]
  if (!trainer) return { error: 'Não foi possível abrir a Biblioteca FARISA.', status: 500 }
  await audit(db, admin, 'library_opened', { type: 'library', id: LIBRARY_ID, label: LIBRARY_NAME })
  return {
    data: {
      token: await createSession(
        { ...trainer, auth_version: trainer.auth_version || 0 },
        { ...env, SESSION_TTL_SECONDS: 4 * 3600 },
        'coach',
        { support: admin.email || admin.id, library: true },
      ),
      name: LIBRARY_NAME,
    },
  }
}

export async function adminSyncLibrary(db, admin) {
  const before = await libraryOverview(db)
  await syncLibraryExercises(db)
  const after = await libraryOverview(db)
  await audit(db, admin, 'library_synced', { type: 'library', id: LIBRARY_ID, label: LIBRARY_NAME }, `${after.exercises - before.exercises} exercício(s) criados`)
  return { data: { created: after.exercises - before.exercises, ...after } }
}
