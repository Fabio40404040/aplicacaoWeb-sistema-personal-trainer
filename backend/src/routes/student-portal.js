import { isDemoEmail } from "../lib/demo.js";
import { loadReady, loadText } from "./resources.js";
import { recordLoad, studentTools } from "./student-tools.js";
import { trainerLocked } from "./plan-access.js";
import { studentPhotoIndex } from "./assessment-photos.js";
import { linkedTrainers } from "./student-links.js";
import { trainerPlans, trainerReferrals } from "./site.js";
import { studentProfileFields } from "./profile.js";
import { amountFor, BILLING_CYCLES } from "./payments.js";

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
    !["paid", "waived"].includes(student.paymentStatus)
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

async function privacyPending(db, accountId) {
  try {
    const row = (
      await db.query('SELECT privacy_accepted_at AS at, email FROM student_accounts WHERE id=$1', [accountId])
    ).rows[0]
    // Conta de demonstração não salva nada: não pede o aceite.
    if (isDemoEmail(row?.email)) return false
    return Boolean(row) && !row.at
  } catch {
    return false // sem a migração 026
  }
}

export async function acceptPrivacy(db, accountId) {
  await db.query(
    `UPDATE student_accounts SET privacy_accepted_at=CURRENT_TIMESTAMP, privacy_version='2026-10'
     WHERE id=$1 AND privacy_accepted_at IS NULL`,
    [accountId],
  )
  return { data: { accepted: true } }
}

