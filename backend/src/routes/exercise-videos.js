import { mediaQuotaProblem } from "./account-self.js";
import { deleteMedia, putMedia } from "../lib/media-storage.js";
import { ensureMuscleGroup } from "./muscle-groups.js";
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;

const selectFields = `id,name,muscle_group AS "group",equipment,difficulty,instructions,
  original_filename AS "originalFilename",size_bytes AS "sizeBytes",published,created_at AS "createdAt"`;

function storageUnavailable() {
  return {
    error:
      "O armazenamento de arquivos ainda não foi ativado. Habilite o Cloudflare R2 e vincule o bucket MEDIA.",
    status: 503,
  };
}

function videoResponse(object, filename) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "video/mp4");
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "private, no-store");
  headers.set(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  return new Response(object.body, { headers });
}

// O envio individual de MP4 também cataloga o exercício. Recupera o formato
// antigo (exercício e vídeo com o mesmo id, mas video_id vazio) e não cria uma
// segunda linha quando o arquivo já está ligado a outro exercício da conta.
async function ensureVideoExercise(db, trainerId, video, details) {
  const linked = (
    await db.query(
      `SELECT id,video_id AS "videoId" FROM exercises
       WHERE trainer_id=$1 AND (video_id=$2 OR id=$2)
       ORDER BY CASE WHEN video_id=$2 THEN 0 ELSE 1 END LIMIT 1`,
      [trainerId, video.id],
    )
  ).rows[0];
  if (linked) {
    if (!linked.videoId)
      await db.query(
        "UPDATE exercises SET video_id=$1 WHERE id=$2 AND trainer_id=$3 AND video_id IS NULL",
        [video.id, linked.id, trainerId],
      );
    return linked.id;
  }
  await db.query(
    `INSERT OR IGNORE INTO exercises
      (id,trainer_id,name,muscle_group,equipment,instructions,difficulty,media_type,is_active,video_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'video',1,$1)`,
    [
      video.id,
      trainerId,
      details.name,
      details.group,
      details.equipment || "Sem equipamento",
      details.instructions || null,
      details.difficulty || "Intermediário",
    ],
  );
  return video.id;
}

export async function uploadExerciseVideo(request, env, db, trainerId) {
  if (!env.MEDIA) return storageUnavailable();
  const form = await request.formData();
  const file = form.get("video");
  if (
    !(file instanceof File) ||
    !file.name.toLocaleLowerCase("pt-BR").endsWith(".mp4")
  )
    return { error: "Selecione um arquivo MP4 válido.", status: 400 };
  if (!file.size || file.size > MAX_VIDEO_BYTES)
    return { error: "O vídeo MP4 deve ter no máximo 90 MB.", status: 400 };

  const name = String(form.get("name") || "").trim();
  const group = String(form.get("group") || "").trim();
  const equipment = String(form.get("equipment") || "").trim();
  const difficulty = String(form.get("difficulty") || "").trim();
  const instructions = String(form.get("instructions") || "").trim();
  if (!name || !group || !difficulty)
    return {
      error: "Preencha nome, grupo muscular e dificuldade.",
      status: 400,
    };
  // Os formulários unificados usam catalog=0 porque ligam o MP4 ao exercício
  // que estão salvando. Envios diretos na aba Vídeos catalogam por padrão.
  const catalogar = form.get("catalog") !== "0";

  // O mesmo MP4 não ocupa espaço duas vezes. Se o usuário escolheu outra
  // pasta, move o registro existente e o exercício vinculado para ela.
  const existing = (
    await db.query(
      `SELECT ${selectFields} FROM exercise_videos
       WHERE trainer_id=$1 AND lower(original_filename)=lower($2) LIMIT 1`,
      [trainerId, file.name],
    )
  ).rows[0];
  if (existing) {
    const wantsMove = String(form.get("move") || "") === "1";
    const nextGroup = wantsMove ? group : existing.group;
    const moved = nextGroup !== existing.group;
    const renamed = catalogar && name !== existing.name;
    if (catalogar)
      await ensureVideoExercise(db, trainerId, existing, {
        name,
        group: nextGroup,
        equipment,
        instructions,
        difficulty,
      });
    if (moved || renamed) {
      await db.batch([
        {
          sql: `UPDATE exercise_videos SET name=$1,muscle_group=$2,equipment=$3,difficulty=$4,instructions=$5
                WHERE id=$6 AND trainer_id=$7`,
          values: [
            catalogar ? name : existing.name,
            nextGroup,
            catalogar ? equipment || null : existing.equipment,
            catalogar ? difficulty : existing.difficulty,
            catalogar ? instructions || null : existing.instructions,
            existing.id,
            trainerId,
          ],
        },
        {
          sql: `UPDATE exercises SET
                  name=CASE WHEN name=$1 THEN $2 ELSE name END,
                  muscle_group=CASE WHEN muscle_group=$3 THEN $4 ELSE muscle_group END
                WHERE trainer_id=$5 AND (video_id=$6 OR id=$6)`,
          values: [existing.name, catalogar ? name : existing.name, existing.group, nextGroup, trainerId, existing.id],
        },
      ]);
      await ensureMuscleGroup(db, trainerId, nextGroup).catch(() => {});
      return {
        ...existing,
        name: catalogar ? name : existing.name,
        group: nextGroup,
        alreadyStored: true,
        moved,
        renamed,
      };
    }
    return { ...existing, alreadyStored: true };
  }

  const noSpace = await mediaQuotaProblem(db, trainerId, file.size);
  if (noSpace) return { error: noSpace, status: 403 };

  const bytes = await file.arrayBuffer();
  const signature = new TextDecoder().decode(bytes.slice(4, 8));
  if (signature !== "ftyp")
    return { error: "O arquivo enviado não é um MP4 válido.", status: 400 };

  const id = crypto.randomUUID().replaceAll("-", "");
  const objectKey = `trainers/${trainerId}/exercise-videos/${id}.mp4`;
  try {
    await putMedia(env.MEDIA, objectKey, bytes, {
      httpMetadata: { contentType: "video/mp4" },
      customMetadata: { originalFilename: file.name, trainerId },
    });
  } catch (error) {
    console.error("[exercise-videos] falha no R2", error?.message);
    await deleteMedia(env.MEDIA, objectKey).catch(() => {});
    return {
      error: "O armazenamento da Cloudflare oscilou durante o envio. Tente novamente; o sistema fará até três tentativas automaticamente.",
      status: 503,
    };
  }
  try {
    const queries = [];
    if (catalogar)
      queries.push({
        sql: `INSERT OR IGNORE INTO exercises
          (id,trainer_id,name,muscle_group,equipment,instructions,difficulty,media_type,is_active,video_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'video',1,$1)`,
        values: [
          id,
          trainerId,
          name,
          group,
          equipment || "Sem equipamento",
          instructions || null,
          difficulty,
        ],
      });
    queries.push(
      {
        sql: `INSERT INTO exercise_videos
          (id,trainer_id,name,muscle_group,equipment,difficulty,instructions,object_key,original_filename,size_bytes,published)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING ${selectFields}`,
        values: [
          id,
          trainerId,
          name,
          group,
          equipment || null,
          difficulty,
          instructions || null,
          objectKey,
          file.name,
          file.size,
          form.get("published") === "1" ? 1 : 0,
        ],
      },
    );
    const results = await db.batch(queries);
    await ensureMuscleGroup(db, trainerId, group).catch(() => {});
    return results[results.length - 1].rows[0];
  } catch (error) {
    await deleteMedia(env.MEDIA, objectKey).catch(() => {});
    throw error;
  }
}

