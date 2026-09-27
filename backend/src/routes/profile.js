// Perfil do personal e do aluno. Depende da migração 018: sem ela, o painel
// continua funcionando e só o perfil fica indisponível.

const MAX_AVATAR_CHARS = 350_000; // ~250 KB; a foto chega já reduzida.
const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/u;

async function profileSchemaReady(db) {
  try {
    await db.query("SELECT student_limit FROM trainers LIMIT 1");
    await db.query("SELECT checkin_weekday FROM student_accounts LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

const notReady = {
  error:
    "O perfil ainda não foi habilitado no banco. Rode a migração 018 (npm run db:migrate:local no computador ou wrangler d1 migrations apply --remote no site).",
  status: 503,
};

function text(value, max) {
  const clean = String(value ?? "").trim();
  return clean ? clean.slice(0, max) : null;
}

function avatarValue(value) {
  if (value === undefined) return { keep: true };
  if (value === null || value === "") return { value: null };
  if (
    typeof value !== "string" ||
    value.length > MAX_AVATAR_CHARS ||
    !AVATAR_PATTERN.test(value)
  )
    return { error: "A foto precisa ser uma imagem JPG, PNG ou WebP de até 250 KB." };
  return { value };
}

export async function trainerProfile(db, trainerId) {
  if (!(await profileSchemaReady(db))) return null;
  return (
    await db.query(
      `SELECT id, name, email, phone, cref, bio, avatar,
         plan_name AS "planName", student_limit AS "studentLimit"
       FROM trainers WHERE id=$1 LIMIT 1`,
      [trainerId],
    )
  ).rows[0] || null;
}

export async function updateTrainerProfile(db, trainerId, body) {
  if (!(await profileSchemaReady(db))) return notReady;
  const name = text(body?.name, 120);
  if (!name || name.length < 2)
    return { error: "Informe seu nome (mínimo de 2 letras).", status: 400 };
  const limit = Number(body?.studentLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
    return { error: "O limite de alunos precisa ser um número entre 1 e 10000.", status: 400 };
  const avatar = avatarValue(body?.avatar);
  if (avatar.error) return { error: avatar.error, status: 400 };
  await db.query(
    `UPDATE trainers SET name=$2, phone=$3, cref=$4, bio=$5, plan_name=$6, student_limit=$7
       ${avatar.keep ? "" : ", avatar=$8"}
     WHERE id=$1`,
    [
      trainerId,
      name,
      text(body?.phone, 30),
      text(body?.cref, 30),
      text(body?.bio, 500),
      text(body?.planName, 60) || "Plano profissional",
      limit,
      avatar.value ?? null,
    ],
  );
  return { data: await trainerProfile(db, trainerId) };
}

// Campos extras do perfil do aluno, usados pela área do aluno (student/me).
export async function studentProfileFields(db, accountId) {
  if (!(await profileSchemaReady(db))) return null;
  return (
    await db.query(
      `SELECT phone, avatar, birth_date AS "birthDate", checkin_weekday AS "checkinWeekday"
       FROM student_accounts WHERE id=$1 LIMIT 1`,
      [accountId],
    )
  ).rows[0] || null;
}

export async function updateStudentProfile(db, accountId, body) {
  if (!(await profileSchemaReady(db))) return notReady;
  const name = text(body?.name, 140);
  if (!name || name.length < 2)
    return { error: "Informe seu nome (mínimo de 2 letras).", status: 400 };
  const birthDate = text(body?.birthDate, 10);
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/u.test(birthDate))
    return { error: "Data de nascimento inválida.", status: 400 };
  const weekday = Number(body?.checkinWeekday ?? 1);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    return { error: "Escolha um dia da semana para o check-in.", status: 400 };
  const avatar = avatarValue(body?.avatar);
  if (avatar.error) return { error: avatar.error, status: 400 };
  await db.query(
    `UPDATE student_accounts SET name=$2, phone=$3, birth_date=$4, checkin_weekday=$5
       ${avatar.keep ? "" : ", avatar=$6"}
     WHERE id=$1`,
    [accountId, name, text(body?.phone, 30), birthDate, weekday, avatar.value ?? null],
  );
  return { data: await studentProfileFields(db, accountId) };
}
