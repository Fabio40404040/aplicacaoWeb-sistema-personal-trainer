import { trainerToolsData } from "./student-tools.js";
import { trainerPrices } from './site.js'
async function withTrainerPrices(db, trainerId, plans) {
  const prices = await trainerPrices(db, trainerId)
  return plans.map((plan) => (prices.has(plan.code) ? { ...plan, priceCents: prices.get(plan.code).priceCents } : plan))
}
// A biblioteca de GIFs depende da migracao 015. Enquanto ela nao for aplicada
// no banco (por exemplo logo apos um deploy), o painel continua funcionando
// sem os GIFs em vez de quebrar inteiro.
async function customGroupsReady(db) {
  try {
    await db.query("SELECT 1 FROM trainer_muscle_groups LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

async function gifSchemaReady(db) {
  try {
    await db.query("SELECT 1 FROM exercise_gifs LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

// O vínculo com o MP4 chegou na migração 017.
async function videoLinkReady(db) {
  try {
    await db.query("SELECT video_id FROM exercises LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

import { trainerProfile } from "./profile.js";
import { loadReady } from "./resources.js";

// A foto do aluno (student_accounts.avatar) chegou na migração 018.
async function studentAvatarReady(db) {
  try {
    await db.query("SELECT avatar FROM student_accounts LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

export async function dashboard(db, trainerId) {
  const withGifs = await gifSchemaReady(db);
  const withCustomGroups = await customGroupsReady(db);
  const withVideoLink = await videoLinkReady(db);
  const withStudentAvatar = await studentAvatarReady(db);
  let withSitePreview = true;
  try {
    await db.query("SELECT is_site_preview FROM ready_workout_programs LIMIT 1");
  } catch {
    withSitePreview = false;
  }
  const gifColumn =
    (withGifs ? ',gif_id AS "gifId"' : "") +
    (withVideoLink ? ',video_id AS "videoId"' : "");
  const loadJson = (await loadReady(db)) ? "'load',we.load,'loadBy',we.load_by,'loadAt',we.load_at," : "";
  const gifJson =
    (withGifs ? "'gifId',e.gif_id," : "") +
    (withVideoLink ? "'videoId',e.video_id," : "");
  const [
    students,
    exercises,
    workouts,
    assessments,
    checkins,
    plans,
    appointments,
    readyWorkouts,
    readyPrograms,
    exerciseVideos,
    exerciseGifs,
    customGroups,
  ] = await Promise.all([
    db.query(
      `SELECT s.id, s.name, s.email, s.goal, s.status, s.created_at AS "createdAt", s.assessment_date AS "assessmentDate",
       s.access_status AS "accessStatus", s.plan_code AS "planCode", s.access_type AS "accessType", s.billing_cycle AS "billingCycle",
       s.access_expires_at AS "accessExpiresAt", s.payment_status AS "paymentStatus",
       s.payment_method AS "paymentMethod", s.account_id AS "accountId",
       ${withStudentAvatar ? '(SELECT a.avatar FROM student_accounts a WHERE a.id=s.account_id) AS avatar,' : ""}
       COALESCE((SELECT name FROM workouts WHERE student_id=s.id AND trainer_id=s.trainer_id ORDER BY created_at DESC LIMIT 1),'Aguardando ficha') AS workout,
       CASE WHEN s.account_id IS NOT NULL AND s.payment_status='pending' THEN 'Pré-cadastro aguardando pagamento'
            WHEN s.account_id IS NOT NULL THEN 'Cadastro pelo aplicativo' ELSE 'Aluno presencial — liberação manual' END AS activity
       FROM students s WHERE s.trainer_id=$1 ORDER BY s.created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT id, name, muscle_group AS "group", equipment, instructions, difficulty,
       media_type AS "mediaType", media_url AS "mediaUrl", thumbnail_url AS "thumbnailUrl",
       animation_clip AS "animationClip", is_active AS "isActive"${gifColumn}
       FROM exercises WHERE trainer_id=$1 ORDER BY created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT w.id, w.name, w.student_id AS "studentId", s.name AS student, w.goal, w.duration, w.progress,
       w.published_at AS "publishedAt", w.permanent_access AS "permanentAccess",
       (SELECT count(*) FROM workout_exercises we WHERE we.workout_id=w.id) AS "exerciseCount",
       COALESCE((SELECT json_group_array(exercise_id) FROM workout_exercises we WHERE we.workout_id=w.id),'[]') AS "exerciseIdsJson",
       COALESCE((SELECT json_group_array(json_object(
         'exerciseId',e.id,'name',e.name,'group',e.muscle_group,'equipment',e.equipment,
         'instructions',e.instructions,'difficulty',e.difficulty,'mediaType',e.media_type,
         'mediaUrl',e.media_url,'thumbnailUrl',e.thumbnail_url,${gifJson}'position',we.position,
         'sets',we.sets,'repetitions',we.repetitions,'restSeconds',we.rest_seconds,'notes',we.notes,
         ${loadJson}'sessionLabel',we.session_label
       )) FROM workout_exercises we JOIN exercises e ON e.id=we.exercise_id
       WHERE we.workout_id=w.id ORDER BY we.position),'[]') AS "exercisePrescriptionsJson"
       FROM workouts w JOIN students s ON s.id=w.student_id WHERE w.trainer_id=$1 ORDER BY w.created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT a.id, a.student_id AS "studentId", s.name AS student, a.assessed_at AS "assessedAt",
       strftime('%d/%m/%Y',a.assessed_at) AS date,
       a.weight_kg AS "weightKg",a.body_fat_percent AS "bodyFatPercent",a.waist_cm AS "waistCm",
       a.weight_kg || ' kg' AS weight, a.height_cm || ' cm' AS height, a.bmi,
       a.body_fat_percent || '%' AS fat, a.waist_cm || ' cm' AS waist, a.hip_cm || ' cm' AS hip,
       a.whr, a.protocol, a.blood_pressure AS "bloodPressure", a.resting_hr || ' bpm' AS "restingHR",
       a.restriction, a.parq, a.push_ups AS "pushUps", a.plank_seconds AS plank,
       a.sit_and_reach_cm AS "sitAndReach", a.notes, a.published_at AS "publishedAt",
       a.height_cm AS "heightCm", a.hip_cm AS "hipCm", a.resting_hr AS "restingHr",
       a.chest_cm AS "chestCm", a.arm_cm AS "armCm", a.thigh_cm AS "thighCm", a.calf_cm AS "calfCm",
       a.plank_seconds AS "plankSeconds", a.sit_and_reach_cm AS "sitAndReachCm"
       FROM assessments a JOIN students s ON s.id=a.student_id WHERE a.trainer_id=$1 ORDER BY a.assessed_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT c.id, c.student_id AS "studentId", s.name AS student, c.energy, c.sleep, c.pain, c.notes,
       c.trainer_feedback AS "trainerFeedback", c.created_at AS "createdAt"
       FROM checkins c JOIN students s ON s.id=c.student_id WHERE c.trainer_id=$1 ORDER BY c.created_at DESC LIMIT 300`,
      [trainerId],
    ),
    db.query(
      `SELECT code, name, price_cents AS "priceCents", access_type AS "accessType", duration_days AS "durationDays" FROM plans WHERE active=1 ORDER BY price_cents`,
    ),
    // Sem a migração 023 (agenda online), cai na consulta antiga em vez de
    // derrubar o painel inteiro.
    db.query(
      `SELECT ap.id,ap.student_id AS "studentId",s.name AS student,ap.starts_at AS "startsAt",
       ap.ends_at AS "endsAt",ap.service,ap.location,ap.notes,ap.status,ap.modality,
       ap.meeting_url AS "meetingUrl",ap.service_id AS "serviceId",ap.source
       FROM appointments ap JOIN students s ON s.id=ap.student_id
       WHERE ap.trainer_id=$1 ORDER BY ap.starts_at`,
      [trainerId],
    ).catch(() =>
      db.query(
        `SELECT ap.id,ap.student_id AS "studentId",s.name AS student,ap.starts_at AS "startsAt",
         ap.ends_at AS "endsAt",ap.service,ap.location,ap.notes,ap.status
         FROM appointments ap JOIN students s ON s.id=ap.student_id
         WHERE ap.trainer_id=$1 ORDER BY ap.starts_at`,
        [trainerId],
      ),
    ),
    db.query(
      `SELECT id,name,goal,level,duration,muscle_groups AS "muscleGroups",description,
         original_filename AS "originalFilename",size_bytes AS "sizeBytes",published,created_at AS "createdAt"
         FROM ready_workout_pdfs WHERE trainer_id=$1 ORDER BY created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT p.id,p.name,p.goal,p.level,p.duration,p.description,p.color_theme AS "colorTheme",
         p.published,p.created_at AS "createdAt",
         ${withSitePreview ? 'p.is_site_preview AS "sitePreview",' : ""}
         COALESCE((SELECT json_group_array(json(item)) FROM (
           SELECT json_object(
             'exerciseId',e.id,'name',e.name,'group',e.muscle_group,'equipment',e.equipment,
             'instructions',e.instructions,'difficulty',e.difficulty,'mediaType',e.media_type,
             'mediaUrl',e.media_url,'thumbnailUrl',e.thumbnail_url,${gifJson}'position',r.position,
             'sets',r.sets,'repetitions',r.repetitions,'restSeconds',r.rest_seconds,
             'notes',r.notes,'sessionLabel',r.session_label
           ) AS item FROM ready_program_exercises r JOIN exercises e ON e.id=r.exercise_id
           WHERE r.program_id=p.id ORDER BY r.session_label, r.position)),'[]') AS "exercisePrescriptionsJson"
         FROM ready_workout_programs p WHERE p.trainer_id=$1 ORDER BY p.created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT id,name,muscle_group AS "group",equipment,difficulty,instructions,
         original_filename AS "originalFilename",size_bytes AS "sizeBytes",published,created_at AS "createdAt"
         FROM exercise_videos WHERE trainer_id=$1 ORDER BY muscle_group,name`,
      [trainerId],
    ),
    withGifs
      ? db.query(
          `SELECT id,name,muscle_group AS "group",original_filename AS "originalFilename",
             size_bytes AS "sizeBytes",created_at AS "createdAt"
             FROM exercise_gifs WHERE trainer_id=$1 ORDER BY muscle_group,name`,
          [trainerId],
        )
      : { rows: [] },
    withCustomGroups
      ? db.query(
          `SELECT id,name FROM trainer_muscle_groups WHERE trainer_id=$1 ORDER BY name`,
          [trainerId],
        )
      : { rows: [] },
  ]);
  return {
    students: students.rows,
    exercises: exercises.rows,
    workouts: workouts.rows,
    assessments: assessments.rows,
    checkins: checkins.rows,
    // Recados dos alunos ao concluir o treino e evolução das cargas.
    ...(await trainerToolsData(db, trainerId)),
    // Preços que este personal cobra (Meu site → Preços).
    plans: await withTrainerPrices(db, trainerId, plans.rows),
    appointments: appointments.rows,
    readyWorkouts: readyWorkouts.rows,
    readyPrograms: readyPrograms.rows,
    exerciseVideos: exerciseVideos.rows,
    exerciseGifs: exerciseGifs.rows,
    customGroups: customGroups.rows,
    // Perfil do personal (foto, nome, limite de alunos). null sem a migração 018.
    profile: await trainerProfile(db, trainerId),
  };
}
