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

  // No envio em lote o vídeo entra só no acervo: criar um exercício por
  // arquivo enchia a biblioteca de nomes soltos vindos do nome do arquivo.
  const catalogar = form.get("catalog") !== "0";
  const bytes = await file.arrayBuffer();
  const signature = new TextDecoder().decode(bytes.slice(4, 8));
  if (signature !== "ftyp")
    return { error: "O arquivo enviado não é um MP4 válido.", status: 400 };

  const id = crypto.randomUUID().replaceAll("-", "");
  const objectKey = `trainers/${trainerId}/exercise-videos/${id}.mp4`;
  await env.MEDIA.put(objectKey, bytes, {
    httpMetadata: { contentType: "video/mp4" },
    customMetadata: { originalFilename: file.name, trainerId },
  });
  try {
    const queries = [];
    if (catalogar)
      queries.push({
        sql: `INSERT OR IGNORE INTO exercises
          (id,trainer_id,name,muscle_group,equipment,instructions,difficulty,media_type,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'video',1)`,
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
    return results[results.length - 1].rows[0];
  } catch (error) {
    await env.MEDIA.delete(objectKey);
    throw error;
  }
}

export async function deleteExerciseVideo(env, db, trainerId, id) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      'SELECT object_key AS "objectKey" FROM exercise_videos WHERE id=$1 AND trainer_id=$2 LIMIT 1',
      [id, trainerId],
    )
  ).rows[0];
  if (!row) return { error: "Vídeo não encontrado.", status: 404 };
  await env.MEDIA.delete(row.objectKey);
  await db.query("DELETE FROM exercise_videos WHERE id=$1 AND trainer_id=$2", [
    id,
    trainerId,
  ]);
  return null;
}

export async function trainerExerciseVideoFile(env, db, trainerId, id) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      `SELECT object_key AS "objectKey",original_filename AS "originalFilename"
       FROM exercise_videos WHERE id=$1 AND trainer_id=$2 LIMIT 1`,
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
       JOIN exercise_videos v ON v.trainer_id=s.trainer_id
       WHERE a.id=$1 AND v.id=$2 AND v.published=1
         AND s.access_status='active' AND s.payment_status='paid'
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
