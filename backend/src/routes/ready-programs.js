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
        String(body.colorTheme || "red"),
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
        String(body?.colorTheme || "red"),
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
