// Autoavaliação (consultoria à distância, migração 052): o aluno envia peso,
// medidas e fotos; vira uma avaliação em rascunho (source='student') no painel
// do personal, que revisa e publica. Enquanto não for publicada, o aluno pode
// corrigir. Uma pendente por vez.
import { DEFAULT_POSES } from "./assessment-photos.js";

const IMAGE = /^data:(image\/(?:jpeg|webp));base64,([A-Za-z0-9+/=]+)$/u;
const MAX_CHARS = 700_000;
const CUSTOM_POSE = /^c_[a-z0-9]{4,16}$/u;
const validPose = (pose) => DEFAULT_POSES.some(([key]) => key === pose) || CUSTOM_POSE.test(String(pose || ""));
const stamp = (value) => String(value || "").replace(/\D/gu, "").slice(0, 17);

// [campo, coluna, mínimo, máximo]
const FIELDS = [
  ["weight", "weight_kg", 20, 400],
  ["height", "height_cm", 80, 250],
  ["waist", "waist_cm", 30, 250],
  ["hip", "hip_cm", 30, 250],
  ["chest", "chest_cm", 30, 250],
  ["arm", "arm_cm", 10, 100],
  ["thigh", "thigh_cm", 20, 150],
  ["calf", "calf_cm", 15, 100],
];

