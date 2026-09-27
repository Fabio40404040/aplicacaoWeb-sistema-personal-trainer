// Pastas de grupo muscular criadas pelo personal. Os grupos do catalogo fixo
// nao passam por aqui: aparecem sozinhos quando tem exercicio dentro.

async function schemaReady(db) {
  try {
    await db.query("SELECT 1 FROM trainer_muscle_groups LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

export async function listMuscleGroups(db, trainerId) {
  if (!(await schemaReady(db))) return [];
  return (
    await db.query(
      `SELECT id,name,created_at AS "createdAt" FROM trainer_muscle_groups
       WHERE trainer_id=$1 ORDER BY name`,
      [trainerId],
    )
  ).rows;
}

export async function createMuscleGroup(db, trainerId, body) {
  if (!(await schemaReady(db)))
    return {
      error:
        "A criação de pastas ainda não foi habilitada no banco. Rode a migração 016.",
      status: 503,
    };
  const name = String(body?.name || "")
    .trim()
    .replace(/\s+/gu, " ");
  if (name.length < 2 || name.length > 40)
    return {
      error: "Dê um nome à pasta, de 2 a 40 caracteres.",
      status: 400,
    };
  const existing = (
    await db.query(
      `SELECT id,name FROM trainer_muscle_groups
       WHERE trainer_id=$1 AND lower(name)=lower($2) LIMIT 1`,
      [trainerId, name],
    )
  ).rows[0];
  if (existing) return { ...existing, alreadyStored: true };
  const result = await db.query(
    `INSERT INTO trainer_muscle_groups (trainer_id,name) VALUES ($1,$2)
     RETURNING id,name,created_at AS "createdAt"`,
    [trainerId, name],
  );
  return result.rows[0];
}

export async function deleteMuscleGroup(db, trainerId, id) {
  if (!(await schemaReady(db)))
    return { error: "Pasta não encontrada.", status: 404 };
  const group = (
    await db.query(
      "SELECT id,name FROM trainer_muscle_groups WHERE id=$1 AND trainer_id=$2 LIMIT 1",
      [id, trainerId],
    )
  ).rows[0];
  if (!group) return { error: "Pasta não encontrada.", status: 404 };
  // Um exercício pode ter mais de um grupo muscular guardado como texto
  // separado por vírgula (ex.: "Quadríceps, Glúteos"), então não dá mais
  // para comparar muscle_group=$2 direto — precisa abrir a lista e checar
  // se o nome da pasta está dentro dela. Vídeos e GIFs continuam com um
  // grupo só, essa parte não muda.
  const exerciseRows = (
    await db.query(
      `SELECT muscle_group AS "muscleGroup" FROM exercises WHERE trainer_id=$1`,
      [trainerId],
    )
  ).rows;
  const exercicios = exerciseRows.filter((row) =>
    String(row?.muscleGroup || "")
      .split(",")
      .map((value) => value.trim())
      .includes(group.name),
  ).length;
  const uso = (
    await db.query(
      `SELECT
         (SELECT COUNT(*) FROM exercise_videos WHERE trainer_id=$1 AND muscle_group=$2) AS videos`,
      [trainerId, group.name],
    )
  ).rows[0];
  const videos = Number(uso?.videos) || 0;
  let gifs = 0;
  try {
    gifs =
      Number(
        (
          await db.query(
            "SELECT COUNT(*) AS total FROM exercise_gifs WHERE trainer_id=$1 AND muscle_group=$2",
            [trainerId, group.name],
          )
        ).rows[0]?.total,
      ) || 0;
  } catch {
    gifs = 0;
  }
  if (exercicios || videos || gifs) {
    const onde = [
      exercicios ? `${exercicios} exercício(s)` : "",
      videos ? `${videos} vídeo(s)` : "",
      gifs ? `${gifs} GIF(s)` : "",
    ]
      .filter(Boolean)
      .join(" e ");
    return {
      error: `A pasta ${group.name} ainda tem ${onde} dentro. Esvazie ela antes de excluir.`,
      status: 409,
    };
  }
  await db.query(
    "DELETE FROM trainer_muscle_groups WHERE id=$1 AND trainer_id=$2",
    [id, trainerId],
  );
  return null;
}
