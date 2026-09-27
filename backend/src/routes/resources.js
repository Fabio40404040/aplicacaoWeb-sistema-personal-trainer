import { hashPassword, isStrongPassword } from "../lib/session.js";

const configs = {
  students: {
    select: `SELECT id,name,email,goal,status,assessment_date AS "assessmentDate", access_status AS "accessStatus",
      plan_code AS "planCode", access_type AS "accessType", billing_cycle AS "billingCycle", access_expires_at AS "accessExpiresAt",
      payment_status AS "paymentStatus", payment_method AS "paymentMethod", account_id AS "accountId"
      FROM students WHERE trainer_id=$1 ORDER BY created_at DESC`,
    insert: `INSERT INTO students (trainer_id,name,email,goal,status,assessment_date) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id,name,email,goal,status,assessment_date AS "assessmentDate"`,
    update: `UPDATE students SET name=$3,email=$4,goal=$5,status=$6,assessment_date=$7,updated_at=CURRENT_TIMESTAMP
      WHERE id=$2 AND trainer_id=$1 RETURNING id`,
    values: (b) => [
      b.name,
      b.email,
      b.goal,
      "Pausado",
      b.assessmentDate || null,
    ],
  },
  exercises: {
    select: `SELECT id,name,muscle_group AS "group",equipment,instructions,difficulty,media_type AS "mediaType",
      media_url AS "mediaUrl",thumbnail_url AS "thumbnailUrl",animation_clip AS "animationClip",is_active AS "isActive",
      gif_id AS "gifId",video_id AS "videoId"
      FROM exercises WHERE trainer_id=$1 ORDER BY created_at DESC`,
    insert: `INSERT INTO exercises (trainer_id,name,muscle_group,equipment,instructions,difficulty,media_type,media_url,thumbnail_url,animation_clip,gif_id,video_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,name,muscle_group AS "group",equipment,instructions,difficulty,
      media_type AS "mediaType",media_url AS "mediaUrl",thumbnail_url AS "thumbnailUrl",animation_clip AS "animationClip",
      gif_id AS "gifId",video_id AS "videoId"`,
    update: `UPDATE exercises SET name=$3,muscle_group=$4,equipment=$5,instructions=$6,difficulty=$7,media_type=$8,
      media_url=$9,thumbnail_url=$10,animation_clip=$11,gif_id=$12,video_id=$13
      WHERE id=$2 AND trainer_id=$1 RETURNING id`,
    values: (b) => [
      b.name,
      b.group,
      b.equipment,
      b.instructions || null,
      b.difficulty || "Intermediário",
      b.mediaType || "3d",
      b.mediaUrl || null,
      b.thumbnailUrl || null,
      b.animationClip || null,
      b.gifId || null,
      b.videoId || null,
    ],
  },
  assessments: {
    select: `SELECT a.id,s.name AS student,strftime('%d/%m/%Y',a.assessed_at) AS date,a.weight_kg || ' kg' AS weight,
      a.height_cm || ' cm' AS height,a.bmi,a.body_fat_percent || '%' AS fat,a.waist_cm || ' cm' AS waist,
      a.hip_cm || ' cm' AS hip,a.whr,a.protocol,a.blood_pressure AS "bloodPressure",a.resting_hr || ' bpm' AS "restingHR",
      a.restriction,a.parq,a.push_ups AS "pushUps",a.plank_seconds AS plank,a.sit_and_reach_cm AS "sitAndReach",a.notes,
      a.published_at AS "publishedAt" FROM assessments a JOIN students s ON s.id=a.student_id WHERE a.trainer_id=$1 ORDER BY a.assessed_at DESC`,
    insert: `INSERT INTO assessments (trainer_id,student_id,protocol,weight_kg,height_cm,bmi,body_fat_percent,waist_cm,hip_cm,whr,
      chest_cm,arm_cm,thigh_cm,calf_cm,blood_pressure,resting_hr,restriction,parq,push_ups,plank_seconds,sit_and_reach_cm,notes,published_at)
      VALUES ($1,(SELECT id FROM students WHERE trainer_id=$1 AND name=$2 LIMIT 1),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
      CASE WHEN $23=1 THEN CURRENT_TIMESTAMP ELSE NULL END) RETURNING id`,
    update: `UPDATE assessments SET weight_kg=$3,body_fat_percent=$4,waist_cm=$5,notes=$6,
      published_at=CASE WHEN $7=1 THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE NULL END WHERE id=$2 AND trainer_id=$1 RETURNING id`,
    values: (b) => {
      const h = Number(b.height) / 100,
        hip = Number(b.hip),
        waist = Number(b.waist);
      return [
        b.student,
        b.protocol || "Inicial",
        b.weight,
        b.height,
        h ? (Number(b.weight) / h ** 2).toFixed(1) : null,
        b.fat || null,
        b.waist || null,
        b.hip || null,
        hip ? (waist / hip).toFixed(2) : null,
        b.chest || null,
        b.arm || null,
        b.thigh || null,
        b.calf || null,
        b.bloodPressure || null,
        b.restingHR || null,
        b.restriction || null,
        b.parq || null,
        b.pushUps || null,
        b.plank || null,
        b.sitAndReach || null,
        b.notes || null,
        b.published ? 1 : 0,
      ];
    },
    updateValues: (b) => [
      b.weight,
      b.fat || null,
      b.waist || null,
      b.notes || null,
      b.published ? 1 : 0,
    ],
  },
  appointments: {
    select: `SELECT ap.id,ap.student_id AS "studentId",s.name AS student,ap.starts_at AS "startsAt",
      ap.ends_at AS "endsAt",ap.service,ap.location,ap.notes,ap.status
      FROM appointments ap JOIN students s ON s.id=ap.student_id
      WHERE ap.trainer_id=$1 ORDER BY ap.starts_at`,
    insert: `INSERT INTO appointments (trainer_id,student_id,starts_at,ends_at,service,location,notes,status)
      VALUES ($1,(SELECT id FROM students WHERE trainer_id=$1 AND name=$2 LIMIT 1),$3,$4,$5,$6,$7,$8)
      RETURNING id,student_id AS "studentId",starts_at AS "startsAt",ends_at AS "endsAt",service,location,notes,status`,
    update: `UPDATE appointments SET student_id=(SELECT id FROM students WHERE trainer_id=$1 AND name=$3 LIMIT 1),
      starts_at=$4,ends_at=$5,service=$6,location=$7,notes=$8,status=$9,updated_at=CURRENT_TIMESTAMP
      WHERE id=$2 AND trainer_id=$1 RETURNING id`,
    values: (b) => [
      b.student,
      b.startsAt,
      b.endsAt,
      b.service,
      b.location || null,
      b.notes || null,
      ["scheduled", "completed", "cancelled"].includes(b.status)
        ? b.status
        : "scheduled",
    ],
  },
};

