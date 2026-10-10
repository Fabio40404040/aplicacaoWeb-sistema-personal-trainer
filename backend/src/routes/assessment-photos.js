// Fotos de evolução das avaliações (migração 042). São dados sensíveis: só o
// personal dono da avaliação e o próprio aluno (com a avaliação publicada)
// conseguem ver. Apagar a avaliação, o aluno ou a conta apaga as fotos.
// Poses padrão (as 3 primeiras desde a migração 042) e as criadas pelo
// personal (c_xxxx, migração 051).
export const DEFAULT_POSES = [
  ["front", "Frente"],
  ["side", "Lado"],
  ["back", "Costas"],
  ["front_biceps", "Duplo bíceps de frente"],
  ["back_biceps", "Duplo bíceps de costas"],
  ["side_arms", "Lado com braços estendidos"],
];
const CUSTOM_POSE = /^c_[a-z0-9]{4,16}$/u;
const validPose = (pose) => DEFAULT_POSES.some(([key]) => key === pose) || CUSTOM_POSE.test(String(pose || ""));

// Lista de poses do personal (nomes dele). Vazia = as padrão.
export async function photoPoses(db, trainerId) {
  try {
    const rows = (
      await db.query(
        "SELECT pose, label FROM trainer_photo_poses WHERE trainer_id=$1 ORDER BY position, pose",
        [trainerId],
      )
    ).rows.filter((row) => validPose(row.pose));
    if (rows.length) return rows;
  } catch {
    /* sem a migração 051 */
  }
  return DEFAULT_POSES.map(([pose, label]) => ({ pose, label }));
}

// Personal troca nomes, cria e tira poses criadas por ele.
export async function savePhotoPoses(db, trainerId, body) {
  const list = (Array.isArray(body?.poses) ? body.poses : []).slice(0, 40);
  const seen = new Set();
  const poses = [];
  for (const item of list) {
    const pose = String(item?.pose || "");
    const label = String(item?.label || "").replace(/[\u0000-\u001f<>]/gu, "").trim().slice(0, 40);
    if (!validPose(pose) || seen.has(pose)) continue;
    if (!label) return { error: "Toda pose precisa de um nome.", status: 400 };
    seen.add(pose);
    poses.push({ pose, label });
  }
  // As padrão nunca somem (só trocam de nome).
  DEFAULT_POSES.forEach(([pose, label]) => {
    if (!seen.has(pose)) poses.push({ pose, label });
  });
  try {
    await db.batch([
      { sql: "DELETE FROM trainer_photo_poses WHERE trainer_id=$1", values: [trainerId] },
      ...poses.map((item, index) => ({
        sql: "INSERT INTO trainer_photo_poses (trainer_id, pose, label, position) VALUES ($1,$2,$3,$4)",
        values: [trainerId, item.pose, item.label, index],
      })),
    ]);
  } catch {
    return { error: "Falta aplicar a migração 051 para salvar as poses.", status: 503 };
  }
  return { data: { poses } };
}
const IMAGE = /^data:(image\/(?:jpeg|webp));base64,([A-Za-z0-9+/=]+)$/u;
const MAX_CHARS = 700_000;

const stamp = (value) => String(value || "").replace(/\D/gu, "").slice(0, 17);

// Quem enviou (053). Sem a coluna: foto de autoavaliação = aluno.
async function byColumn(db) {
  try {
    await db.query("SELECT uploaded_by FROM assessment_photos LIMIT 1");
    try {
      await db.query("SELECT source FROM assessments LIMIT 1");
      return `, COALESCE(p.uploaded_by, CASE WHEN a.source='student' THEN 'student' ELSE 'trainer' END) AS "by"`;
    } catch {
      return ', COALESCE(p.uploaded_by, \'trainer\') AS "by"';
    }
  } catch {
    try {
      await db.query("SELECT source FROM assessments LIMIT 1");
      return `, CASE WHEN a.source='student' THEN 'student' ELSE 'trainer' END AS "by"`;
    } catch {
      return "";
    }
  }
}

function group(rows) {
  const index = {};
  rows.forEach((row) => {
    (index[row.assessmentId] ||= []).push({ pose: row.pose, v: stamp(row.createdAt), by: row.by || "trainer" });
  });
  return index;
}

