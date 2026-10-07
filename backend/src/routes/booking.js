import { trainerLocked } from "./plan-access.js";
// Agenda integrada (migração 023): atendimentos online e presenciais,
// horários livres do personal, tipos de atendimento, cota mensal por plano e
// agendamento feito pelo próprio aluno.
import { sendNoticeEmail } from "../lib/recovery-email.js";

const MODALITIES = ["presencial", "online", "both"];
const PLAN_CODES = ["ready", "basic", "premium", "athlete"];
const MINUTE = 60_000;
const DAY = 86_400_000;
const STEP_MIN = 30;

const clampInt = (value, min, max, fallback) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const text = (value, max = 300) => {
  const clean = String(value ?? "").trim().slice(0, max);
  return clean || null;
};
const safeUrl = (value) => {
  const clean = text(value, 500);
  if (!clean) return null;
  try {
    const url = new URL(clean);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export async function bookingSchemaReady(db) {
  try {
    await db.query("SELECT 1 FROM booking_settings LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

// ---------- horário local do personal (Brasil: UTC-3, sem horário de verão)
const localParts = (time, offset) => {
  const d = new Date(time + offset * MINUTE);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay() };
};
const utcFromLocal = (y, m, d, minutes, offset) =>
  Date.UTC(y, m, d, 0, minutes) - offset * MINUTE;
const two = (n) => String(n).padStart(2, "0");
const localDateKey = (time, offset) => {
  const p = localParts(time, offset);
  return `${p.y}-${two(p.m + 1)}-${two(p.d)}`;
};
const localTime = (time, offset) => {
  const d = new Date(time + offset * MINUTE);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};
function monthRange(time, offset) {
  const p = localParts(time, offset);
  return [utcFromLocal(p.y, p.m, 1, 0, offset), utcFromLocal(p.y, p.m + 1, 1, 0, offset)];
}

// ---------- padrões (o personal revisa e ativa)
async function ensureDefaults(db, trainerId) {
  const existing = (
    await db.query("SELECT trainer_id FROM booking_settings WHERE trainer_id=$1", [trainerId])
  ).rows[0];
  if (existing) return;
  const id = () => crypto.randomUUID().replace(/-/gu, "");
  const services = [
    { id: id(), name: "Avaliação física", modality: "both", duration: 60,
      description: "Anamnese, composição corporal, medidas e testes. Presencial ou por vídeo." },
    { id: id(), name: "Consulta por vídeo", modality: "online", duration: 30,
      description: "Ajuste de treino, dúvidas e análise de execução por chamada de vídeo." },
    { id: id(), name: "Reavaliação", modality: "both", duration: 45,
      description: "Acompanhamento da evolução e ajuste do planejamento." },
    { id: id(), name: "Treino presencial", modality: "presencial", duration: 60,
      description: "Sessão de treino acompanhada pelo personal." },
  ];
  const [evaluation, video, reevaluation] = services;
  const quotas = [
    ["basic", evaluation.id, 1],
    ["premium", evaluation.id, 1],
    ["premium", video.id, 1],
    ["premium", reevaluation.id, 1],
    ["athlete", evaluation.id, 1],
    ["athlete", video.id, 2],
    ["athlete", reevaluation.id, 1],
  ];
  const rules = [];
  for (const weekday of [1, 2, 3, 4, 5]) {
    rules.push([weekday, 6 * 60, 12 * 60, "both"], [weekday, 17 * 60, 21 * 60, "both"]);
  }
  rules.push([6, 8 * 60, 12 * 60, "presencial"]);
  await db.batch([
    { sql: "INSERT INTO booking_settings (trainer_id) VALUES ($1) ON CONFLICT DO NOTHING", values: [trainerId] },
    ...services.map((service, position) => ({
      sql: `INSERT INTO booking_services (id,trainer_id,name,description,modality,duration_min,position)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      values: [service.id, trainerId, service.name, service.description, service.modality, service.duration, position],
    })),
    ...quotas.map(([plan, serviceId, perMonth]) => ({
      sql: "INSERT INTO booking_quotas (trainer_id,plan_code,service_id,per_month) VALUES ($1,$2,$3,$4)",
      values: [trainerId, plan, serviceId, perMonth],
    })),
    ...rules.map(([weekday, start, end, modality]) => ({
      sql: "INSERT INTO availability_rules (trainer_id,weekday,start_min,end_min,modality) VALUES ($1,$2,$3,$4,$5)",
      values: [trainerId, weekday, start, end, modality],
    })),
  ]);
}

async function loadConfig(db, trainerId) {
  await ensureDefaults(db, trainerId);
  const [settings, services, quotas, rules, blocks] = await db.batch([
    {
      sql: `SELECT enabled, auto_confirm AS "autoConfirm", min_notice_hours AS "minNoticeHours",
              cancel_hours AS "cancelHours", horizon_days AS "horizonDays", default_address AS "defaultAddress",
              default_meeting_url AS "defaultMeetingUrl", tz_offset_min AS "tzOffsetMin"
            FROM booking_settings WHERE trainer_id=$1`,
      values: [trainerId],
    },
    {
      sql: `SELECT id,name,description,modality,duration_min AS "durationMin",position,active
            FROM booking_services WHERE trainer_id=$1 ORDER BY position, created_at`,
      values: [trainerId],
    },
    {
      sql: `SELECT plan_code AS "planCode", service_id AS "serviceId", per_month AS "perMonth"
            FROM booking_quotas WHERE trainer_id=$1`,
      values: [trainerId],
    },
    {
      sql: `SELECT id,weekday,start_min AS "startMin",end_min AS "endMin",modality
            FROM availability_rules WHERE trainer_id=$1 ORDER BY weekday,start_min`,
      values: [trainerId],
    },
    {
      sql: `SELECT id,starts_at AS "startsAt",ends_at AS "endsAt",reason FROM availability_blocks
            WHERE trainer_id=$1 AND ends_at >= $2 ORDER BY starts_at`,
      values: [trainerId, new Date(Date.now() - DAY).toISOString()],
    },
  ]);
  const s = settings.rows[0];
  return {
    settings: {
      ...s,
      enabled: Boolean(s.enabled),
      autoConfirm: Boolean(s.autoConfirm),
    },
    services: services.rows.map((service) => ({ ...service, active: Boolean(service.active) })),
    quotas: quotas.rows,
    rules: rules.rows,
    blocks: blocks.rows,
  };
}

// ---------- painel do personal
export async function getBookingConfig(db, trainerId) {
  if (!(await bookingSchemaReady(db)))
    return { error: "Agenda online indisponível: rode a migração 023.", status: 503 };
  const config = await loadConfig(db, trainerId);
  const plans = (
    await db.query("SELECT code, name FROM plans WHERE active=1 ORDER BY price_cents")
  ).rows;
  return { data: { ...config, plans } };
}

export async function saveBookingConfig(db, trainerId, body) {
  if (!(await bookingSchemaReady(db)))
    return { error: "Agenda online indisponível: rode a migração 023.", status: 503 };
  await ensureDefaults(db, trainerId);
  const s = body?.settings || {};
  const meetingUrl = text(s.defaultMeetingUrl, 500);
  if (meetingUrl && !safeUrl(meetingUrl))
    return { error: "O link da chamada precisa começar com https://", status: 400 };

  const services = (Array.isArray(body?.services) ? body.services : [])
    .slice(0, 20)
    .map((service, position) => ({
      id: /^[a-z0-9]{8,40}$/u.test(String(service?.id || ""))
        ? service.id
        : crypto.randomUUID().replace(/-/gu, ""),
      name: text(service?.name, 80),
      description: text(service?.description, 300),
      modality: MODALITIES.includes(service?.modality) ? service.modality : "both",
      duration: clampInt(service?.durationMin, 15, 240, 60),
      active: service?.active === false ? 0 : 1,
      position,
    }))
    .filter((service) => service.name);
  if (!services.length)
    return { error: "Cadastre pelo menos um tipo de atendimento.", status: 400 };
  const serviceIds = new Set(services.map((service) => service.id));

  const rules = (Array.isArray(body?.rules) ? body.rules : [])
    .slice(0, 80)
    .map((rule) => ({
      weekday: clampInt(rule?.weekday, 0, 6, 1),
      start: clampInt(rule?.startMin, 0, 24 * 60, 0),
      end: clampInt(rule?.endMin, 0, 24 * 60, 0),
      modality: MODALITIES.includes(rule?.modality) ? rule.modality : "both",
    }))
    .filter((rule) => rule.end > rule.start);

  const quotas = (Array.isArray(body?.quotas) ? body.quotas : [])
    .filter(
      (quota) =>
        PLAN_CODES.includes(quota?.planCode) && serviceIds.has(quota?.serviceId),
    )
    .map((quota) => ({
      plan: quota.planCode,
      service: quota.serviceId,
      perMonth: clampInt(quota.perMonth, -1, 60, 0),
    }))
    .filter((quota) => quota.perMonth !== 0);

  const blocks = (Array.isArray(body?.blocks) ? body.blocks : [])
    .slice(0, 100)
    .map((block) => ({
      start: new Date(block?.startsAt),
      end: new Date(block?.endsAt),
      reason: text(block?.reason, 120),
    }))
    .filter(
      (block) =>
        !Number.isNaN(block.start.getTime()) &&
        !Number.isNaN(block.end.getTime()) &&
        block.end > block.start,
    );

  const keep = [...serviceIds];
  await db.batch([
    {
      sql: `UPDATE booking_settings SET enabled=$2, auto_confirm=$3, min_notice_hours=$4, cancel_hours=$5,
              horizon_days=$6, default_address=$7, default_meeting_url=$8, updated_at=CURRENT_TIMESTAMP
            WHERE trainer_id=$1`,
      values: [
        trainerId,
        s.enabled ? 1 : 0,
        s.autoConfirm === false ? 0 : 1,
        clampInt(s.minNoticeHours, 0, 168, 12),
        clampInt(s.cancelHours, 0, 168, 12),
        clampInt(s.horizonDays, 7, 90, 30),
        text(s.defaultAddress, 200),
        meetingUrl ? safeUrl(meetingUrl) : null,
      ],
    },
    {
      sql: `DELETE FROM booking_services WHERE trainer_id=$1 AND id NOT IN (${keep.map((_, i) => `$${i + 2}`).join(",")})`,
      values: [trainerId, ...keep],
    },
    ...services.map((service) => ({
      sql: `INSERT INTO booking_services (id,trainer_id,name,description,modality,duration_min,position,active)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
              modality=excluded.modality, duration_min=excluded.duration_min, position=excluded.position,
              active=excluded.active
            WHERE booking_services.trainer_id=excluded.trainer_id`,
      values: [service.id, trainerId, service.name, service.description, service.modality,
        service.duration, service.position, service.active],
    })),
    { sql: "DELETE FROM booking_quotas WHERE trainer_id=$1", values: [trainerId] },
    ...quotas.map((quota) => ({
      sql: "INSERT INTO booking_quotas (trainer_id,plan_code,service_id,per_month) VALUES ($1,$2,$3,$4)",
      values: [trainerId, quota.plan, quota.service, quota.perMonth],
    })),
    { sql: "DELETE FROM availability_rules WHERE trainer_id=$1", values: [trainerId] },
    ...rules.map((rule) => ({
      sql: "INSERT INTO availability_rules (trainer_id,weekday,start_min,end_min,modality) VALUES ($1,$2,$3,$4,$5)",
      values: [trainerId, rule.weekday, rule.start, rule.end, rule.modality],
    })),
    { sql: "DELETE FROM availability_blocks WHERE trainer_id=$1", values: [trainerId] },
    ...blocks.map((block) => ({
      sql: "INSERT INTO availability_blocks (trainer_id,starts_at,ends_at,reason) VALUES ($1,$2,$3,$4)",
      values: [trainerId, block.start.toISOString(), block.end.toISOString(), block.reason],
    })),
  ]);
  return { data: await loadConfig(db, trainerId) };
}

// ---------- horários livres
function freeSlots({ settings, rules, blocks, busy, durationMin, modality, now = Date.now() }) {
  const offset = settings.tzOffsetMin;
  const earliest = now + settings.minNoticeHours * 60 * MINUTE;
  const step = Math.min(STEP_MIN, durationMin);
  const taken = [
    ...busy.map((item) => [Date.parse(item.startsAt), Date.parse(item.endsAt)]),
    ...blocks.map((item) => [Date.parse(item.startsAt), Date.parse(item.endsAt)]),
  ];
  const today = localParts(now, offset);
  const days = new Map();
  for (let i = 0; i <= settings.horizonDays; i += 1) {
    const base = utcFromLocal(today.y, today.m, today.d + i, 0, offset);
    const day = localParts(base, offset);
    const dayRules = rules.filter(
      (rule) =>
        rule.weekday === day.wd &&
        (rule.modality === "both" || rule.modality === modality),
    );
    for (const rule of dayRules) {
      for (let t = rule.startMin; t + durationMin <= rule.endMin; t += step) {
        const start = utcFromLocal(day.y, day.m, day.d, t, offset);
        const end = start + durationMin * MINUTE;
        if (start < earliest) continue;
        if (taken.some(([a, b]) => start < b && end > a)) continue;
        const key = localDateKey(start, offset);
        if (!days.has(key)) days.set(key, new Map());
        days.get(key).set(start, { startsAt: new Date(start).toISOString(), time: localTime(start, offset) });
      }
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({
      date,
      slots: [...slots.entries()].sort(([a], [b]) => a - b).map(([, slot]) => slot),
    }));
}

async function busyFor(db, trainerId) {
  return (
    await db.query(
      `SELECT starts_at AS "startsAt", ends_at AS "endsAt" FROM appointments
       WHERE trainer_id=$1 AND status IN ('pending','scheduled') AND ends_at >= $2`,
      [trainerId, new Date().toISOString()],
    )
  ).rows;
}

// ---------- área do aluno
async function studentContext(db, accountId) {
  return (
    await db.query(
      `SELECT a.id AS "accountId", a.name AS "accountName", s.id, s.name, s.email, s.trainer_id AS "trainerId",
         s.plan_code AS "planCode", s.access_status AS "accessStatus", s.payment_status AS "paymentStatus",
         s.access_type AS "accessType", s.access_expires_at AS "accessExpiresAt",
         t.email AS "trainerEmail", t.name AS "trainerName"
       FROM student_accounts a JOIN students s ON s.id=a.student_id
       JOIN trainers t ON t.id=s.trainer_id WHERE a.id=$1 LIMIT 1`,
      [accountId],
    )
  ).rows[0];
}

function hasAccess(student) {
  if (
    !student ||
    student.accessStatus !== "active" ||
    !["paid", "waived"].includes(student.paymentStatus)
  )
    return false;
  if (student.accessType === "permanent") return true;
  return Boolean(student.accessExpiresAt && Date.parse(student.accessExpiresAt) > Date.now());
}

async function usedInMonth(db, student, serviceId, time, offset) {
  const [from, to] = monthRange(time, offset);
  return Number(
    (
      await db.query(
        `SELECT COUNT(*) AS n FROM appointments WHERE student_id=$1 AND service_id=$2
         AND status IN ('pending','scheduled','completed') AND starts_at >= $3 AND starts_at < $4`,
        [student.id, serviceId, new Date(from).toISOString(), new Date(to).toISOString()],
      )
    ).rows[0]?.n || 0,
  );
}

async function studentServices(db, student, config) {
  const quotas = new Map(
    config.quotas
      .filter((quota) => quota.planCode === student.planCode)
      .map((quota) => [quota.serviceId, Number(quota.perMonth)]),
  );
  const list = [];
  for (const service of config.services) {
    if (!service.active || !quotas.has(service.id)) continue;
    const perMonth = quotas.get(service.id);
    const used = await usedInMonth(db, student, service.id, Date.now(), config.settings.tzOffsetMin);
    list.push({
      id: service.id,
      name: service.name,
      description: service.description,
      modality: service.modality,
      durationMin: service.durationMin,
      perMonth,
      usedThisMonth: used,
      remaining: perMonth < 0 ? null : Math.max(0, perMonth - used),
    });
  }
  return list;
}

const appointmentColumns = `id, starts_at AS "startsAt", ends_at AS "endsAt", service, location, notes, status,
  modality, meeting_url AS "meetingUrl", service_id AS "serviceId", source`;

export async function studentBooking(db, accountId) {
  if (!(await bookingSchemaReady(db)))
    return { data: { enabled: false, reason: "schema", services: [], appointments: [], settings: {} } };
  const student = await studentContext(db, accountId);
  if (!student) return { error: "Conta não encontrada.", status: 404 };
  // Personal no Grátis básico: o aluno não agenda pelo app.
  if (await trainerLocked(db, student.trainerId))
    return { data: { enabled: false, reason: "plan", services: [], appointments: [], settings: {} } };
  const active = hasAccess(student);
  const appointments = active
    ? (
        await db.query(
          `SELECT ${appointmentColumns} FROM appointments
           WHERE student_id=$1 AND (
             (status IN ('pending','scheduled') AND ends_at >= $2) OR
             (status IN ('completed','cancelled') AND starts_at >= $3))
           ORDER BY starts_at LIMIT 40`,
          [student.id, new Date(Date.now() - 2 * 3600_000).toISOString(),
            new Date(Date.now() - 45 * DAY).toISOString()],
        )
      ).rows
    : [];
  const config = await loadConfig(db, student.trainerId);
  const cancelMs = config.settings.cancelHours * 3600_000;
  return {
    data: {
      enabled: active && config.settings.enabled,
      reason: !active ? "access" : config.settings.enabled ? null : "disabled",
      settings: {
        cancelHours: config.settings.cancelHours,
        minNoticeHours: config.settings.minNoticeHours,
        autoConfirm: config.settings.autoConfirm,
      },
      services: active ? await studentServices(db, student, config) : [],
      appointments: appointments.map((item) => ({
        ...item,
        canCancel:
          ["pending", "scheduled"].includes(item.status) &&
          Date.parse(item.startsAt) - Date.now() >= cancelMs,
      })),
    },
  };
}

export async function studentBookingSlots(db, accountId, url) {
  if (!(await bookingSchemaReady(db))) return { error: "Agenda indisponível.", status: 503 };
  const student = await studentContext(db, accountId);
  if (!hasAccess(student)) return { error: "Seu acesso não está ativo.", status: 403 };
  const config = await loadConfig(db, student.trainerId);
  if (!config.settings.enabled)
    return { error: "O agendamento online ainda não foi liberado pelo personal.", status: 403 };
  const service = config.services.find(
    (item) => item.id === url.searchParams.get("service") && item.active,
  );
  if (!service) return { error: "Escolha o tipo de atendimento.", status: 400 };
  const modality =
    service.modality === "both"
      ? url.searchParams.get("modality") === "online"
        ? "online"
        : "presencial"
      : service.modality;
  const days = freeSlots({
    settings: config.settings,
    rules: config.rules,
    blocks: config.blocks,
    busy: await busyFor(db, student.trainerId),
    durationMin: service.durationMin,
    modality,
  });
  return { data: { modality, days } };
}

const brDateTime = (iso, offset) => {
  const time = Date.parse(iso);
  const p = localParts(time, offset);
  return `${two(p.d)}/${two(p.m + 1)}/${p.y} às ${localTime(time, offset)}`;
};

async function notifyTrainer(env, student, subject, lines) {
  if (!env || !student?.trainerEmail) return;
  try {
    await sendNoticeEmail(env, {
      to: student.trainerEmail,
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18212d">
        <h1 style="font-size:20px">${subject}</h1>
        ${lines.map((line) => `<p style="margin:6px 0">${line}</p>`).join("")}
        <p style="font-size:13px;color:#526075;margin-top:22px">Veja na Agenda do FARISA Painel.</p></div>`,
    });
  } catch (error) {
    console.warn("[agenda] aviso por e-mail não enviado:", error?.message);
  }
}
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function createStudentBooking(db, accountId, body, env) {
  if (!(await bookingSchemaReady(db))) return { error: "Agenda indisponível.", status: 503 };
  const student = await studentContext(db, accountId);
  if (!hasAccess(student)) return { error: "Seu acesso não está ativo.", status: 403 };
  const config = await loadConfig(db, student.trainerId);
  if (!config.settings.enabled)
    return { error: "O agendamento online ainda não foi liberado pelo personal.", status: 403 };
  const services = await studentServices(db, student, config);
  const service = services.find((item) => item.id === body?.serviceId);
  if (!service) return { error: "Este atendimento não faz parte do seu plano.", status: 403 };
  const modality =
    service.modality === "both"
      ? body?.modality === "online"
        ? "online"
        : "presencial"
      : service.modality;
  const start = Date.parse(body?.startsAt);
  if (!Number.isFinite(start)) return { error: "Escolha um horário.", status: 400 };
  const offset = config.settings.tzOffsetMin;
  if (service.perMonth >= 0) {
    const used = await usedInMonth(db, student, service.id, start, offset);
    if (used >= service.perMonth)
      return {
        error: `Você já usou ${service.perMonth === 1 ? "o atendimento" : `os ${service.perMonth} atendimentos`} de "${service.name}" deste mês no seu plano.`,
        status: 409,
      };
  }
  const days = freeSlots({
    settings: config.settings,
    rules: config.rules,
    blocks: config.blocks,
    busy: await busyFor(db, student.trainerId),
    durationMin: service.durationMin,
    modality,
  });
  const iso = new Date(start).toISOString();
  if (!days.some((day) => day.slots.some((slot) => slot.startsAt === iso)))
    return { error: "Esse horário acabou de ser ocupado. Escolha outro.", status: 409 };
  const status = config.settings.autoConfirm ? "scheduled" : "pending";
  const row = (
    await db.query(
      // Só grava se ninguém ocupou o horário entre a consulta e agora
      // (dois alunos clicando no mesmo horário ao mesmo tempo).
      `INSERT INTO appointments (trainer_id,student_id,starts_at,ends_at,service,location,notes,status,modality,meeting_url,service_id,source)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'student'
       WHERE NOT EXISTS (
         SELECT 1 FROM appointments WHERE trainer_id=$1 AND status IN ('pending','scheduled')
         AND starts_at < $4 AND ends_at > $3)
       AND ($12 < 0 OR (SELECT COUNT(*) FROM appointments WHERE student_id=$2 AND service_id=$11
         AND status IN ('pending','scheduled','completed') AND starts_at >= $13 AND starts_at < $14) < $12)
       RETURNING ${appointmentColumns}`,
      [
        student.trainerId,
        student.id,
        iso,
        new Date(start + service.durationMin * MINUTE).toISOString(),
        service.name,
        modality === "presencial" ? config.settings.defaultAddress : null,
        text(body?.notes, 500),
        status,
        modality,
        modality === "online" ? config.settings.defaultMeetingUrl : null,
        service.id,
        service.perMonth,
        ...monthRange(start, offset).map((time) => new Date(time).toISOString()),
      ],
    )
  ).rows[0];
  if (!row)
    return {
      error: "Esse horário acabou de ser ocupado ou a cota do mês já foi usada. Atualize e tente de novo.",
      status: 409,
    };
  await notifyTrainer(
    env,
    student,
    status === "pending" ? "Novo pedido de agendamento" : "Novo agendamento",
    [
      `<b>${escapeHtml(student.name)}</b> agendou <b>${escapeHtml(service.name)}</b> (${modality === "online" ? "online" : "presencial"}).`,
      `Quando: ${brDateTime(iso, offset)}.`,
      status === "pending" ? "Confirme ou recuse na Agenda do painel." : "Já está confirmado na sua agenda.",
      body?.notes ? `Observação do aluno: ${escapeHtml(text(body.notes, 500))}` : "",
    ].filter(Boolean),
  );
  return { data: row, status: 201 };
}

export async function cancelStudentBooking(db, accountId, appointmentId, env) {
  if (!(await bookingSchemaReady(db))) return { error: "Agenda indisponível.", status: 503 };
  const student = await studentContext(db, accountId);
  if (!student) return { error: "Conta não encontrada.", status: 404 };
  const item = (
    await db.query(
      `SELECT ${appointmentColumns} FROM appointments WHERE id=$1 AND student_id=$2 LIMIT 1`,
      [appointmentId, student.id],
    )
  ).rows[0];
  if (!item || !["pending", "scheduled"].includes(item.status))
    return { error: "Atendimento não encontrado.", status: 404 };
  const config = await loadConfig(db, student.trainerId);
  if (Date.parse(item.startsAt) - Date.now() < config.settings.cancelHours * 3600_000)
    return {
      error: `Cancelamentos só com ${config.settings.cancelHours}h de antecedência. Fale com o personal pelo WhatsApp.`,
      status: 409,
    };
  await db.query(
    `UPDATE appointments SET status='cancelled', cancelled_by='student', updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
    [item.id],
  );
  await notifyTrainer(env, student, "Atendimento cancelado pelo aluno", [
    `<b>${escapeHtml(student.name)}</b> cancelou <b>${escapeHtml(item.service)}</b>.`,
    `Era em ${brDateTime(item.startsAt, config.settings.tzOffsetMin)}. O horário voltou a ficar livre.`,
  ]);
  return { data: { id: item.id, status: "cancelled" } };
}

// Personal: horários livres para encaixar um aluno (mesma regra do aluno,
// mas sem antecedência mínima).
export async function trainerFreeSlots(db, trainerId, url) {
  if (!(await bookingSchemaReady(db))) return { error: "Agenda indisponível.", status: 503 };
  const config = await loadConfig(db, trainerId);
  const durationMin = clampInt(url.searchParams.get("duration"), 15, 240, 60);
  const modality = url.searchParams.get("modality") === "online" ? "online" : "presencial";
  return {
    data: {
      days: freeSlots({
        settings: { ...config.settings, minNoticeHours: 0 },
        rules: config.rules,
        blocks: config.blocks,
        busy: await busyFor(db, trainerId),
        durationMin,
        modality,
      }),
    },
  };
}