async function saveWorkoutExercises(db, trainerId, workoutId, body) {
  const prescriptions = Array.isArray(body.exercisePrescriptions)
    ? body.exercisePrescriptions
        .filter((item) => item && item.exerciseId)
        .filter(
          (item, index, items) =>
            items.findIndex(
              (candidate) => candidate.exerciseId === item.exerciseId,
            ) === index,
        )
    : (Array.isArray(body.exerciseIds)
        ? [...new Set(body.exerciseIds.filter(Boolean))]
        : []
      ).map((exerciseId) => ({
        exerciseId,
        sets: body.sets,
        repetitions: body.repetitions,
        restSeconds: body.restSeconds,
        notes: body.exerciseNotes,
      }));
  const queries = [
    {
      sql: "DELETE FROM workout_exercises WHERE workout_id=$1",
      values: [workoutId],
    },
  ];
  prescriptions.forEach((prescription, index) =>
    queries.push({
      sql: `INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label)
      SELECT $1,id,$2,$3,$4,$5,$6,$7 FROM exercises WHERE id=$8 AND trainer_id=$9`,
      values: [
        workoutId,
        index + 1,
        Math.max(1, Math.min(20, Number(prescription.sets) || 3)),
        String(prescription.repetitions || "10").slice(0, 40),
        Math.max(0, Math.min(1800, Number(prescription.restSeconds) || 0)),
        String(prescription.notes || "")
          .trim()
          .slice(0, 500) || null,
        /^[A-Z]$/u.test(String(prescription.sessionLabel || "").toUpperCase())
          ? String(prescription.sessionLabel).toUpperCase()
          : "A",
        prescription.exerciseId,
        trainerId,
      ],
    }),
  );
  await db.batch(queries);
}

export async function listResource(db, resource, trainerId) {
  if (resource === "workouts")
    return (
      await db.query(
        `SELECT w.id,w.name,s.name AS student,w.goal,w.duration,w.progress,w.published_at AS "publishedAt",
    w.permanent_access AS "permanentAccess",
    COALESCE((SELECT json_group_array(json_object(
      'exerciseId',e.id,'name',e.name,'group',e.muscle_group,'equipment',e.equipment,
      'instructions',e.instructions,'difficulty',e.difficulty,'position',we.position,
      'sets',we.sets,'repetitions',we.repetitions,'restSeconds',we.rest_seconds,'notes',we.notes,
      'sessionLabel',we.session_label
    )) FROM workout_exercises we JOIN exercises e ON e.id=we.exercise_id
    WHERE we.workout_id=w.id ORDER BY we.position),'[]') AS "exercisePrescriptionsJson"
    FROM workouts w JOIN students s ON s.id=w.student_id WHERE w.trainer_id=$1 ORDER BY w.created_at DESC`,
        [trainerId],
      )
    ).rows;
  const config = configs[resource];
  return config ? (await db.query(config.select, [trainerId])).rows : null;
}

