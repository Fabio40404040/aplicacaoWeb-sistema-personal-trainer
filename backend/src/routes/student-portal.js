import { studentProfileFields } from "./profile.js";

const PLAN_FEATURES = {
  ready: ["workouts", "exercises"],
  basic: ["workouts", "exercises", "assessments", "progress"],
  premium: ["workouts", "exercises", "assessments", "progress", "checkins"],
  athlete: ["workouts", "exercises", "assessments", "progress", "checkins"],
};

function featuresFor(row) {
  try {
    return JSON.parse(row.featuresJson || "[]");
  } catch {
    return PLAN_FEATURES[row.planCode] || [];
  }
}

function hasCurrentAccess(student) {
  if (
    !student ||
    student.accessStatus !== "active" ||
    student.paymentStatus !== "paid"
  )
    return false;
  if (student.accessType === "permanent") return true;
  return Boolean(
    student.accessExpiresAt &&
    new Date(student.accessExpiresAt).getTime() > Date.now(),
  );
}

// Mesma protecao do painel: sem a migracao 015 aplicada, a area do aluno
// segue funcionando, apenas sem os GIFs.
async function gifSchemaReady(db) {
  try {
    await db.query("SELECT 1 FROM exercise_gifs LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

export async function studentPortal(db, accountId, version) {
  const withGifs = await gifSchemaReady(db);
  let withVideoLink = true;
  try {
    await db.query("SELECT video_id FROM exercises LIMIT 1");
  } catch {
    withVideoLink = false;
  }
  const gifJson =
    (withGifs ? "'gifId',e.gif_id," : "") +
    (withVideoLink ? "'videoId',e.video_id," : "");
  const gifColumn =
    (withGifs ? 'e.gif_id AS "gifId",' : "") +
    (withVideoLink ? 'e.video_id AS "videoId",' : "");
  const account = (
    await db.query(
      `SELECT a.id, a.name, a.email, a.auth_version AS "authVersion",
        s.id AS "studentId", s.trainer_id AS "trainerId", s.goal, s.status,
        s.access_status AS "accessStatus", s.plan_code AS "planCode",
        s.access_type AS "accessType", s.billing_cycle AS "billingCycle", s.access_expires_at AS "accessExpiresAt",
        s.payment_status AS "paymentStatus", s.payment_method AS "paymentMethod",
        p.name AS "planName", p.price_cents AS "priceCents", p.features_json AS "featuresJson"
      FROM student_accounts a
      LEFT JOIN students s ON s.id=a.student_id AND s.account_id=a.id
      LEFT JOIN plans p ON p.code=s.plan_code
      WHERE a.id=$1 AND a.auth_version=$2 LIMIT 1`,
      [accountId, version || 0],
    )
  ).rows[0];
  if (!account) return null;

  const features = featuresFor(account);
  const accessActive = hasCurrentAccess(account);
  const response = {
    id: account.id,
    name: account.name,
    email: account.email,
    studentId: account.studentId,
    access: {
      active: accessActive,
      status: account.accessStatus || "pending",
      paymentStatus: account.paymentStatus || "pending",
      paymentMethod: account.paymentMethod || null,
      planCode: account.planCode || "basic",
      planName: account.planName || "Consultoria Básica",
      accessType: account.accessType || "subscription",
      billingCycle: account.billingCycle || "quarterly",
      expiresAt: account.accessExpiresAt || null,
      features,
    },
    workouts: [],
    readyWorkouts: [],
    exerciseVideos: [],
    assessments: [],
    checkins: [],
    appointments: [],
    // Foto, telefone, nascimento e dia do check-in (null sem a migração 018).
    profile: await studentProfileFields(db, accountId),
  };
  if (!accessActive || !account.studentId) return response;

  // Próximos atendimentos (usados nas notificações do aluno).
  response.appointments = (
    await db.query(
      `SELECT id, starts_at AS "startsAt", ends_at AS "endsAt", service, location, status
       FROM appointments
       WHERE student_id=$1 AND status='scheduled' AND ends_at >= datetime('now','-1 day')
       ORDER BY starts_at LIMIT 10`,
      [account.studentId],
    )
  ).rows;

  if (account.planCode === "ready") {
    response.readyWorkouts = (
      await db.query(
        `SELECT p.id,p.name,p.goal,p.level,p.duration,p.description,p.color_theme AS "colorTheme",
         p.created_at AS "createdAt",
         COALESCE((SELECT json_group_array(json_object(
           'exerciseId',e.id,'name',e.name,'group',e.muscle_group,'equipment',e.equipment,
           'instructions',e.instructions,'difficulty',e.difficulty,'mediaType',e.media_type,
           'mediaUrl',e.media_url,'thumbnailUrl',e.thumbnail_url,${gifJson}'position',r.position,
           'sets',r.sets,'repetitions',r.repetitions,'restSeconds',r.rest_seconds,
           'notes',r.notes,'sessionLabel',r.session_label
         )) FROM ready_program_exercises r JOIN exercises e ON e.id=r.exercise_id
         WHERE r.program_id=p.id ORDER BY r.position),'[]') AS "exercisePrescriptionsJson"
         FROM ready_workout_programs p WHERE p.trainer_id=$1 AND p.published=1 ORDER BY p.created_at DESC`,
        [account.trainerId],
      )
    ).rows;
    response.readyWorkouts.forEach((workout) => {
      try {
        workout.exercises = JSON.parse(
          workout.exercisePrescriptionsJson || "[]",
        );
      } catch {
        workout.exercises = [];
      }
      delete workout.exercisePrescriptionsJson;
    });
  }

  if (features.includes("exercises")) {
    response.exerciseVideos = (
      await db.query(
        `SELECT id,name,muscle_group AS "group",equipment,difficulty,instructions,
         original_filename AS "originalFilename",size_bytes AS "sizeBytes",created_at AS "createdAt"
         FROM exercise_videos WHERE trainer_id=$1 AND published=1 ORDER BY muscle_group,name`,
        [account.trainerId],
      )
    ).rows;
  }

  if (features.includes("workouts")) {
    const workouts = await db.query(
      `SELECT id, name, goal, duration, progress, published_at AS "publishedAt"
       FROM workouts WHERE student_id=$1 AND published_at IS NOT NULL ORDER BY created_at DESC`,
      [account.studentId],
    );
    response.workouts = workouts.rows;
    for (const workout of response.workouts) {
      workout.exercises = (
        await db.query(
          `SELECT e.id, e.name, e.muscle_group AS "group", e.equipment, e.instructions,
             e.difficulty, e.media_type AS "mediaType", e.media_url AS "mediaUrl",
             e.thumbnail_url AS "thumbnailUrl", e.animation_clip AS "animationClip",
             ${gifColumn}
             we.position, we.sets, we.repetitions, we.rest_seconds AS "restSeconds", we.notes,
             we.session_label AS "sessionLabel"
           FROM workout_exercises we JOIN exercises e ON e.id=we.exercise_id
           WHERE we.workout_id=$1 AND e.is_active=1 ORDER BY we.position`,
          [workout.id],
        )
      ).rows;
    }
  }
  if (features.includes("assessments")) {
    response.assessments = (
      await db.query(
        `SELECT id, protocol, weight_kg AS "weightKg", height_cm AS "heightCm", bmi,
          body_fat_percent AS "bodyFatPercent", waist_cm AS "waistCm", hip_cm AS "hipCm", whr,
          blood_pressure AS "bloodPressure", resting_hr AS "restingHr", notes,
          assessed_at AS "assessedAt"
         FROM assessments WHERE student_id=$1 AND published_at IS NOT NULL ORDER BY assessed_at DESC`,
        [account.studentId],
      )
    ).rows;
  }
  if (features.includes("checkins")) {
    response.checkins = (
      await db.query(
        `SELECT id, energy, sleep, pain, notes, trainer_feedback AS "trainerFeedback", created_at AS "createdAt"
         FROM checkins WHERE student_id=$1 ORDER BY created_at DESC LIMIT 8`,
        [account.studentId],
      )
    ).rows;
  }
  return response;
}

export async function submitCheckin(db, accountId, body) {
  const profile = (
    await db.query(
      `SELECT s.id, s.trainer_id AS "trainerId", s.plan_code AS "planCode", s.access_status AS "accessStatus",
        s.payment_status AS "paymentStatus", s.access_type AS "accessType", s.access_expires_at AS "accessExpiresAt"
       FROM student_accounts a JOIN students s ON s.id=a.student_id WHERE a.id=$1 LIMIT 1`,
      [accountId],
    )
  ).rows[0];
  if (
    !profile ||
    !hasCurrentAccess(profile) ||
    !["premium", "athlete"].includes(profile.planCode)
  )
    return {
      error: "Seu plano atual não possui check-in semanal ativo.",
      status: 403,
    };
  const energy = Number(body?.energy);
  const sleep = Number(body?.sleep);
  if (![1, 2, 3, 4, 5].includes(energy) || ![1, 2, 3, 4, 5].includes(sleep))
    return { error: "Informe energia e sono entre 1 e 5.", status: 400 };
  const result = await db.query(
    `INSERT INTO checkins (trainer_id, student_id, energy, sleep, pain, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at AS "createdAt"`,
    [
      profile.trainerId,
      profile.id,
      energy,
      sleep,
      body.pain || null,
      body.notes || null,
    ],
  );
  return { data: result.rows[0], status: 201 };
}

export async function requestPlan(db, accountId, body) {
  const planCode = String(body?.planCode || "");
  const channel = ["webapp", "whatsapp", "pix", "card_whatsapp"].includes(
    body?.paymentChannel,
  )
    ? body.paymentChannel
    : "whatsapp";
  const plan = (
    await db.query(
      'SELECT code, access_type AS "accessType" FROM plans WHERE code=$1 AND active=1',
      [planCode],
    )
  ).rows[0];
  if (!plan) return { error: "Plano inválido.", status: 400 };
  const billingCycle =
    plan.accessType === "permanent"
      ? "permanent"
      : ["monthly", "quarterly", "semiannual", "annual"].includes(
            body?.billingCycle,
          )
        ? body.billingCycle
        : "quarterly";
  await db.batch([
    {
      sql: `UPDATE student_accounts SET requested_plan_code=$2, requested_payment_channel=$3, requested_billing_cycle=$4 WHERE id=$1`,
      values: [accountId, planCode, channel, billingCycle],
    },
    {
      sql: `UPDATE students SET plan_code=$2, access_type=$3, billing_cycle=$4, access_status='pending', payment_status='pending',
            payment_method=$5, updated_at=CURRENT_TIMESTAMP
            WHERE id=(SELECT student_id FROM student_accounts WHERE id=$1)`,
      values: [accountId, planCode, plan.accessType, billingCycle, channel],
    },
  ]);
  return {
    data: {
      message:
        channel === "webapp"
          ? "Plano solicitado. O pagamento online será liberado quando o provedor for conectado."
          : "Plano solicitado. Combine o pagamento com o personal pelo WhatsApp.",
    },
  };
}