// Aluno ajusta a carga de um exercício da própria ficha (publicada).
export async function studentSetLoad(db, accountId, workoutId, body) {
  if (!(await loadReady(db))) return { error: "A carga ainda não está disponível. Fale com o personal.", status: 503 };
  const load = loadText(body?.load);
  const exerciseId = String(body?.exerciseId || "");
  const before = (
    await db.query(
      `SELECT load, load_by AS "loadBy", load_at AS "loadAt" FROM workout_exercises WHERE workout_id=$1 AND exercise_id=$2`,
      [workoutId, exerciseId],
    )
  ).rows[0];
  const row = (
    await db.query(
      `UPDATE workout_exercises SET load=$3, load_by=$4, load_at=$5
       WHERE workout_id=$1 AND exercise_id=$2 AND workout_id IN (
         SELECT w.id FROM workouts w JOIN student_accounts a ON a.student_id=w.student_id
         WHERE a.id=$6 AND w.published_at IS NOT NULL)
       RETURNING load, load_by AS "loadBy", load_at AS "loadAt"`,
      [workoutId, String(body?.exerciseId || ""), load || null, load ? "student" : null, load ? new Date().toISOString() : null, accountId],
    )
  ).rows[0];
  if (row) await recordLoad(db, workoutId, exerciseId, load, "student", before);
  return row ? { data: row } : { error: "Exercício não encontrado na sua ficha.", status: 404 };
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
      `SELECT a.id, a.name, a.email, a.auth_version AS "authVersion", a.trainer_id AS "accountTrainerId",
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
    // Conta criada pelo personal: o aluno ainda não aceitou os Termos.
    privacyPending: await privacyPending(db, accountId),
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
    // Planos para "Mudar de plano" (valores já calculados por período).
    planOptions: await planOptions(db, account.trainerId || account.accountTrainerId),
    pendingChange: await pendingChange(db, accountId),
  };
  // Endereço da página do personal deste aluno: se ele entrar por outra página
  // (a principal ou a de demonstração), o site leva para a página certa.
  response.siteSlug = await db
    .query("SELECT slug FROM trainer_site WHERE trainer_id=$1", [account.trainerId || account.accountTrainerId])
    .then((result) => result.rows[0]?.slug || null)
    .catch(() => null);
  // Todos os personais deste aluno (seletor "Meus personais").
  response.trainers = await linkedTrainers(db, accountId);
  if (!accessActive || !account.studentId) return response;

  // Próximos atendimentos (usados nas notificações do aluno).
  response.appointments = (
    await db
      .query(
        `SELECT id, starts_at AS "startsAt", ends_at AS "endsAt", service, location, status,
           modality, meeting_url AS "meetingUrl", cancelled_by AS "cancelledBy", updated_at AS "updatedAt"
         FROM appointments
         WHERE student_id=$1 AND (
           (status IN ('scheduled','pending') AND ends_at >= datetime('now','-1 day'))
           OR (status='cancelled' AND cancelled_by='trainer' AND starts_at >= datetime('now')
               AND updated_at >= datetime('now','-7 day')))
         ORDER BY starts_at LIMIT 15`,
        [account.studentId],
      )
      .catch(() =>
        // Sem a migração 023: consulta antiga, sem derrubar a área do aluno.
        db.query(
          `SELECT id, starts_at AS "startsAt", ends_at AS "endsAt", service, location, status
           FROM appointments
           WHERE student_id=$1 AND status='scheduled' AND ends_at >= datetime('now','-1 day')
           ORDER BY starts_at LIMIT 10`,
          [account.studentId],
        ),
      )
  ).rows;

  if (account.planCode === "ready") {
    response.readyWorkouts = (
      await db.query(
        `SELECT p.id,p.name,p.goal,p.level,p.duration,p.description,p.color_theme AS "colorTheme",
         p.created_at AS "createdAt",
         COALESCE((SELECT json_group_array(json(item)) FROM (
           -- A ordem precisa vir de uma subconsulta: o ORDER BY junto do
           -- json_group_array é ignorado e embaralhava os exercícios.
           SELECT json_object(
             'exerciseId',e.id,'name',e.name,'group',e.muscle_group,'equipment',e.equipment,
             'instructions',e.instructions,'difficulty',e.difficulty,'mediaType',e.media_type,
             'mediaUrl',e.media_url,'thumbnailUrl',e.thumbnail_url,${gifJson}'position',r.position,
             'sets',r.sets,'repetitions',r.repetitions,'restSeconds',r.rest_seconds,
             'notes',r.notes,'sessionLabel',r.session_label
           ) AS item FROM ready_program_exercises r JOIN exercises e ON e.id=r.exercise_id
           WHERE r.program_id=p.id ORDER BY r.session_label, r.position)),'[]') AS "exercisePrescriptionsJson"
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
    const withLoad = await loadReady(db);
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
             ${withLoad ? 'we.load, we.load_by AS "loadBy", we.load_at AS "loadAt",' : ""}
             we.session_label AS "sessionLabel"
           FROM workout_exercises we JOIN exercises e ON e.id=we.exercise_id
           WHERE we.workout_id=$1 AND e.is_active=1 ORDER BY we.position`,
          [workout.id],
        )
      ).rows.map((exercise) => ({ ...exercise, workoutId: workout.id, loadEditable: withLoad }));
    }
  }
  if (features.includes("assessments")) {
    response.assessments = (
      await db.query(
        `SELECT id, protocol, weight_kg AS "weightKg", height_cm AS "heightCm", bmi,
          body_fat_percent AS "bodyFatPercent", waist_cm AS "waistCm", hip_cm AS "hipCm", whr,
          blood_pressure AS "bloodPressure", resting_hr AS "restingHr", notes,
          chest_cm AS "chestCm", arm_cm AS "armCm", thigh_cm AS "thighCm", calf_cm AS "calfCm",
          push_ups AS "pushUps", plank_seconds AS "plankSeconds", sit_and_reach_cm AS "sitAndReachCm",
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
         FROM checkins WHERE student_id=$1 ORDER BY created_at DESC LIMIT 52`,
        [account.studentId],
      )
    ).rows;
  }
  // Fotos de evolução das avaliações publicadas.
  if (response.assessments.length) {
    const photos = await studentPhotoIndex(db, account.studentId);
    response.assessments.forEach((item) => {
      item.photos = photos[item.id] || [];
    });
  }
  // Personal no Grátis básico: sem check-in, agendamento e relatório em PDF.
  response.trainerLocked = await trainerLocked(db, account.trainerId || account.accountTrainerId);
  // Nutricionista e app de alimentação indicados pelo personal.
  response.referrals = await trainerReferrals(db, account.trainerId || account.accountTrainerId);
  // Calendário de treinos, água e evolução da carga.
  response.tools = await studentTools(
    db,
    account.studentId,
    response.workouts.map((workout) => workout.id),
    response.assessments[0]?.weightKg,
  );
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
      String(body.pain ?? '').slice(0, 500) || null,
      String(body.notes ?? '').slice(0, 2000) || null,
    ],
  );
  return { data: result.rows[0], status: 201 };
}

// Planos que o personal do aluno vende, com os preços dele.
async function planOptions(db, trainerId) {
  const plans = await trainerPlans(db, trainerId);
  return plans.map((plan) => ({
    code: plan.code,
    name: plan.name,
    accessType: plan.accessType,
    prices:
      plan.accessType === "permanent"
        ? [{ cycle: "permanent", amountCents: amountFor(plan, "permanent") }]
        : Object.keys(BILLING_CYCLES).map((cycle) => ({
            cycle,
            amountCents: amountFor(plan, cycle),
            monthlyCents: Math.round(amountFor(plan, cycle) / BILLING_CYCLES[cycle].months),
          })),
  }));
}

async function pendingChange(db, accountId) {
  try {
    const row = (
      await db.query(
        `SELECT a.change_plan_code AS "planCode", a.change_billing_cycle AS "billingCycle", p.name AS "planName"
         FROM student_accounts a JOIN plans p ON p.code=a.change_plan_code WHERE a.id=$1 LIMIT 1`,
        [accountId],
      )
    ).rows[0];
    return row?.planCode ? row : null;
  } catch {
    return null;
  }
}

// Aluno escolhe outro plano. Com o acesso ativo, ele continua no plano atual
// até pagar o novo (a mudança fica "aguardando pagamento"). Sem acesso ativo,
// troca direto o plano do pré-cadastro.
export async function changePlan(db, accountId, body) {
  const account = (
    await db.query(
      `SELECT s.id, s.plan_code AS "planCode", s.billing_cycle AS "billingCycle", s.access_status AS "accessStatus",
         s.payment_status AS "paymentStatus", s.access_type AS "accessType", s.access_expires_at AS "accessExpiresAt"
       FROM student_accounts a JOIN students s ON s.id=a.student_id WHERE a.id=$1 LIMIT 1`,
      [accountId],
    )
  ).rows[0];
  if (!account) return { error: "Cadastro não encontrado.", status: 404 };
  if (body?.cancel) {
    try {
      await db.query(
        "UPDATE student_accounts SET change_plan_code=NULL, change_billing_cycle=NULL WHERE id=$1",
        [accountId],
      );
    } catch {
      // sem a migração 025
    }
    return { data: { cancelled: true } };
  }
  const plan = (
    await db.query(
      'SELECT code, name, access_type AS "accessType" FROM plans WHERE code=$1 AND active=1',
      [String(body?.planCode || "")],
    )
  ).rows[0];
  if (!plan) return { error: "Plano inválido.", status: 400 };
  const cycle =
    plan.accessType === "permanent"
      ? "permanent"
      : BILLING_CYCLES[body?.billingCycle]
        ? body.billingCycle
        : "monthly";
  if (plan.code === account.planCode && cycle === account.billingCycle && hasCurrentAccess(account))
    return { error: "Esse já é o seu plano atual.", status: 400 };
  if (!hasCurrentAccess(account)) {
    await db.query(
      `UPDATE students SET plan_code=$2, access_type=$3, billing_cycle=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [account.id, plan.code, plan.accessType, cycle],
    );
    try {
      await db.query(
        "UPDATE student_accounts SET change_plan_code=NULL, change_billing_cycle=NULL WHERE id=$1",
        [accountId],
      );
    } catch {
      // sem a migração 025
    }
    return { data: { mode: "direct", planName: plan.name } };
  }
  try {
    await db.query(
      "UPDATE student_accounts SET change_plan_code=$2, change_billing_cycle=$3 WHERE id=$1",
      [accountId, plan.code, cycle],
    );
  } catch {
    return {
      error: "A mudança de plano ainda não está disponível. Fale com o personal.",
      status: 503,
    };
  }
  return { data: { mode: "pending", planName: plan.name } };
}
