// Sem limite próprio de tamanho: o único teto é o do Cloudflare, que
// recusa envios acima de 100 MB por requisição.
const MAX_GIF_BYTES = 100 * 1024 * 1024;
const MAX_FRAME_BYTES = 1024 * 1024;

const selectFields = `id,name,muscle_group AS "group",original_filename AS "originalFilename",
  size_bytes AS "sizeBytes",created_at AS "createdAt"`;

function storageUnavailable() {
  return {
    error:
      "O armazenamento de arquivos ainda não foi ativado. Habilite o Cloudflare R2 e vincule o bucket MEDIA.",
    status: 503,
  };
}

function mediaResponse(object, contentType, filename) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "private, max-age=604800");
  headers.set(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(filename || "exercicio")}`,
  );
  return new Response(object.body, { headers });
}

function isGif(bytes) {
  const header = new TextDecoder().decode(bytes.slice(0, 6));
  return header === "GIF87a" || header === "GIF89a";
}

export async function listExerciseGifs(db, trainerId) {
  return (
    await db.query(
      `SELECT ${selectFields} FROM exercise_gifs WHERE trainer_id=$1
       ORDER BY muscle_group,name`,
      [trainerId],
    )
  ).rows;
}

export async function uploadExerciseGif(request, env, db, trainerId) {
  if (!env.MEDIA) return storageUnavailable();
  const form = await request.formData();
  const file = form.get("gif");
  if (
    !(file instanceof File) ||
    !file.name.toLocaleLowerCase("pt-BR").endsWith(".gif")
  )
    return { error: "Selecione um arquivo GIF válido.", status: 400 };
  if (!file.size || file.size > MAX_GIF_BYTES)
    return { error: "Este GIF passa de 100 MB, o máximo aceito pelo Cloudflare.", status: 400 };

  const name = String(form.get("name") || "").trim();
  const group = String(form.get("group") || "").trim();
  if (!name || !group)
    return { error: "Informe o nome e o grupo muscular do GIF.", status: 400 };

  const existing = (
    await db.query(
      `SELECT ${selectFields} FROM exercise_gifs
       WHERE trainer_id=$1 AND original_filename=$2 LIMIT 1`,
      [trainerId, file.name],
    )
  ).rows[0];
  if (existing) {
    // Mesmo arquivo reenviado de propósito para outra pasta (ex.: os GIFs de
    // encolhimento que tinham caído em Costas e agora vão para Trapézio):
    // em vez de ignorar, muda o GIF de pasta. Só quando o navegador pede
    // ("move=1"), para um arquivo solto não mudar de grupo sem querer.
    const wantsMove = String(form.get("move") || "") === "1";
    if (wantsMove && existing.group !== group) {
      await db.query(
        "UPDATE exercise_gifs SET muscle_group=$1 WHERE id=$2 AND trainer_id=$3",
        [group, existing.id, trainerId],
      );
      return { ...existing, group, alreadyStored: true, moved: true };
    }
    return { ...existing, alreadyStored: true };
  }

  const bytes = await file.arrayBuffer();
  if (!isGif(bytes))
    return { error: "O arquivo enviado não é um GIF válido.", status: 400 };

  const id = crypto.randomUUID().replaceAll("-", "");
  const objectKey = `trainers/${trainerId}/exercise-gifs/${id}.gif`;
  const frameKey = `trainers/${trainerId}/exercise-gifs/${id}.jpg`;
  await env.MEDIA.put(objectKey, bytes, {
    httpMetadata: { contentType: "image/gif" },
    customMetadata: { originalFilename: file.name, trainerId },
  });

  // Quadro estatico gerado no navegador, usado no PDF (PDF nao aceita GIF animado).
  const frame = form.get("frame");
  let storedFrameKey = null;
  if (frame instanceof File && frame.size && frame.size <= MAX_FRAME_BYTES) {
    await env.MEDIA.put(frameKey, await frame.arrayBuffer(), {
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: { trainerId },
    });
    storedFrameKey = frameKey;
  }

  try {
    const result = await db.query(
      `INSERT INTO exercise_gifs
        (id,trainer_id,name,muscle_group,object_key,frame_key,original_filename,size_bytes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING ${selectFields}`,
      [id, trainerId, name, group, objectKey, storedFrameKey, file.name, file.size],
    );
    return result.rows[0];
  } catch (error) {
    await env.MEDIA.delete(objectKey);
    if (storedFrameKey) await env.MEDIA.delete(storedFrameKey);
    throw error;
  }
}

export async function deleteExerciseGif(env, db, trainerId, id) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      `SELECT object_key AS "objectKey",frame_key AS "frameKey"
       FROM exercise_gifs WHERE id=$1 AND trainer_id=$2 LIMIT 1`,
      [id, trainerId],
    )
  ).rows[0];
  if (!row) return { error: "GIF não encontrado.", status: 404 };
  await env.MEDIA.delete(row.objectKey);
  if (row.frameKey) await env.MEDIA.delete(row.frameKey);
  await db.batch([
    {
      sql: "UPDATE exercises SET gif_id=NULL WHERE gif_id=$1 AND trainer_id=$2",
      values: [id, trainerId],
    },
    {
      sql: "DELETE FROM exercise_gifs WHERE id=$1 AND trainer_id=$2",
      values: [id, trainerId],
    },
  ]);
  return null;
}

export async function trainerExerciseGifFile(env, db, trainerId, id, kind) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      `SELECT object_key AS "objectKey",frame_key AS "frameKey",original_filename AS "originalFilename"
       FROM exercise_gifs WHERE id=$1 AND trainer_id IN ($2,'farisa-library') LIMIT 1`,
      [id, trainerId],
    )
  ).rows[0];
  if (!row) return { error: "GIF não encontrado.", status: 404 };
  const wantsFrame = kind === "frame";
  const key = wantsFrame ? row.frameKey : row.objectKey;
  if (!key) return { error: "Arquivo não encontrado.", status: 404 };
  const object = await env.MEDIA.get(key);
  return object
    ? mediaResponse(
        object,
        wantsFrame ? "image/jpeg" : "image/gif",
        row.originalFilename,
      )
    : { error: "Arquivo não encontrado.", status: 404 };
}

// Link publico usado dentro do PDF baixado: a ficha pode ser reaberta em
// qualquer dispositivo, sem sessao ativa, entao o selo "GIF" precisa de um
// link que funcione sem login. Protegido só pelo id (um uuid aleatorio, sem
// sequencia previsivel) — o mesmo nivel de um link de compartilhamento. O
// conteudo é apenas a demonstração do exercício, sem nenhum dado do aluno.
export async function publicExerciseGifFile(env, db, id) {
  if (!env.MEDIA) return storageUnavailable();
  if (!id || !/^[a-f0-9]{16,40}$/u.test(id))
    return { error: "GIF não encontrado.", status: 404 };
  const row = (
    await db.query(
      `SELECT object_key AS "objectKey",original_filename AS "originalFilename"
       FROM exercise_gifs WHERE id=$1 LIMIT 1`,
      [id],
    )
  ).rows[0];
  if (!row) return { error: "GIF não encontrado.", status: 404 };
  const object = await env.MEDIA.get(row.objectKey);
  return object
    ? mediaResponse(object, "image/gif", row.originalFilename)
    : { error: "Arquivo não encontrado.", status: 404 };
}

export async function studentExerciseGifFile(env, db, accountId, id, kind) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      `SELECT g.object_key AS "objectKey",g.frame_key AS "frameKey",
         g.original_filename AS "originalFilename"
       FROM student_accounts a
       JOIN students s ON s.id=a.student_id AND s.account_id=a.id
       JOIN plans p ON p.code=s.plan_code
       JOIN exercise_gifs g ON g.trainer_id IN (s.trainer_id,'farisa-library')
       WHERE a.id=$1 AND g.id=$2
         AND s.access_status='active' AND s.payment_status IN ('paid','waived')
         AND instr(p.features_json, '"exercises"') > 0
         AND (s.access_type='permanent' OR datetime(s.access_expires_at) > datetime('now'))
       LIMIT 1`,
      [accountId, id],
    )
  ).rows[0];
  if (!row) return { error: "GIF indisponível para esta conta.", status: 403 };
  const wantsFrame = kind === "frame";
  const key = wantsFrame ? row.frameKey : row.objectKey;
  if (!key) return { error: "Arquivo não encontrado.", status: 404 };
  const object = await env.MEDIA.get(key);
  return object
    ? mediaResponse(
        object,
        wantsFrame ? "image/jpeg" : "image/gif",
        row.originalFilename,
      )
    : { error: "Arquivo não encontrado.", status: 404 };
}

const escapeHtml = (value) =>
  String(value || "").replace(
    /[&<>"']/gu,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

// Página que o selo "GIF" do PDF abre. Antes o link ia direto no arquivo
// .gif: no iPhone o Safari mostra a imagem sozinha em tela cheia, sem botão
// para sair. Aqui o GIF aparece numa página com um botão "Fechar" que volta
// para o PDF (ou orienta a fechar a aba, quando o navegador não deixa).
export async function publicExerciseGifPage(db, id) {
  const valid = id && /^[a-f0-9]{16,40}$/u.test(id);
  const row = valid
    ? (
        await db.query(
          `SELECT name FROM exercise_gifs WHERE id=$1 LIMIT 1`,
          [id],
        )
      ).rows[0]
    : null;
  const title = row ? escapeHtml(row.name) : "GIF não encontrado";
  const body = row
    ? `<img src="/api/public/exercise-gifs/${id}" alt="${title}">`
    : `<p class="msg">Este GIF não está mais disponível.</p>`;
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${title} · FARISA Personal Trainer</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    display: flex; flex-direction: column; background: #0b1220; color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  header {
    display: flex; align-items: center; gap: 12px;
    padding: calc(12px + env(safe-area-inset-top)) 16px 12px;
  }
  h1 { flex: 1; margin: 0; font-size: 1rem; font-weight: 600; line-height: 1.3; }
  button {
    display: inline-flex; align-items: center; gap: 6px; flex: none;
    min-height: 44px; padding: 0 16px; border: 0; border-radius: 999px;
    background: #fff; color: #0b1220; font-size: 0.95rem; font-weight: 700;
  }
  main {
    flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
    padding: 8px 12px calc(16px + env(safe-area-inset-bottom));
  }
  img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 12px; background: #fff; }
  .msg { color: #c7d2e5; text-align: center; }
  .hint { margin: 0 16px 16px; color: #c7d2e5; font-size: 0.9rem; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <button type="button" id="fechar" aria-label="Fechar e voltar ao treino">✕ Fechar</button>
</header>
<main>${body}</main>
<p class="hint" id="dica" hidden>Para voltar ao treino, feche esta aba do navegador.</p>
<script>
  document.getElementById('fechar').addEventListener('click', function () {
    var dica = document.getElementById('dica');
    if (history.length > 1) history.back();
    else window.close();
    setTimeout(function () { dica.hidden = false; }, 500);
  });
</script>
</body>
</html>`;
  return new Response(html, {
    status: row ? 200 : 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