export async function deleteExerciseVideo(env, db, trainerId, id) {
  if (!env.MEDIA) return storageUnavailable();
  const shared = Number(
    (
      await db.query(
        "SELECT COUNT(*) AS n FROM exercises WHERE video_id=$1 AND trainer_id<>$2",
        [id, trainerId],
      )
    ).rows[0]?.n || 0,
  );
  if (shared)
    return {
      error: `Este vídeo está sendo usado por ${shared} exercício(s) de personal(is). Remova essas cópias antes de apagar o arquivo.`,
      status: 409,
    };
  const row = (
    await db.query(
      'SELECT object_key AS "objectKey" FROM exercise_videos WHERE id=$1 AND trainer_id=$2 LIMIT 1',
      [id, trainerId],
    )
  ).rows[0];
  if (!row) return { error: "Vídeo não encontrado.", status: 404 };
  // Confirma a exclusão no D1 antes de limpar o R2. Assim uma falha do banco
  // nunca deixa um vídeo cadastrado apontando para um arquivo já apagado.
  await db.batch([
    {
      sql: "UPDATE exercises SET video_id=NULL WHERE video_id=$1 AND trainer_id=$2",
      values: [id, trainerId],
    },
    {
      sql: "DELETE FROM exercise_videos WHERE id=$1 AND trainer_id=$2",
      values: [id, trainerId],
    },
  ]);
  try {
    await deleteMedia(env.MEDIA, row.objectKey);
  } catch (error) {
    console.error("[exercise-videos] vídeo excluído do banco, mas a limpeza no R2 falhou", error?.message);
  }
  return null;
}

export async function trainerExerciseVideoFile(env, db, trainerId, id) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      `SELECT object_key AS "objectKey",original_filename AS "originalFilename"
       FROM exercise_videos WHERE id=$1 AND trainer_id IN ($2,'farisa-library') LIMIT 1`,
      [id, trainerId],
    )
  ).rows[0];
  if (!row) return { error: "Vídeo não encontrado.", status: 404 };
  const object = await env.MEDIA.get(row.objectKey);
  return object
    ? videoResponse(object, row.originalFilename)
    : { error: "Arquivo não encontrado.", status: 404 };
}

export async function studentExerciseVideoFile(env, db, accountId, id) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      `SELECT v.object_key AS "objectKey",v.original_filename AS "originalFilename"
       FROM student_accounts a
       JOIN students s ON s.id=a.student_id AND s.account_id=a.id
       JOIN plans p ON p.code=s.plan_code
       JOIN exercise_videos v ON v.trainer_id IN (s.trainer_id,'farisa-library')
       WHERE a.id=$1 AND v.id=$2 AND v.published=1
         AND s.access_status='active' AND s.payment_status IN ('paid','waived')
         AND instr(p.features_json, '"exercises"') > 0
         AND (s.access_type='permanent' OR datetime(s.access_expires_at) > datetime('now'))
       LIMIT 1`,
      [accountId, id],
    )
  ).rows[0];
  if (!row)
    return { error: "Vídeo indisponível para esta conta.", status: 403 };
  const object = await env.MEDIA.get(row.objectKey);
  return object
    ? videoResponse(object, row.originalFilename)
    : { error: "Arquivo não encontrado.", status: 404 };
}
