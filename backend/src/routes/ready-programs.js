import { trainerExerciseGifFile } from "./exercise-gifs.js";

function normalizePrescriptions(body) {
  const items = Array.isArray(body?.exercisePrescriptions)
    ? body.exercisePrescriptions
    : [];
  return items
    .filter((item) => item?.exerciseId)
    .filter(
      (item, index) =>
        items.findIndex(
          (candidate) => candidate?.exerciseId === item.exerciseId,
        ) === index,
    )
    .map((item, index) => ({
      exerciseId: String(item.exerciseId),
      position: index + 1,
      sessionLabel: /^[A-Z]$/u.test(
        String(item.sessionLabel || "").toUpperCase(),
      )
        ? String(item.sessionLabel).toUpperCase()
        : "A",
      sets: Math.max(1, Math.min(20, Number(item.sets) || 3)),
      repetitions: String(item.repetitions || "10-12").slice(0, 40),
      restSeconds: Math.max(0, Math.min(1800, Number(item.restSeconds) || 0)),
      notes:
        String(item.notes || "")
          .trim()
          .slice(0, 500) || null,
    }));
}

async function saveExercises(db, trainerId, programId, body) {
  const items = normalizePrescriptions(body);
  const queries = [
    {
      sql: "DELETE FROM ready_program_exercises WHERE program_id=$1",
      values: [programId],
    },
  ];
  items.forEach((item) =>
    queries.push({
      sql: `INSERT INTO ready_program_exercises
        (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds,notes)
        SELECT $1,id,$2,$3,$4,$5,$6,$7 FROM exercises WHERE id=$8 AND trainer_id=$9`,
      values: [
        programId,
        item.position,
        item.sessionLabel,
        item.sets,
        item.repetitions,
        item.restSeconds,
        item.notes,
        item.exerciseId,
        trainerId,
      ],
    }),
  );
  await db.batch(queries);
}

export async function createReadyProgram(db, trainerId, body) {
  const id = crypto.randomUUID();
  const name = String(body?.name || "").trim();
  if (!name) return { error: "Informe o nome do treino pronto.", status: 400 };
  const items = normalizePrescriptions(body);
  if (!items.length)
    return { error: "Adicione pelo menos um exercício.", status: 400 };
  const row = (
    await db.query(
      `INSERT INTO ready_workout_programs
       (id,trainer_id,name,goal,level,duration,description,color_theme,published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id,name,goal,level,duration,description,color_theme AS "colorTheme",published`,
      [
        id,
        trainerId,
        name,
        String(body.goal || "Hipertrofia"),
        String(body.level || "Intermediário"),
        String(body.duration || "8 semanas"),
        String(body.description || "").trim() || null,
        String(body.colorTheme || "blue"),
        body.published ? 1 : 0,
      ],
    )
  ).rows[0];
  await saveExercises(db, trainerId, id, body);
  return row;
}

export async function updateReadyProgram(db, trainerId, id, body) {
  const row = (
    await db.query(
      `UPDATE ready_workout_programs SET name=$3,goal=$4,level=$5,duration=$6,description=$7,
       color_theme=$8,published=$9,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND trainer_id=$1 RETURNING id`,
      [
        trainerId,
        id,
        String(body?.name || "").trim(),
        String(body?.goal || "Hipertrofia"),
        String(body?.level || "Intermediário"),
        String(body?.duration || "8 semanas"),
        String(body?.description || "").trim() || null,
        String(body?.colorTheme || "blue"),
        body?.published ? 1 : 0,
      ],
    )
  ).rows[0];
  if (!row) return { error: "Treino pronto não encontrado.", status: 404 };
  await saveExercises(db, trainerId, id, body);
  return row;
}