async function ready(db) {
  try {
    await db.query("SELECT source FROM assessments LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

async function studentOf(db, accountId) {
  return (
    await db.query(
      `SELECT s.id, s.trainer_id AS "trainerId", s.name FROM student_accounts a JOIN students s ON s.id=a.student_id WHERE a.id=$1 LIMIT 1`,
      [accountId],
    )
  ).rows[0];
}

async function pendingOf(db, studentId) {
  return (
    await db.query(
      `SELECT id, weight_kg AS "weightKg", height_cm AS "heightCm", waist_cm AS "waistCm", hip_cm AS "hipCm",
         chest_cm AS "chestCm", arm_cm AS "armCm", thigh_cm AS "thighCm", calf_cm AS "calfCm", notes, sex,
         assessed_at AS "assessedAt"
       FROM assessments WHERE student_id=$1 AND source='student' AND published_at IS NULL ORDER BY assessed_at DESC LIMIT 1`,
      [studentId],
    )
  ).rows[0];
}

// Para a área do aluno: a autoavaliação ainda não revisada (ou null).
export async function pendingSelfAssessment(db, studentId) {
  if (!studentId || !(await ready(db))) return null;
  const row = await pendingOf(db, studentId).catch(() => null);
  if (!row) return null;
  const photos = (
    await db
      .query('SELECT pose, created_at AS "createdAt", uploaded_by AS "by" FROM assessment_photos WHERE assessment_id=$1', [row.id])
      .catch(() => db.query('SELECT pose, created_at AS "createdAt" FROM assessment_photos WHERE assessment_id=$1', [row.id]))
      .catch(() => ({ rows: [] }))
  ).rows.map((item) => ({ pose: item.pose, v: stamp(item.createdAt), by: item.by || "student" }));
  return { ...row, photos };
}

export async function saveSelfAssessment(db, accountId, body) {
  if (!(await ready(db))) return { error: "O envio de medidas ainda não está disponível.", status: 503 };
  const student = await studentOf(db, accountId);
  if (!student) return { error: "Conta sem acesso.", status: 403 };
  const values = {};
  for (const [field, , min, max] of FIELDS) {
    const raw = String(body?.[field] ?? "").replace(",", ".").trim();
    if (!raw) continue;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < min || number > max)
      return { error: `Confira o valor de ${field === "weight" ? "peso" : "medida"}: ${raw}.`, status: 400 };
    values[field] = Math.round(number * 10) / 10;
  }
  if (!values.weight) return { error: "Informe o seu peso.", status: 400 };
  const sex = ["M", "F"].includes(body?.sex) ? body.sex : null;
  const notes = String(body?.notes || "").replace(/[<>]/gu, "").trim().slice(0, 500) || null;
  const h = values.height ? values.height / 100 : 0;
  const bmi = h ? Math.round((values.weight / h ** 2) * 10) / 10 : null;
  const whr = values.waist && values.hip ? Math.round((values.waist / values.hip) * 100) / 100 : null;
  const pending = await pendingOf(db, student.id);
  const columns = FIELDS.map(([field, column]) => [column, values[field] ?? null]);
  if (pending) {
    await db.query(
      `UPDATE assessments SET ${columns.map(([column], index) => `${column}=$${index + 2}`).join(", ")},
         bmi=$${columns.length + 2}, whr=$${columns.length + 3}, sex=COALESCE($${columns.length + 4}, sex),
         notes=$${columns.length + 5}, assessed_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [pending.id, ...columns.map(([, value]) => value), bmi, whr, sex, notes],
    );
    return { data: { id: pending.id, updated: true } };
  }
  const row = (
    await db.query(
      `INSERT INTO assessments (trainer_id, student_id, protocol, source, ${columns.map(([column]) => column).join(", ")}, bmi, whr, sex, notes)
       VALUES ($1, $2, 'Autoavaliação', 'student', ${columns.map((_, index) => `$${index + 3}`).join(", ")},
         $${columns.length + 3}, $${columns.length + 4}, $${columns.length + 5}, $${columns.length + 6})
       RETURNING id`,
      [student.trainerId, student.id, ...columns.map(([, value]) => value), bmi, whr, sex, notes],
    )
  ).rows[0];
  return { data: { id: row.id, created: true }, status: 201 };
}

async function ownedPending(db, accountId, assessmentId) {
  const student = await studentOf(db, accountId);
  if (!student) return null;
  return (
    await db.query(
      `SELECT id, trainer_id AS "trainerId" FROM assessments WHERE id=$1 AND student_id=$2 AND source='student' AND published_at IS NULL`,
      [assessmentId, student.id],
    )
  ).rows[0];
}

export async function saveSelfPhoto(db, accountId, assessmentId, pose, body) {
  if (!validPose(pose)) return { error: "Posição inválida.", status: 400 };
  const image = String(body?.image || "");
  if (!IMAGE.test(image) || image.length > MAX_CHARS)
    return { error: "Não foi possível usar esta foto. Tente outra imagem.", status: 400 };
  const owned = await ownedPending(db, accountId, assessmentId).catch(() => null);
  if (!owned) return { error: "Envie as medidas antes das fotos.", status: 404 };
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO assessment_photos (assessment_id, trainer_id, pose, image, created_at) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (assessment_id, pose) DO UPDATE SET image=excluded.image, created_at=excluded.created_at`,
    [assessmentId, owned.trainerId, pose, image, now],
  );
  await db
    .query("UPDATE assessment_photos SET uploaded_by='student' WHERE assessment_id=$1 AND pose=$2", [assessmentId, pose])
    .catch(() => {});
  return { data: { pose, v: stamp(now), by: "student" } };
}

export async function deleteSelfPhoto(db, accountId, assessmentId, pose) {
  const owned = await ownedPending(db, accountId, assessmentId).catch(() => null);
  if (!owned) return { error: "Foto não encontrada.", status: 404 };
  await db.query("DELETE FROM assessment_photos WHERE assessment_id=$1 AND pose=$2", [assessmentId, pose]);
  return { data: { pose, removed: true } };
}

// Personal publica a autoavaliação revisada (o aluno passa a ver como avaliação).
export async function publishAssessment(db, trainerId, assessmentId) {
  const row = (
    await db.query(
      `UPDATE assessments SET published_at=COALESCE(published_at, CURRENT_TIMESTAMP) WHERE id=$1 AND trainer_id=$2 RETURNING id`,
      [assessmentId, trainerId],
    )
  ).rows[0];
  return row ? { data: { id: row.id, published: true } } : { error: "Avaliação não encontrada.", status: 404 };
}