export async function createResource(db, resource, trainerId, body) {
  if (resource === "workouts") {
    const row = (
      await db.query(
        `INSERT INTO workouts (trainer_id,student_id,name,goal,duration,published_at,permanent_access)
      VALUES ($1,(SELECT id FROM students WHERE trainer_id=$1 AND name=$2 LIMIT 1),$3,$4,$5,
      CASE WHEN $6=1 THEN CURRENT_TIMESTAMP ELSE NULL END,$7) RETURNING id,name,goal,duration,progress,published_at AS "publishedAt"`,
        [
          trainerId,
          body.student,
          body.name,
          body.goal,
          body.duration,
          body.published ? 1 : 0,
          body.permanentAccess ? 1 : 0,
        ],
      )
    ).rows[0];
    if (row) await saveWorkoutExercises(db, trainerId, row.id, body);
    return row;
  }
  const config = configs[resource];
  if (resource === "students") {
    const password = typeof body.password === "string" ? body.password.trim() : "";
    if (password && !isStrongPassword(password))
      return {
        error:
          "A senha deve ter no mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial.",
        status: 400,
      };
    const student = (
      await db.query(config.insert, [trainerId, ...config.values(body)])
    ).rows[0];
    if (student && password) {
      const account = (
        await db.query(
          `INSERT INTO student_accounts (name,email,password_hash,trainer_id,student_id,requested_plan_code,requested_payment_channel,requested_billing_cycle)
           VALUES ($1,$2,$3,$4,$5,'basic','presencial','quarterly') ON CONFLICT DO NOTHING
           RETURNING id`,
          [student.name, student.email, await hashPassword(password), trainerId, student.id],
        )
      ).rows[0];
      if (!account) {
        await db.query("DELETE FROM students WHERE id=$1", [student.id]);
        return {
          error:
            "Este e-mail já está em uso por outro aluno. Use outro e-mail ou cadastre sem senha.",
          status: 409,
        };
      }
      await db.query("UPDATE students SET account_id=$1 WHERE id=$2", [
        account.id,
        student.id,
      ]);
    }
    return student;
  }
  return config
    ? (await db.query(config.insert, [trainerId, ...config.values(body)]))
        .rows[0]
    : null;
}

export async function updateResource(db, resource, trainerId, id, body) {
  if (resource === "workouts") {
    const row = (
      await db.query(
        `UPDATE workouts SET student_id=(SELECT id FROM students WHERE trainer_id=$1 AND name=$3 LIMIT 1),
      name=$4,goal=$5,duration=$6,published_at=CASE WHEN $7=1 THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE NULL END,
      permanent_access=$8,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND trainer_id=$1 RETURNING id`,
        [
          trainerId,
          id,
          body.student,
          body.name,
          body.goal,
          body.duration,
          body.published ? 1 : 0,
          body.permanentAccess ? 1 : 0,
        ],
      )
    ).rows[0];
    if (row) await saveWorkoutExercises(db, trainerId, id, body);
    return row;
  }
  const config = configs[resource];
  if (resource === "students") {
    const values = [trainerId, id, ...config.values(body)];
    const [studentResult] = await db.batch([
      { sql: config.update, values },
      {
        sql: `UPDATE student_accounts SET name=$3,email=$4
          WHERE id=(SELECT account_id FROM students WHERE id=$2 AND trainer_id=$1)`,
        values: [trainerId, id, body.name, body.email],
      },
    ]);
    return studentResult.rows[0] || null;
  }
  return config
    ? (
        await db.query(config.update, [
          trainerId,
          id,
          ...(config.updateValues?.(body) || config.values(body)),
        ])
      ).rows[0]
    : null;
}

export async function deleteResource(db, resource, trainerId, id) {
  if (!configs[resource] && resource !== "workouts") return null;
  if (resource === "students") {
    const [, deleted] = await db.batch([
      {
        sql: `DELETE FROM student_accounts
          WHERE id=(SELECT account_id FROM students WHERE id=$1 AND trainer_id=$2)`,
        values: [id, trainerId],
      },
      {
        sql: "DELETE FROM students WHERE id=$1 AND trainer_id=$2 RETURNING id",
        values: [id, trainerId],
      },
    ]);
    return deleted.rows[0] || null;
  }
  if (resource === "exercises") {
    // O exercicio e referenciado pelas fichas e pelos treinos prontos. Se
    // apagarmos direto, o banco recusa e o painel mostra um erro generico.
    const uso = (
      await db.query(
        `SELECT
           (SELECT COUNT(*) FROM workout_exercises WHERE exercise_id=$1) AS fichas,
           (SELECT COUNT(*) FROM ready_program_exercises WHERE exercise_id=$1) AS prontos`,
        [id],
      )
    ).rows[0];
    const fichas = Number(uso?.fichas) || 0;
    const prontos = Number(uso?.prontos) || 0;
    if (fichas || prontos) {
      const onde = [
        fichas ? `${fichas} ficha(s) de treino` : "",
        prontos ? `${prontos} treino(s) pronto(s)` : "",
      ]
        .filter(Boolean)
        .join(" e ");
      return {
        error: `Este exercício está sendo usado em ${onde}. Remova ele de lá antes de excluir.`,
        status: 409,
      };
    }
    await db.query("DELETE FROM exercises WHERE id=$1 AND trainer_id=$2", [
      id,
      trainerId,
    ]);
    return null;
  }
  return db.query(`DELETE FROM ${resource} WHERE id=$1 AND trainer_id=$2`, [
    id,
    trainerId,
  ]);
}
