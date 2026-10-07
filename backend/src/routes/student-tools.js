// Ferramentas do aluno: evolução da carga, calendário de treinos concluídos
// (com recado opcional para o personal) e consumo de água.
// Tudo tolera a falta da migração 038: sem as tabelas, as ferramentas somem.

let ready = null;
export async function toolsReady(db) {
  if (ready) return true;
  try {
    await db.query("SELECT 1 FROM training_days LIMIT 1");
    await db.query("SELECT 1 FROM exercise_load_history LIMIT 1");
    await db.query("SELECT 1 FROM water_log LIMIT 1");
    await db.query("SELECT 1 FROM student_tool_prefs LIMIT 1");
    ready = true;
  } catch {
    ready = false;
  }
  return ready;
}

// Guarda cada mudança de carga. Na primeira mudança registrada, guarda também
// a carga que havia antes, para a evolução não começar pela metade.
export async function recordLoad(db, workoutId, exerciseId, load, by, before) {
  if (!load || load === (before?.load || "")) return;
  try {
    if (!(await toolsReady(db))) return;
    const now = new Date().toISOString();
    if (before?.load) {
      const has = (
        await db.query(
          "SELECT 1 AS x FROM exercise_load_history WHERE workout_id=$1 AND exercise_id=$2 LIMIT 1",
          [workoutId, exerciseId],
        )
      ).rows[0];
      if (!has)
        await db.query(
          "INSERT INTO exercise_load_history (workout_id,exercise_id,load,changed_by,created_at) VALUES ($1,$2,$3,$4,$5)",
          [workoutId, exerciseId, before.load, before.loadBy || "trainer", before.loadAt || now],
        );
    }
    await db.query(
      "INSERT INTO exercise_load_history (workout_id,exercise_id,load,changed_by,created_at) VALUES ($1,$2,$3,$4,$5)",
      [workoutId, exerciseId, load, by, now],
    );
  } catch {
    /* o histórico nunca impede salvar a carga */
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const dayOffset = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
// O dia vem do relógio do aluno (fuso dele): aceita até amanhã no horário do
// servidor e, para trás, o limite informado.
const validDay = (day, back) => DAY.test(String(day || "")) && day <= dayOffset(1) && day >= dayOffset(-back);

async function studentOf(db, accountId) {
  return (
    await db.query(
      `SELECT s.id, s.trainer_id AS "trainerId", s.access_status AS "accessStatus"
       FROM student_accounts a JOIN students s ON s.id=a.student_id WHERE a.id=$1 LIMIT 1`,
      [accountId],
    )
  ).rows[0];
}

function defaultGoal(weightKg) {
  const weight = Number(weightKg);
  if (!(weight >= 30 && weight <= 250)) return 2000;
  return Math.round((weight * 35) / 100) * 100;
}

// Vai junto com os dados da área do aluno (student/me).
export async function studentTools(db, studentId, workoutIds = [], latestWeightKg = null) {
  if (!studentId || !(await toolsReady(db))) return { ready: false };
  try {
    const days = (
      await db.query(
        `SELECT day, note FROM training_days WHERE student_id=$1 AND day >= $2 ORDER BY day`,
        [studentId, dayOffset(-400)],
      )
    ).rows;
    const water = (
      await db.query(`SELECT day, ml FROM water_log WHERE student_id=$1 AND day >= $2 ORDER BY day`, [
        studentId,
        dayOffset(-8),
      ])
    ).rows;
    // Tamanhos do copo e da garrafa: só depois da migração 040.
    let sizesReady = true;
    const prefs = (
      await db
        .query(`SELECT water_goal_ml AS "goalMl", cup_ml AS "cupMl", bottle_ml AS "bottleMl" FROM student_tool_prefs WHERE student_id=$1`, [studentId])
        .catch(() => {
          sizesReady = false;
          return db.query(`SELECT water_goal_ml AS "goalMl" FROM student_tool_prefs WHERE student_id=$1`, [studentId]);
        })
    ).rows[0];
    const loadHistory = {};
    for (const workoutId of workoutIds.slice(0, 20)) {
      (
        await db.query(
          `SELECT exercise_id AS "exerciseId", load, changed_by AS "by", created_at AS "at"
           FROM exercise_load_history WHERE workout_id=$1 ORDER BY created_at, id LIMIT 1500`,
          [workoutId],
        )
      ).rows.forEach((row) => {
        (loadHistory[`${workoutId}:${row.exerciseId}`] ||= []).push({ load: row.load, by: row.by, at: row.at });
      });
    }
    return {
      ready: true,
      days,
      water: {
        goalMl: Number(prefs?.goalMl) || defaultGoal(latestWeightKg),
        customGoal: Boolean(prefs?.goalMl),
        sizesReady,
        cupMl: Number(prefs?.cupMl) || 200,
        bottleMl: Number(prefs?.bottleMl) || 500,
        days: Object.fromEntries(water.map((row) => [row.day, Number(row.ml) || 0])),
      },
      loadHistory,
    };
  } catch {
    return { ready: false };
  }
}

// Marca ou desmarca um dia de treino. O recado (opcional) vai para o personal.
export async function setTrainingDay(db, accountId, body) {
  if (!(await toolsReady(db))) return { error: "O calendário ainda não está disponível.", status: 503 };
  const student = await studentOf(db, accountId);
  if (!student) return { error: "Conta sem acesso ativo.", status: 403 };
  const day = String(body?.day || "");
  if (!validDay(day, 60)) return { error: "Escolha hoje ou um dia dos últimos 60 dias.", status: 400 };
  if (body?.done === false) {
    await db.query("DELETE FROM training_days WHERE student_id=$1 AND day=$2", [student.id, day]);
    return { data: { day, done: false } };
  }
  const note = String(body?.note ?? "").trim().slice(0, 300) || null;
  await db.query(
    `INSERT INTO training_days (student_id, trainer_id, day, note, created_at) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (student_id, day) DO UPDATE SET note=COALESCE(excluded.note, training_days.note),
       created_at=CASE WHEN excluded.note IS NULL THEN training_days.created_at ELSE excluded.created_at END`,
    [student.id, student.trainerId, day, note, new Date().toISOString()],
  );
  return { data: { day, done: true, note } };
}

// Total de água do dia (valor absoluto) e, se vier, a meta diária.
export async function setWater(db, accountId, body) {
  if (!(await toolsReady(db))) return { error: "O controle de água ainda não está disponível.", status: 503 };
  const student = await studentOf(db, accountId);
  if (!student) return { error: "Conta sem acesso ativo.", status: 403 };
  const result = {};
  if (body?.goalMl !== undefined) {
    const goal = Math.round(Number(body.goalMl));
    if (!(goal >= 500 && goal <= 8000)) return { error: "A meta deve ficar entre 500 ml e 8 litros.", status: 400 };
    await db.query(
      `INSERT INTO student_tool_prefs (student_id, water_goal_ml) VALUES ($1,$2)
       ON CONFLICT (student_id) DO UPDATE SET water_goal_ml=excluded.water_goal_ml`,
      [student.id, goal],
    );
    result.goalMl = goal;
  }
  if (body?.cupMl !== undefined || body?.bottleMl !== undefined) {
    const cup = Math.round(Number(body.cupMl));
    const bottle = Math.round(Number(body.bottleMl));
    if (!(cup >= 50 && cup <= 3000) || !(bottle >= 50 && bottle <= 3000))
      return { error: "O copo e a garrafa devem ter entre 50 ml e 3 litros.", status: 400 };
    try {
      await db.query(
        `INSERT INTO student_tool_prefs (student_id, cup_ml, bottle_ml) VALUES ($1,$2,$3)
         ON CONFLICT (student_id) DO UPDATE SET cup_ml=excluded.cup_ml, bottle_ml=excluded.bottle_ml`,
        [student.id, cup, bottle],
      );
    } catch {
      return { error: "Ainda não dá para mudar o tamanho do copo e da garrafa.", status: 503 };
    }
    Object.assign(result, { cupMl: cup, bottleMl: bottle });
  }
  if (body?.ml !== undefined) {
    const day = String(body?.day || "");
    if (!validDay(day, 2)) return { error: "Só dá para anotar a água de hoje.", status: 400 };
    const ml = Math.max(0, Math.min(15000, Math.round(Number(body.ml)) || 0));
    await db.query(
      `INSERT INTO water_log (student_id, day, ml) VALUES ($1,$2,$3)
       ON CONFLICT (student_id, day) DO UPDATE SET ml=excluded.ml`,
      [student.id, day, ml],
    );
    Object.assign(result, { day, ml });
  }
  return { data: result };
}

// Para o painel do personal: recados recentes e evolução das cargas.
export async function trainerToolsData(db, trainerId) {
  if (!(await toolsReady(db))) return { trainingNotes: [], loadHistory: {} };
  try {
    const trainingNotes = (
      await db.query(
        `SELECT t.student_id AS "studentId", s.name AS student, t.day, t.note, t.created_at AS "createdAt"
         FROM training_days t JOIN students s ON s.id=t.student_id
         WHERE t.trainer_id=$1 AND t.note IS NOT NULL AND t.created_at >= $2 ORDER BY t.created_at DESC LIMIT 100`,
        [trainerId, new Date(Date.now() - 14 * 86_400_000).toISOString()],
      )
    ).rows;
    const loadHistory = {};
    (
      await db.query(
        `SELECT h.workout_id AS "workoutId", h.exercise_id AS "exerciseId", h.load, h.changed_by AS "by", h.created_at AS "at"
         FROM exercise_load_history h JOIN workouts w ON w.id=h.workout_id
         WHERE w.trainer_id=$1 ORDER BY h.created_at, h.id LIMIT 5000`,
        [trainerId],
      )
    ).rows.forEach((row) => {
      (loadHistory[`${row.workoutId}:${row.exerciseId}`] ||= []).push({ load: row.load, by: row.by, at: row.at });
    });
    return { trainingNotes, loadHistory };
  } catch {
    return { trainingNotes: [], loadHistory: {} };
  }
}