// { idDaAvaliação: [{ pose, v }] } para o painel do personal.
export async function trainerPhotoIndex(db, trainerId) {
  try {
    return {
      ready: true,
      index: group(
        (
          await db.query(
            `SELECT p.assessment_id AS "assessmentId", p.pose, p.created_at AS "createdAt"${await byColumn(db)}
             FROM assessment_photos p JOIN assessments a ON a.id=p.assessment_id WHERE p.trainer_id=$1`,
            [trainerId],
          )
        ).rows,
      ),
    };
  } catch {
    return { ready: false, index: {} };
  }
}

// O mesmo para o aluno: só das avaliações publicadas dele.
export async function studentPhotoIndex(db, studentId) {
  try {
    return group(
      (
        await db.query(
          `SELECT p.assessment_id AS "assessmentId", p.pose, p.created_at AS "createdAt"${await byColumn(db)}
           FROM assessment_photos p JOIN assessments a ON a.id=p.assessment_id
           WHERE a.student_id=$1 AND a.published_at IS NOT NULL`,
          [studentId],
        )
      ).rows,
    );
  } catch {
    return {};
  }
}

export async function savePhoto(db, trainerId, assessmentId, pose, body) {
  if (!validPose(pose)) return { error: "Posição inválida.", status: 400 };
  const image = String(body?.image || "");
  if (!IMAGE.test(image) || image.length > MAX_CHARS)
    return { error: "Não foi possível usar esta foto. Tente outra imagem.", status: 400 };
  const owned = (
    await db.query("SELECT id FROM assessments WHERE id=$1 AND trainer_id=$2", [assessmentId, trainerId])
  ).rows[0];
  if (!owned) return { error: "Avaliação não encontrada.", status: 404 };
  const now = new Date().toISOString();
  try {
    await db.query(
      `INSERT INTO assessment_photos (assessment_id, trainer_id, pose, image, created_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (assessment_id, pose) DO UPDATE SET image=excluded.image, created_at=excluded.created_at`,
      [assessmentId, trainerId, pose, image, now],
    );
    await db
      .query("UPDATE assessment_photos SET uploaded_by='trainer' WHERE assessment_id=$1 AND pose=$2", [assessmentId, pose])
      .catch(() => {});
  } catch {
    return { error: "As fotos de evolução ainda não estão disponíveis.", status: 503 };
  }
  return { data: { pose, v: stamp(now), by: "trainer" } };
}

export async function deletePhoto(db, trainerId, assessmentId, pose) {
  try {
    await db.query("DELETE FROM assessment_photos WHERE assessment_id=$1 AND trainer_id=$2 AND pose=$3", [
      assessmentId,
      trainerId,
      pose,
    ]);
  } catch {
    /* sem a migração: nada a apagar */
  }
  return { data: { pose, removed: true } };
}

function imageResponse(row) {
  const match = IMAGE.exec(String(row?.image || ""));
  if (!match) return { error: "Foto não encontrada.", status: 404 };
  return new Response(Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)), {
    headers: {
      "Content-Type": match[1],
      // Só no navegador de quem pediu; nunca em cache compartilhado.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function trainerPhoto(db, trainerId, assessmentId, pose) {
  try {
    return imageResponse(
      (
        await db.query("SELECT image FROM assessment_photos WHERE assessment_id=$1 AND trainer_id=$2 AND pose=$3", [
          assessmentId,
          trainerId,
          pose,
        ])
      ).rows[0],
    );
  } catch {
    return { error: "Foto não encontrada.", status: 404 };
  }
}

export async function studentPhoto(db, accountId, assessmentId, pose) {
  // Avaliação publicada ou a autoavaliação que o próprio aluno enviou (052).
  const query = (extra) =>
    db.query(
      `SELECT p.image FROM assessment_photos p
       JOIN assessments a ON a.id=p.assessment_id
       JOIN student_accounts s ON s.student_id=a.student_id
       WHERE p.assessment_id=$1 AND p.pose=$2 AND s.id=$3 AND (a.published_at IS NOT NULL${extra})`,
      [assessmentId, pose, accountId],
    );
  try {
    return imageResponse((await query(" OR a.source='student'").catch(() => query(""))).rows[0]);
  } catch {
    return { error: "Foto não encontrada.", status: 404 };
  }
}