export async function deleteReadyProgram(db, trainerId, id) {
  const result = await db.query(
    "DELETE FROM ready_workout_programs WHERE id=$1 AND trainer_id=$2 RETURNING id",
    [id, trainerId],
  );
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Prévia do site: o card "Treinos Prontos" mostra um treino marcado pelo
// personal. Depende da migração 019; sem ela, o site usa o PDF fixo.
async function sitePreviewReady(db) {
  try {
    await db.query("SELECT is_site_preview FROM ready_workout_programs LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

export async function setReadyProgramSitePreview(db, trainerId, id, body) {
  if (!(await sitePreviewReady(db)))
    return {
      error: "Rode a migração 019 (npm run db:migrate:local / db:migrate:remote).",
      status: 503,
    };
  const enabled = Boolean(body?.enabled);
  const exists = (
    await db.query(
      "SELECT id FROM ready_workout_programs WHERE id=$1 AND trainer_id=$2 LIMIT 1",
      [id, trainerId],
    )
  ).rows[0];
  if (!exists) return { error: "Treino pronto não encontrado.", status: 404 };
  const queries = [
    {
      sql: "UPDATE ready_workout_programs SET is_site_preview=0 WHERE trainer_id=$1",
      values: [trainerId],
    },
  ];
  if (enabled)
    queries.push({
      sql: "UPDATE ready_workout_programs SET is_site_preview=1 WHERE id=$1 AND trainer_id=$2",
      values: [id, trainerId],
    });
  await db.batch(queries);
  // Só o personal dono do site (o primeiro cadastrado) muda a prévia pública.
  // Na conta demo a marcação funciona no painel, mas o site não muda.
  const owner = (await db.query("SELECT id FROM trainers ORDER BY created_at LIMIT 1")).rows[0];
  return { data: { id, sitePreview: enabled, affectsSite: owner?.id === trainerId } };
}

async function gifColumnReady(db) {
  try {
    await db.query("SELECT gif_id FROM exercises LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

// Quadro parado do GIF de um exercício da prévia (para a foto no PDF).
// Só entrega GIFs usados no treino marcado como prévia do dono do site.
export async function publicReadyPreviewFrame(env, db, gifId) {
  if (!gifId || !/^[a-f0-9-]{16,40}$/u.test(gifId) || !(await sitePreviewReady(db)))
    return { error: "Arquivo não encontrado.", status: 404 };
  const owner = (await db.query("SELECT id FROM trainers ORDER BY created_at LIMIT 1")).rows[0];
  if (!owner) return { error: "Arquivo não encontrado.", status: 404 };
  const used = (
    await db.query(
      `SELECT 1 FROM ready_workout_programs p
       JOIN ready_program_exercises r ON r.program_id=p.id
       JOIN exercises e ON e.id=r.exercise_id
       WHERE p.trainer_id=$1 AND p.is_site_preview=1 AND e.gif_id=$2 LIMIT 1`,
      [owner.id, gifId],
    )
  ).rows[0];
  if (!used) return { error: "Arquivo não encontrado.", status: 404 };
  return trainerExerciseGifFile(env, db, owner.id, gifId, "frame");
}

// Rota pública (sem login): devolve só o treino marcado como prévia pelo
// personal dono do site (o primeiro cadastrado, o mesmo que recebe os
// cadastros de alunos). Nada de GIFs, e-mails ou outros treinos.
export async function publicReadyPreview(db) {
  if (!(await sitePreviewReady(db))) return { data: null };
  const program = (
    await db.query(
      `SELECT p.id,p.name,p.goal,p.level,p.duration,p.description,p.color_theme AS "colorTheme"
       FROM ready_workout_programs p
       WHERE p.is_site_preview=1
         AND p.trainer_id=(SELECT id FROM trainers ORDER BY created_at LIMIT 1)
       LIMIT 1`,
    )
  ).rows[0];
  if (!program) return { data: null };
  program.exercises = (
    await db.query(
      `SELECT e.name,e.muscle_group AS "group",e.equipment,e.instructions,e.difficulty,
         ${(await gifColumnReady(db)) ? 'e.gif_id AS "gifId",' : ""}
         r.position,r.sets,r.repetitions,r.rest_seconds AS "restSeconds",r.notes,
         r.session_label AS "sessionLabel"
       FROM ready_program_exercises r JOIN exercises e ON e.id=r.exercise_id
       WHERE r.program_id=$1 ORDER BY r.position`,
      [program.id],
    )
  ).rows;
  delete program.id;
  return { data: program };
}
