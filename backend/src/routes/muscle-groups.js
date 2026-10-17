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
       WHERE trainer_id=$1 ORDER BY created_at,id`,
      [trainerId],
    )
  ).rows;
}

const cleanName = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, 40);

const folderIdentity = (value) =>
  cleanName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/^\d+\s*[-_.:)]*\s*/u, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

// Mantém o nome da primeira pasta criada. Assim, se já existe "Peito",
// enviar depois uma pasta "1-Peito" acrescenta o conteúdo em "Peito".
export async function resolveMuscleGroupName(db, trainerId, value) {
  const name = cleanName(value);
  if (!name) return "";
  try {
    const groups = (
      await db.query(
        "SELECT name FROM trainer_muscle_groups WHERE trainer_id=$1 ORDER BY created_at,id",
        [trainerId],
      )
    ).rows;
    return groups.find((group) => folderIdentity(group.name) === folderIdentity(name))?.name || name;
  } catch {
    return name;
  }
}

async function appendFolderOrder(db, trainerId, name) {
  try {
    const current = await folderOrder(db, trainerId);
    if (current.includes(name)) return;
    await saveFolderOrder(db, trainerId, { names: [...current, name] });
  } catch {
    /* sem a migração de ordem: a pasta continua válida pela data de criação */
  }
}

// GIFs, vídeos e exercícios usam a mesma pasta. Registrar o nome aqui faz a
// pasta aparecer vazia nas outras abas e mantém admin e personal isolados
// pelo trainer_id (a Biblioteca FARISA usa o id próprio farisa-library).
export async function ensureMuscleGroup(db, trainerId, value) {
  if (!(await schemaReady(db))) return null;
  const name = await resolveMuscleGroupName(db, trainerId, value);
  if (name.length < 2) return null;
  let row = (
    await db.query(
      `SELECT id,name,created_at AS "createdAt" FROM trainer_muscle_groups
       WHERE trainer_id=$1 AND lower(name)=lower($2) LIMIT 1`,
      [trainerId, name],
    )
  ).rows[0];
  if (!row) {
    await db.query(
      "INSERT OR IGNORE INTO trainer_muscle_groups (trainer_id,name) VALUES ($1,$2)",
      [trainerId, name],
    );
    row = (
      await db.query(
        `SELECT id,name,created_at AS "createdAt" FROM trainer_muscle_groups
         WHERE trainer_id=$1 AND lower(name)=lower($2) LIMIT 1`,
        [trainerId, name],
      )
    ).rows[0];
  }
  if (!row) return null;
  await appendFolderOrder(db, trainerId, row.name);
  return row;
}

export async function createMuscleGroup(db, trainerId, body) {
  if (!(await schemaReady(db)))
    return {
      error:
        "A criação de pastas ainda não foi habilitada no banco. Rode a migração 016.",
      status: 503,
    };
  const name = cleanName(body?.name);
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
  if (existing) {
    await appendFolderOrder(db, trainerId, existing.name);
    return { ...existing, alreadyStored: true };
  }
  return ensureMuscleGroup(db, trainerId, name);
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
  let gifs;
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
  const order = await folderOrder(db, trainerId);
  if (order.includes(group.name))
    await saveFolderOrder(db, trainerId, { names: order.filter((name) => name !== group.name) });
  return null;
}

// Ordem das pastas da biblioteca (migração 046). Sem a tabela: lista vazia.
export async function folderOrder(db, trainerId) {
  try {
    const row = (await db.query("SELECT names FROM trainer_folder_order WHERE trainer_id=$1", [trainerId])).rows[0];
    const names = JSON.parse(row?.names || "[]");
    return Array.isArray(names) ? names.filter((name) => typeof name === "string") : [];
  } catch {
    return [];
  }
}

export async function saveFolderOrder(db, trainerId, body) {
  const names = [
    ...new Set(
      (Array.isArray(body?.names) ? body.names : [])
        .map((name) => String(name || "").trim().slice(0, 60))
        .filter(Boolean),
    ),
  ].slice(0, 100);
  try {
    await db.query(
      `INSERT INTO trainer_folder_order (trainer_id, names) VALUES ($1,$2)
       ON CONFLICT(trainer_id) DO UPDATE SET names=excluded.names, updated_at=CURRENT_TIMESTAMP`,
      [trainerId, JSON.stringify(names)],
    );
  } catch {
    return { error: "A ordem das pastas ainda não está disponível. Tente de novo mais tarde.", status: 503 };
  }
  return { data: { names } };
}
