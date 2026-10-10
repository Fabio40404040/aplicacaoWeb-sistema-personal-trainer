import { adminOpenLibrary, adminSyncLibrary, copyFromLibrary, libraryOverview } from "./routes/farisa-library.js";
import { activateTrainer, switchTrainer } from "./routes/student-links.js";
import { sendNoticeEmail } from "./lib/recovery-email.js";
import { withDb } from "./lib/db.js";
import { corsHeaders, json, readJson } from "./lib/http.js";
import { runBillingNotices } from "./routes/billing-notices.js";
import { resendVerification, verifyEmailPage } from "./routes/account-emails.js";
import { deleteOwnAccount,
  changeOwnEmail, exportAccount, onboarding } from "./routes/account-self.js";
import { useEnv } from "./lib/notify.js";
import { createSession, isRevoked, readSession, revokeSession, sessionSignature } from "./lib/session.js";
import { addAttempt, attemptKeys, clearAttempts, isBlocked } from "./lib/rate-limit.js";
import {
  adminAuditLog,
  adminBilling,
  adminCreateTrainer,
  adminDeleteTrainer,
  adminSetTrainerTrial,
  adminConfirmTrainerEmail,
  adminImpersonate,
  adminLogin,
  adminOverview,
  adminReplyTicket,
  adminResetTrainerPassword,
  adminSetTrainerStatus,
  adminTicket,
  adminTickets,
  adminTrainers,
  adminUpdateTrainer,
  audit,
  currentAdmin,
} from "./routes/admin.js";
import { createTicket, replyTicket, supportAccess, trainerTicket, trainerTickets } from "./routes/support.js";
import { deleteStudentAccount } from "./routes/student-account.js";
import {
  adminSavePlans,
  adminSetTrainerPlan,
  billingInfo,
  registerTrainer,
  saasCardConfig,
  saasCardPayment,
  saasPlans,
  saasState,
  seatProblem,
  startSaasCheckout,
} from "./routes/saas.js";
import { adminRecovery } from "./routes/admin-recovery.js";
import { login } from "./routes/auth.js";
import { personalRecovery } from "./routes/personal-recovery.js";
import { studentAuth } from "./routes/student-auth.js";
import { studentRecovery } from "./routes/student-recovery.js";
import { dashboard } from "./routes/dashboard.js";
import { answerCheckin } from "./routes/checkins.js";
import {
  cancelStudentBooking,
  createStudentBooking,
  getBookingConfig,
  saveBookingConfig,
  studentBooking,
  studentBookingSlots,
  trainerFreeSlots,
} from "./routes/booking.js";
import {
  trainerProfile,
  updateStudentProfile,
  updateTrainerProfile,
} from "./routes/profile.js";
import {
  createResource,
  deleteResource,
  listResource,
  updateResource,
  trainerSetLoad,
} from "./routes/resources.js";
import { updateStudentAccess } from "./routes/access.js";
import {
  acceptPrivacy,
  changePlan,
  studentPortal,
  submitCheckin,
  studentSetLoad,
} from "./routes/student-portal.js";
import { setTrainingDay, setWater } from "./routes/student-tools.js";
import { deletePhoto, photoPoses, savePhoto, savePhotoPoses, studentPhoto, trainerPhoto } from "./routes/assessment-photos.js";
import { deleteSelfPhoto, publishAssessment, saveSelfAssessment, saveSelfPhoto } from "./routes/self-assessment.js";
import { lockedForAccount, lockedMessage, STUDENT_LOCKED, trainerLocked } from "./routes/plan-access.js";
import {
  cardPaymentConfig,
  createCardPayment,
  createPixPayment,
  mercadoPagoWebhook,
  reconcileStudentPayments,
  manualPixDecision,
  manualPixPaid,
  paymentOptions,
} from "./routes/payments.js";
import { demoSession } from "./routes/demo.js";
import { demoReadOnly, isDemoEmail } from "./lib/demo.js";
import { trainerIdForSlug, publicSite, publicSiteHero, saveSite, saveSiteHero, siteIcon, siteManifest, siteSettings } from "./routes/site.js";
import {
  payoutConnectUrl,
  payoutDisconnect,
  payoutInfo,
  payoutOAuthCallback,
  payoutRemovePix,
  payoutSavePix,
  payoutSetMode,
} from "./routes/payout.js";
import {
  deleteReadyWorkout,
  studentReadyWorkoutFile,
  trainerReadyWorkoutFile,
  updateReadyWorkout,
  uploadReadyWorkout,
} from "./routes/ready-workouts.js";
import {
  deleteExerciseVideo,
  studentExerciseVideoFile,
  trainerExerciseVideoFile,
  uploadExerciseVideo,
} from "./routes/exercise-videos.js";
import {
  deleteExerciseGif,
  listExerciseGifs,
  publicExerciseGifFile,
  publicExerciseGifPage,
  studentExerciseGifFile,
  trainerExerciseGifFile,
  uploadExerciseGif,
} from "./routes/exercise-gifs.js";
import {
  createMuscleGroup,
  saveFolderOrder,
  deleteMuscleGroup,
  listMuscleGroups,
} from "./routes/muscle-groups.js";
import {
  createReadyProgram,
  deleteReadyProgram,
  publicReadyPreview,
  publicReadyPreviewFrame,
  setReadyProgramSitePreview,
  updateReadyProgram,
} from "./routes/ready-programs.js";


// Login e "esqueci a senha" com limite de tentativas (contra força bruta).
const LIMITED_ROUTES = {
  "auth/login": "login",
  "student/auth/login": "login",
  "admin/auth/login": "login",
  "auth/forgot": "forgot",
  "student/auth/forgot": "forgot",
  "admin/auth/forgot": "forgot",
  "auth/register": "forgot",
  // Troca de e-mail pede a senha: barra quem tenta adivinhar.
  "account/email": "forgot",
  // Cadastro de aluno e cartão: barra robô criando contas e testando cartões.
  "student/auth/register": "signup",
  "student/payments/card": "card",
  "billing/card": "card",
};
// [por conta, por aparelho/rede] a cada 15 minutos.
const ATTEMPT_LIMITS = { login: [8, 40], forgot: [5, 20], signup: [3, 8], card: [5, 12] };
async function handle(request, env) {
  const route = new URL(request.url).pathname.replace(/^\/api\/?/u, "").replace(/\/+$/u, "");
  const kind = request.method === "POST" ? LIMITED_ROUTES[route] : null;
  if (!kind || !env.DB) return handleRoutes(request, env);
  let email = "";
  if (kind === "card") {
    // No cartão a "conta" é quem está logado (o corpo não traz e-mail).
    email = (await readSession(request, env))?.sub || "";
  } else
    try {
      email = (await request.clone().json())?.email || "";
    } catch {
      // corpo inválido: a rota responde o erro normal
    }
  // Contas de demonstração são públicas: ninguém redefine a senha delas.
  if (route.endsWith("auth/forgot") && isDemoEmail(email))
    return { error: "Esta é uma conta de demonstração: a senha dela não pode ser redefinida.", status: 403 };
  const { account: accountOnly, ip } = attemptKeys(request, route, email);
  // No login a trava "por conta" vale por conta + aparelho: quem erra a senha
  // de propósito bloqueia só a si mesmo, não o dono da conta. A conta inteira
  // só trava com muitas tentativas vindas de vários lugares.
  const account = kind === "login" ? `${accountOnly}|${ip}` : accountOnly;
  // Sem e-mail/conta não existe chave "por conta": vale só a do aparelho.
  const keys = String(email || "").trim() ? [account, ip] : [ip];
  const limits = ATTEMPT_LIMITS[kind];
  const blocked = await withDb(env, async (db) =>
    (keys.length > 1 && (await isBlocked(db, [account], limits[0]))) ||
    (await isBlocked(db, [ip], limits[1])) ||
    (kind === "login" && keys.length > 1 && (await isBlocked(db, [accountOnly], 30))),
  );
  if (blocked)
    return {
      error:
        kind === "card"
          ? "Muitas tentativas de pagamento com cartão. Aguarde 15 minutos ou pague com Pix."
          : "Muitas tentativas. Aguarde 15 minutos e tente de novo.",
      status: 429,
    };
  const result = await handleRoutes(request, env);
  // Login só conta os erros; o resto conta toda tentativa.
  const failed = kind !== "login" || [400, 401, 403].includes(result?.status);
  await withDb(env, (db) =>
    failed
      ? addAttempt(db, kind === "login" && keys.length > 1 ? [...keys, accountOnly] : keys)
      : clearAttempts(db, [account]),
  );
  return result;
}

async function handleRoutes(request, env) {
  const url = new URL(request.url);
  const segments = url.pathname
    .replace(/^\/api\/?/u, "")
    .split("/")
    .filter(Boolean);
  const route = segments.join("/");
  // Link do selo "GIF" no PDF baixado: sem sessao, so o id do GIF (uuid
  // aleatorio) protege o acesso. Ver nota em publicExerciseGifFile.
  if (
    request.method === "GET" &&
    segments[0] === "public" &&
    segments[1] === "exercise-gifs" &&
    segments[2]
  )
    return withDb(env, (db) =>
      segments[3] === "ver"
        ? publicExerciseGifPage(db, segments[2])
        : publicExerciseGifFile(env, db, segments[2]),
    );
  // Prévia do card "Treinos Prontos" no site (pública, só leitura).
  if (request.method === "GET" && route === "public/ready-preview")
    return withDb(env, (db) => publicReadyPreview(db));
  if (
    request.method === "GET" &&
    segments[0] === "public" &&
    segments[1] === "ready-preview" &&
    segments[2] === "frame" &&
    segments[3]
  )
    return withDb(env, (db) => publicReadyPreviewFrame(env, db, segments[3]));
  if (request.method === "GET" && route === "payments/mercadopago/oauth")
    return withDb(env, (db) => payoutOAuthCallback(request, env, db));
  if (request.method === "POST" && route === "payments/mercadopago/webhook")
    return withDb(env, (db) => mercadoPagoWebhook(request, env, db));
  if (
    request.method === "POST" &&
    ["student/auth/forgot", "student/auth/reset"].includes(route)
  )
    return withDb(env, (db) => studentRecovery(request, env, db, segments[2]));
  if (
    request.method === "POST" &&
    ["auth/forgot", "auth/reset"].includes(route)
  )
    return withDb(env, (db) => personalRecovery(request, env, db, segments[1]));
  // Cadastro do personal (teste grátis) e planos da plataforma.
  if (request.method === "POST" && route === "auth/register")
    return withDb(env, async (db) => registerTrainer(env, db, await readJson(request)));
  if (request.method === "POST" && segments[0] === "public" && segments[1] === "demo" && segments[2])
    return withDb(env, (db) => demoSession(env, db, segments[2]));
  if (request.method === "GET" && segments[0] === "public" && segments[1] === "site" && segments.length <= 3)
    return withDb(env, (db) => publicSite(db, segments[2] || ""));
  if (request.method === "GET" && segments[0] === "public" && segments[1] === "site-manifest" && segments[2])
    return withDb(env, (db) => siteManifest(db, segments[2]));
  if (request.method === "GET" && segments[0] === "public" && segments[1] === "site-icon" && segments[2])
    return withDb(env, (db) => siteIcon(db, segments[2], segments[3]));
  if (request.method === "GET" && segments[0] === "public" && segments[1] === "site-hero" && segments[2])
    return withDb(env, (db) => publicSiteHero(db, segments[2], new URL(request.url).searchParams.get("kind")));
  if (request.method === "GET" && route === "public/saas-plans")
    return withDb(env, async (db) => ({ data: await saasPlans(db) }));
  // Avisos de vencimento da assinatura. Pode ser chamado por um agendador
  // externo, se um dia houver. É seguro deixar aberto: roda no máximo a cada
  // 6 horas e cada aviso sai uma vez só.
  // Link de confirmação que vai no e-mail de boas-vindas.
  if (request.method === "GET" && route === "public/verify-email")
    return withDb(env, (db) => verifyEmailPage(db, new URL(request.url).searchParams.get("token")));
  // Erro na tela de quem usa (aluno, personal ou admin): o navegador avisa
  // aqui. Fica em Admin → Registro de ações → Erros do sistema ("TELA").
  if (request.method === "POST" && route === "public/client-error") {
    const body = await request.json().catch(() => ({}));
    const clip = (value, max) => String(value || "").replace(/[\u0000-\u001f<>]/gu, " ").trim().slice(0, max);
    const message = clip(body?.message, 200);
    if (message) {
      const who = await readSession(request, env).catch(() => null);
      const area = ["aluno", "personal", "admin", "site"].includes(body?.area) ? body.area : "site";
      const detail = [
        `Área: ${area}`,
        who?.email ? `Conta: ${clip(who.email, 120)}${who.viewAs ? " (vendo como aluno)" : ""}` : "",
        `Página: ${clip(body?.page, 160)}`,
        body?.source ? `Arquivo: ${clip(body.source, 160)}:${Number(body.line) || 0}` : "",
        `Aparelho: ${clip(body?.device, 160)}`,
        body?.stack ? `Detalhe: ${clip(body.stack, 500)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await withDb(env, async (db) => {
        // Mesmo erro na mesma área nas últimas 6 h: não repete na lista.
        const text = `[${area}] ${message}`;
        const seen = (
          await db.query("SELECT 1 AS x FROM error_log WHERE route='TELA' AND message=$1 AND created_at >= datetime('now','-6 hours') LIMIT 1", [text])
        ).rows[0];
        if (!seen)
          await db.batch([
            { sql: "INSERT INTO error_log (route, message, detail) VALUES ('TELA',$1,$2)", values: [text, detail] },
            { sql: "DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - 500", values: [] },
          ]);
      }).catch(() => {});
    }
    return new Response(null, { status: 204 });
  }
  // Modo "só observar" da política de segurança: o navegador avisa aqui o que
  // seria bloqueado. Fica em Admin → Registro de ações → Erros do sistema.
  if (request.method === "POST" && route === "public/csp-report") {
    const body = await request.json().catch(() => ({}));
    const report = body?.["csp-report"] || (Array.isArray(body) ? body[0]?.body : body) || {};
    const blocked = String(report["blocked-uri"] || report.blockedURL || "").slice(0, 200);
    const directive = String(report["effective-directive"] || report["violated-directive"] || report.effectiveDirective || "").slice(0, 80);
    if (blocked && directive)
      await withDb(env, async (db) => {
        const message = `CSP: ${directive} bloquearia ${blocked.replace(/[?#].*$/u, "")}`;
        // Um registro por combinação: não enche a lista com repetidos.
        const seen = (await db.query("SELECT 1 AS x FROM error_log WHERE route='CSP' AND message=$1 LIMIT 1", [message])).rows[0];
        if (!seen)
          await db.batch([
            {
              sql: "INSERT INTO error_log (route, message, detail) VALUES ('CSP',$1,$2)",
              values: [message, String(report["document-uri"] || report.documentURL || "").slice(0, 300)],
            },
            { sql: "DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - 500", values: [] },
          ]);
      }).catch(() => {});
    return new Response(null, { status: 204 });
  }
  if (request.method === "POST" && route === "public/cron")
    return withDb(env, async (db) => {
      await runBillingNotices(env, db);
      return { data: { ok: true } };
    });
  if (request.method === "POST" && route === "auth/login")
    return withDb(env, (db) => login(request, env, db));
  if (
    request.method === "POST" &&
    ["student/auth/login", "student/auth/register"].includes(route)
  )
    return withDb(env, (db) => studentAuth(request, env, db, segments[2]));

  // Área do administrador da plataforma (/admin): login e sessão próprios.
  if (request.method === "POST" && route === "admin/auth/login")
    return withDb(env, (db) => adminLogin(request, env, db));
  if (
    request.method === "POST" &&
    ["admin/auth/forgot", "admin/auth/reset"].includes(route)
  )
    return withDb(env, (db) =>
      adminRecovery(request, env, db, segments[2]),
    );

  const session = await readSession(request, env);
  if (!session) return { error: "Sessão inválida ou expirada.", status: 401 };
  // "Sair" encerra a sessão aqui também: o token deixa de valer na hora.
  const signature = sessionSignature(request);
  if (env.DB && (await withDb(env, (db) => isRevoked(db, signature))))
    return { error: "Sessão inválida ou expirada.", status: 401 };
  if (request.method === "POST" && ["auth/logout", "student/auth/logout", "admin/auth/logout"].includes(route)) {
    // Demonstração e acesso de suporte são sessões compartilhadas/temporárias.
    if (!isDemoEmail(session.email)) await withDb(env, (db) => revokeSession(db, signature, session.exp));
    return { data: { ok: true } };
  }
  // Contas de demonstração (abertas a qualquer visitante): só leitura.
  if (isDemoEmail(session.email) && !["GET", "HEAD"].includes(request.method)) return demoReadOnly;
  if (segments[0] === "admin" || session.role === "admin") {
    if (session.role !== "admin")
      return { error: "Acesso exclusivo do administrador.", status: 403 };
    if (segments[0] !== "admin")
      return { error: "A sessão do administrador só vale na área /admin.", status: 403 };
    return withDb(env, async (db) => {
      const admin = await currentAdmin(db, session);
      if (!admin) return { error: "Sessão inválida ou expirada.", status: 401 };
      if (request.method === "GET" && route === "admin/me") return { data: admin };
      if (request.method === "GET" && route === "admin/trainers")
        return { data: await adminTrainers(db) };
      if (request.method === "GET" && route === "admin/overview")
        return { data: await adminOverview(db) };
      if (request.method === "POST" && route === "admin/trainers")
        return adminCreateTrainer(db, admin, await readJson(request));
      if (segments[1] === "trainers" && segments[2]) {
        const id = segments[2];
        if (request.method === "PUT" && !segments[3])
          return adminUpdateTrainer(db, admin, id, await readJson(request));
        if (request.method === "POST" && segments[3] === "status")
          return adminSetTrainerStatus(db, admin, id, await readJson(request));
        if (request.method === "POST" && segments[3] === "password")
          return adminResetTrainerPassword(db, admin, id);
        if (request.method === "POST" && segments[3] === "impersonate")
          return adminImpersonate(env, db, admin, id, await readJson(request));
        if (request.method === "POST" && segments[3] === "delete")
          return adminDeleteTrainer(env, db, admin, id, await readJson(request));
        if (request.method === "POST" && segments[3] === "confirm-email")
          return adminConfirmTrainerEmail(db, admin, id);
        if (request.method === "POST" && segments[3] === "trial")
          return adminSetTrainerTrial(db, admin, id, await readJson(request));
      }
      if (request.method === "GET" && route === "admin/saas-plans")
        return { data: await saasPlans(db, { includeInactive: true }) };
      if (request.method === "PUT" && route === "admin/saas-plans") {
        const result = await adminSavePlans(db, await readJson(request));
        if (!result.error) await audit(db, admin, "saas_plans_updated", { type: "plans", label: "Planos da plataforma" });
        return result;
      }
      if (request.method === "POST" && segments[1] === "trainers" && segments[2] && segments[3] === "plan") {
        const body = await readJson(request);
        const result = await adminSetTrainerPlan(db, segments[2], body);
        if (!result.error)
          await audit(db, admin, "trainer_plan_set", { type: "trainer", id: segments[2], label: segments[2] },
            `${body.planCode} até ${body.expiresAt || "sem vencimento"}`);
        return result;
      }
      // Teste de e-mail: envia uma mensagem e mostra a resposta exata da Brevo.
      if (request.method === "POST" && route === "admin/email-test") {
        const to = String((await readJson(request))?.to || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(to)) return { error: "Informe um e-mail válido.", status: 400 };
        const response = await sendNoticeEmail(env, {
          to,
          subject: "Teste de envio — FARISA",
          html: '<p style="font-family:Arial,sans-serif">Este é um e-mail de teste enviado pelo painel do administrador da FARISA. Se você recebeu, o envio está funcionando.</p>',
        }).catch((error) => ({ ok: false, status: 0, text: async () => String(error?.message || error) }));
        await audit(db, admin, "email_test", { type: "email", label: to });
        if (!response)
          return { data: { ok: false, configured: false, detail: "Envio não configurado: falta BREVO_API_KEY ou EMAIL_FROM no Cloudflare." } };
        const body = (await response.text().catch(() => "")).slice(0, 400);
        return { data: { ok: Boolean(response.ok), configured: true, status: response.status, from: env.EMAIL_FROM || env.BREVO_FROM_EMAIL || "", detail: body } };
      }
      if (request.method === "GET" && route === "admin/errors")
        return {
          data: (
            await db
              .query(`SELECT id, created_at AS "createdAt", route, message, detail FROM error_log ORDER BY id DESC LIMIT 100`)
              .catch(() => ({ rows: [] }))
          ).rows,
        };
      // Limpar a lista de erros (depois de resolvidos).
      if (request.method === "DELETE" && route === "admin/errors") {
        await db.query("DELETE FROM error_log").catch(() => {});
        await audit(db, admin, "errors_cleared", { type: "errors", label: "Erros do sistema" });
        return { data: { ok: true } };
      }
      // Biblioteca FARISA: números e abrir para editar no painel.
      if (request.method === "GET" && route === "admin/library")
        return { data: await libraryOverview(db) };
      if (request.method === "POST" && route === "admin/library/open")
        return adminOpenLibrary(env, db, admin);
      if (request.method === "POST" && route === "admin/library/sync")
        return adminSyncLibrary(db, admin);
      if (request.method === "GET" && route === "admin/billing")
        return { data: await adminBilling(db) };
      if (request.method === "GET" && route === "admin/audit")
        return { data: await adminAuditLog(db) };
      if (request.method === "GET" && route === "admin/support")
        return { data: await adminTickets(db) };
      if (request.method === "GET" && segments[1] === "support" && segments[2])
        return adminTicket(db, segments[2]);
      if (request.method === "POST" && segments[1] === "support" && segments[2])
        return adminReplyTicket(env, db, admin, segments[2], await readJson(request));
      return { error: "Rota não encontrada.", status: 404 };
    });
  }
  if (segments[0] === "student") {
    if (session.role !== "student")
      return { error: "Use sua conta de aluno.", status: 403 };
    return withDb(env, async (db) => {
      // Senha trocada (ou "sair de todos") invalida tokens antigos em todas
      // as rotas do aluno, não só em student/me.
      const account = (
        await db.query(
          "SELECT id FROM student_accounts WHERE id=$1 AND auth_version=$2 LIMIT 1",
          [session.sub, session.version || 0],
        )
      ).rows[0];
      if (!account) return { error: "Sessão inválida ou expirada.", status: 401 };
      // "Ver como o aluno" (personal ou suporte): só leitura.
      if (session.viewAs && !["GET", "HEAD"].includes(request.method))
        return { error: "Você está vendo como o aluno: nada é salvo neste modo.", status: 403 };
      // Aluno com mais de um personal escolhe qual ver.
      if (request.method === "POST" && route === "student/switch-trainer")
        return switchTrainer(db, session.sub, await readJson(request));
      // Cada pedido diz de qual página de personal veio (cabeçalho
      // X-Farisa-Site; em student/me também ?site=). Assim, com o aluno aberto
      // em duas páginas (ex.: celular num personal e computador no outro),
      // cada uma vê e grava no personal certo, sem um trocar o do outro.
      const site = String(
        (route === "student/me" && url.searchParams.get("site")) || request.headers.get("X-Farisa-Site") || "",
      ).toLowerCase();
      let siteStudentId = null;
      if (/^[a-z0-9-]{3,30}$/u.test(site)) {
        const siteTrainer = await trainerIdForSlug(db, site).catch(() => null);
        if (siteTrainer) siteStudentId = (await activateTrainer(db, session.sub, siteTrainer).catch(() => false)) || null;
      }
      if (request.method === "GET" && route === "student/me") {
        await reconcileStudentPayments(
          db,
          session.sub,
          env,
        );
        const data = await studentPortal(db, session.sub, session.version, siteStudentId);
        return data
          ? { data }
          : { error: "Conta não encontrada.", status: 401 };
      }
      if (request.method === "POST" && route === "student/privacy-accept")
        return acceptPrivacy(db, session.sub);
      if (request.method === "POST" && route === "student/profile")
        return updateStudentProfile(db, session.sub, await readJson(request));
      if (request.method === "GET" && route === "student/booking")
        return studentBooking(db, session.sub);
      if (request.method === "GET" && route === "student/booking/slots")
        return studentBookingSlots(db, session.sub, url);
      // Agendamento pelo aluno e check-in: só nos planos pagos do personal.
      if (
        request.method === "POST" &&
        ["student/booking", "student/checkins"].includes(route) &&
        (await lockedForAccount(db, session.sub))
      )
        return { error: STUDENT_LOCKED, status: 403 };
      if (request.method === "POST" && route === "student/booking")
        return createStudentBooking(db, session.sub, await readJson(request), env);
      if (
        request.method === "POST" &&
        segments[1] === "booking" &&
        segments[2] &&
        segments[3] === "cancel"
      )
        return cancelStudentBooking(db, session.sub, segments[2], env);
      // Aluno ajusta a carga de um exercício da ficha dele.
      if (request.method === "POST" && segments[1] === "workouts" && segments[2] && segments[3] === "load")
        return studentSetLoad(db, session.sub, segments[2], await readJson(request));
      if (request.method === "GET" && segments[1] === "assessment-photos" && segments[2] && segments[3])
        return studentPhoto(db, session.sub, segments[2], segments[3]);
      // Autoavaliação: medidas e fotos enviadas pelo aluno (consultoria à distância).
      if (request.method === "POST" && route === "student/self-assessment")
        return saveSelfAssessment(db, session.sub, await readJson(request));
      if (segments[1] === "self-assessment" && segments[2] && segments[3] === "photos" && segments[4]) {
        if (request.method === "PUT") return saveSelfPhoto(db, session.sub, segments[2], segments[4], await readJson(request));
        if (request.method === "DELETE") return deleteSelfPhoto(db, session.sub, segments[2], segments[4]);
      }
      if (request.method === "POST" && route === "student/training-day")
        return setTrainingDay(db, session.sub, await readJson(request));
      if (request.method === "POST" && route === "student/water")
        return setWater(db, session.sub, await readJson(request));
      if (request.method === "POST" && route === "student/checkins")
        return submitCheckin(db, session.sub, await readJson(request));
      if (request.method === "POST" && route === "student/account/delete")
        return deleteStudentAccount(env, db, session.sub, await readJson(request));
      if (request.method === "POST" && route === "student/plan-change")
        return changePlan(db, session.sub, await readJson(request));
      // Personal com o plano cheio: aluno novo não paga até abrir vaga.
      if (
        request.method === "POST" &&
        ["student/payments/pix", "student/payments/card", "student/payments/manual-paid"].includes(route)
      ) {
        const noSeat = await seatProblem(db, { accountId: session.sub });
        if (noSeat) return { error: noSeat, status: 403 };
      }
      if (request.method === "GET" && route === "student/payments/options")
        return paymentOptions(db, session.sub, env);
      if (request.method === "POST" && route === "student/payments/manual-paid")
        return manualPixPaid(db, session.sub, await readJson(request));
      if (request.method === "GET" && route === "student/payments/card-config")
        return cardPaymentConfig(db, session.sub, env);
      if (request.method === "POST" && route === "student/payments/pix")
        return createPixPayment(db, session.sub, env);
      if (request.method === "POST" && route === "student/payments/card")
        return createCardPayment(db, session.sub, env, await readJson(request));
      if (
        request.method === "GET" &&
        segments[1] === "ready-workouts" &&
        segments[3] === "file"
      )
        return studentReadyWorkoutFile(env, db, session.sub, segments[2]);
      if (
        request.method === "GET" &&
        segments[1] === "exercise-videos" &&
        segments[3] === "file"
      )
        return studentExerciseVideoFile(env, db, session.sub, segments[2]);
      if (
        request.method === "GET" &&
        segments[1] === "exercise-gifs" &&
        (segments[3] === "file" || segments[3] === "frame")
      )
        return studentExerciseGifFile(
          env,
          db,
          session.sub,
          segments[2],
          segments[3],
        );
      return { error: "Rota não encontrada.", status: 404 };
    });
  }
  if (session.role !== "coach")
    return { error: "Acesso exclusivo do personal trainer.", status: 403 };

  return withDb(env, async (db) => {
    const trainer = await db.query(
      "SELECT id FROM trainers WHERE id=$1 AND auth_version=$2 LIMIT 1",
      [session.sub, session.version || 0],
    );
    if (!trainer.rows.length)
      return { error: "Sessão inválida ou expirada.", status: 401 };
    // Conta bloqueada pelo dono da plataforma (o acesso de suporte continua).
    if (!session.support) {
      const status = await db
        .query("SELECT status, blocked_reason AS reason FROM trainers WHERE id=$1", [session.sub])
        .then((result) => result.rows[0])
        .catch(() => null);
      if (status?.status === "blocked")
        return {
          error: `Conta bloqueada${status.reason ? `: ${status.reason}` : ""}. Fale com o suporte.`,
          status: 403,
        };
    }
    // Assinatura da plataforma (planos dos personais).
    if (request.method === "GET" && route === "billing")
      return billingInfo(env, db, session.sub);
    // Poses das fotos de evolução (nomes do personal e poses criadas por ele).
    if (route === "photo-poses" && request.method === "GET") return { data: await photoPoses(db, session.sub) };
    if (route === "photo-poses" && request.method === "PUT")
      return savePhotoPoses(db, session.sub, await readJson(request));
    // Publicar uma avaliação (ex.: a autoavaliação enviada pelo aluno).
    if (request.method === "POST" && segments[0] === "assessments" && segments[1] && segments[2] === "publish")
      return publishAssessment(db, session.sub, segments[1]);
    // Fotos de evolução de uma avaliação: /assessments/<id>/photos/<pose>
    if (segments[0] === "assessments" && segments[1] && segments[2] === "photos" && segments[3]) {
      if (request.method === "GET") return trainerPhoto(db, session.sub, segments[1], segments[3]);
      if (request.method === "PUT")
        return savePhoto(db, session.sub, segments[1], segments[3], await readJson(request));
      if (request.method === "DELETE") return deletePhoto(db, session.sub, segments[1], segments[3]);
    }
    if (request.method === "POST" && segments[0] === "workouts" && segments[1] && segments[2] === "load")
      return trainerSetLoad(db, session.sub, segments[1], await readJson(request));
    if (request.method === "POST" && route === "auth/resend-verification")
      return resendVerification(db, session.sub);
    if (request.method === "GET" && route === "onboarding") return onboarding(db, session.sub);
    if (request.method === "GET" && route === "account/export") return exportAccount(db, session.sub);
    if (request.method === "POST" && route === "account/email")
      return changeOwnEmail(db, session, await readJson(request));
    if (request.method === "POST" && route === "account/delete")
      return deleteOwnAccount(env, db, session, await readJson(request));
    if (request.method === "GET" && route === "billing/card-config")
      return saasCardConfig(env, db, session.sub, new URL(request.url).searchParams.get("plan"), new URL(request.url).searchParams.get("cycle"));
    if (request.method === "POST" && route === "billing/card")
      return saasCardPayment(env, db, session.sub, await readJson(request));
    if (request.method === "POST" && route === "billing/checkout")
      return startSaasCheckout(env, db, session.sub, await readJson(request));
    // "Meu site": marca, cor, banner, contato e preços dos planos do personal.
    if (request.method === "GET" && route === "site") return siteSettings(db, session.sub);
    if (request.method === "PUT" && route === "site") return saveSite(db, session.sub, await readJson(request));
    if (request.method === "PUT" && route === "site/hero")
      return saveSiteHero(db, session.sub, await readJson(request));
    // Recebimento do personal: conta Mercado Pago conectada ou chave Pix.
    if (segments[0] === "payout") {
      if (request.method === "GET" && route === "payout") return payoutInfo(db, env, session.sub);
      if (request.method === "POST" && route === "payout/mp/connect") return payoutConnectUrl(env, session.sub, db);
      if (request.method === "POST" && route === "payout/mp/disconnect") return payoutDisconnect(db, session.sub);
      if (request.method === "PUT" && route === "payout/pix")
        return payoutSavePix(db, session.sub, await readJson(request));
      if (request.method === "DELETE" && route === "payout/pix") return payoutRemovePix(db, session.sub);
      if (request.method === "PUT" && route === "payout/mode")
        return payoutSetMode(db, session.sub, await readJson(request));
      if (request.method === "POST" && segments[1] === "manual" && ["confirm", "reject"].includes(segments[3]))
        return manualPixDecision(db, session.sub, segments[2], segments[3]);
      return { error: "Rota não encontrada.", status: 404 };
    }
    const saas = await saasState(db, session.sub);
    if (request.method === "GET" && route === "support/access") return supportAccess(db, session.sub);
    if (request.method === "GET" && route === "support/tickets")
      return trainerTickets(db, session.sub);
    if (request.method === "POST" && route === "support/tickets")
      return createTicket(env, db, session.sub, await readJson(request));
    if (request.method === "GET" && segments[0] === "support" && segments[1] === "tickets" && segments[2])
      return trainerTicket(db, session.sub, segments[2]);
    if (request.method === "POST" && segments[0] === "support" && segments[1] === "tickets" && segments[2])
      return replyTicket(env, db, session.sub, segments[2], await readJson(request));
    if (request.method === "GET" && segments[0] === "dashboard")
      return { data: await dashboard(db, session.sub) };
    if (
      request.method === "PUT" &&
      segments[0] === "checkins" &&
      segments[1] &&
      segments[2] === "feedback"
    )
      return answerCheckin(db, session.sub, segments[1], await readJson(request));
    if (request.method === "GET" && route === "booking/config")
      return getBookingConfig(db, session.sub);
    if (request.method === "PUT" && route === "booking/config")
      return saveBookingConfig(db, session.sub, await readJson(request));
    if (request.method === "GET" && route === "booking/slots")
      return trainerFreeSlots(db, session.sub, url);
    if (request.method === "GET" && route === "profile") {
      const profile = await trainerProfile(db, session.sub);
      return profile
        ? { data: profile }
        : { error: "Perfil indisponível: rode a migração 018.", status: 503 };
    }
    if (request.method === "PUT" && route === "profile")
      return updateTrainerProfile(db, session.sub, await readJson(request));
    // "Ver como o aluno": sessão de aluno só leitura, por 1 hora.
    if (request.method === "POST" && segments[0] === "students" && segments[1] && segments[2] === "view-as") {
      const student = (
        await db.query(
          `SELECT s.name, a.id, a.email, a.auth_version FROM students s JOIN student_accounts a ON a.id=s.account_id
           WHERE s.id=$1 AND s.trainer_id=$2`,
          [segments[1], session.sub],
        )
      ).rows[0];
      if (!student) return { error: "Este aluno ainda não tem conta de acesso.", status: 404 };
      const slug = (await db.query("SELECT slug FROM trainer_site WHERE trainer_id=$1", [session.sub]).catch(() => ({ rows: [] }))).rows[0]?.slug;
      return {
        data: {
          token: await createSession(student, env, "student", { viewAs: session.sub }, 3600),
          slug: slug || null,
          name: student.name,
        },
      };
    }
    if (
      request.method === "PUT" &&
      segments[0] === "students" &&
      segments[2] === "access"
    )
      return updateStudentAccess(
        db,
        session.sub,
        segments[1],
        await readJson(request),
      );
    if (request.method === "POST" && route === "ready-programs") {
      const result = await createReadyProgram(
        db,
        session.sub,
        await readJson(request),
      );
      return result?.error ? result : { data: result, status: 201 };
    }
    if (
      request.method === "PUT" &&
      segments[0] === "ready-programs" &&
      segments[1] &&
      segments[2] === "site-preview"
    )
      return setReadyProgramSitePreview(
        db,
        session.sub,
        segments[1],
        await readJson(request),
      );
    if (
      request.method === "PUT" &&
      segments[0] === "ready-programs" &&
      segments[1]
    ) {
      const result = await updateReadyProgram(
        db,
        session.sub,
        segments[1],
        await readJson(request),
      );
      return result?.error ? result : { data: result };
    }
    if (
      request.method === "DELETE" &&
      segments[0] === "ready-programs" &&
      segments[1]
    ) {
      const result = await deleteReadyProgram(db, session.sub, segments[1]);
      return result
        ? { data: null, status: 204 }
        : { error: "Treino não encontrado.", status: 404 };
    }
    if (request.method === "POST" && route === "ready-workouts") {
      const result = await uploadReadyWorkout(request, env, db, session.sub);
      return result?.error ? result : { data: result, status: 201 };
    }
    if (
      request.method === "DELETE" &&
      segments[0] === "ready-workouts" &&
      segments[1]
    ) {
      const result = await deleteReadyWorkout(
        env,
        db,
        session.sub,
        segments[1],
      );
      return result?.error ? result : { data: null, status: 204 };
    }
    if (
      request.method === "PUT" &&
      segments[0] === "ready-workouts" &&
      segments[1]
    ) {
      const result = await updateReadyWorkout(
        db,
        session.sub,
        segments[1],
        await readJson(request),
      );
      return result?.error ? result : { data: result };
    }
    if (
      request.method === "GET" &&
      segments[0] === "ready-workouts" &&
      segments[2] === "file"
    )
      return trainerReadyWorkoutFile(env, db, session.sub, segments[1]);
    if (request.method === "POST" && route === "exercise-videos") {
      if (await trainerLocked(db, session.sub))
        return { error: lockedMessage("O envio de vídeos próprios"), status: 403 };
      const result = await uploadExerciseVideo(request, env, db, session.sub);
      return result?.error ? result : { data: result, status: 201 };
    }
    if (
      request.method === "DELETE" &&
      segments[0] === "exercise-videos" &&
      segments[1]
    ) {
      const result = await deleteExerciseVideo(
        env,
        db,
        session.sub,
        segments[1],
      );
      return result?.error ? result : { data: null, status: 204 };
    }
    if (
      request.method === "GET" &&
      segments[0] === "exercise-videos" &&
      segments[2] === "file"
    )
      return trainerExerciseVideoFile(env, db, session.sub, segments[1]);
    if (request.method === "PUT" && route === "exercise-folders/order")
      return saveFolderOrder(db, session.sub, await readJson(request));
    if (request.method === "GET" && route === "muscle-groups")
      return { data: await listMuscleGroups(db, session.sub) };
    if (request.method === "POST" && route === "muscle-groups") {
      const created = await createMuscleGroup(
        db,
        session.sub,
        await readJson(request),
      );
      return created?.error ? created : { data: created, status: 201 };
    }
    if (
      request.method === "DELETE" &&
      segments[0] === "muscle-groups" &&
      segments[1]
    ) {
      const removed = await deleteMuscleGroup(db, session.sub, segments[1]);
      return removed?.error ? removed : { data: null, status: 204 };
    }
    if (request.method === "GET" && route === "exercise-gifs")
      return { data: await listExerciseGifs(db, session.sub) };
    // Copiar exercícios da Biblioteca FARISA para "Meus exercícios".
    if (request.method === "POST" && route === "exercises/copy-from-library")
      return copyFromLibrary(db, session.sub, await readJson(request));
    if (request.method === "POST" && route === "exercise-gifs") {
      const result = await uploadExerciseGif(request, env, db, session.sub);
      return result?.error ? result : { data: result, status: 201 };
    }
    if (
      request.method === "DELETE" &&
      segments[0] === "exercise-gifs" &&
      segments[1]
    ) {
      const result = await deleteExerciseGif(env, db, session.sub, segments[1]);
      return result?.error ? result : { data: null, status: 204 };
    }
    if (
      request.method === "GET" &&
      segments[0] === "exercise-gifs" &&
      (segments[2] === "file" || segments[2] === "frame")
    )
      return trainerExerciseGifFile(
        env,
        db,
        session.sub,
        segments[1],
        segments[2],
      );
    const [resource, id] = segments;
    if (request.method === "GET" && !id)
      return { data: await listResource(db, resource, session.sub) };
    if (request.method === "POST" && !id && resource === "students" && saas?.studentLimit && saas.students >= saas.studentLimit)
      return {
        error: `Seu plano ${saas.planName} permite até ${saas.studentLimit} alunos. Para cadastrar mais, veja Minha assinatura ou fale com o suporte.`,
        status: 403,
      };
    if (request.method === "POST" && !id) {
      const created = await createResource(
        db,
        resource,
        session.sub,
        await readJson(request),
      );
      return created?.error ? created : { data: created, status: 201 };
    }
    if (request.method === "PUT" && id) {
      const updated = await updateResource(db, resource, session.sub, id, await readJson(request));
      return updated?.error ? updated : { data: updated };
    }
    if (request.method === "DELETE" && id) {
      const removed = await deleteResource(db, resource, session.sub, id);
      return removed?.error ? removed : { data: null, status: 204 };
    }
    return { error: "Rota não encontrada.", status: 404 };
  });
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    useEnv(env);
    // O Pages não tem tarefa agendada: os avisos de assinatura saem quando
    // alguém abre a vitrine, a página de um personal ou "Minha assinatura"
    // (no máximo uma rodada a cada 6 horas).
    if (
      env.DB &&
      request.method === "GET" &&
      ctx?.waitUntil &&
      /\/api\/(public\/saas-plans|public\/site|billing)\/?$/u.test(new URL(request.url).pathname)
    )
      ctx.waitUntil(withDb(env, (db) => runBillingNotices(env, db)).catch(() => {}));
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    try {
      const result = await handle(request, env);
      if (result instanceof Response) {
        const headers = new Headers(result.headers);
        Object.entries(cors).forEach(([name, value]) =>
          headers.set(name, value),
        );
        // Arquivos enviados por usuários nunca são interpretados como outro tipo.
        headers.set("X-Content-Type-Options", "nosniff");
        return new Response(result.body, { status: result.status, headers });
      }
      if (result?.error)
        return json({ error: result.error }, result.status || 400, cors);
      return json(result?.data ?? null, result?.status || 200, cors);
    } catch (error) {
      console.error(error);
      // Fica registrado para o admin ver (guarda só os 500 mais recentes).
      if (env.DB)
        await withDb(env, (db) =>
          db.batch([
            {
              sql: "INSERT INTO error_log (route, message, detail) VALUES ($1,$2,$3)",
              values: [
                `${request.method} ${new URL(request.url).pathname}`.slice(0, 200),
                String(error?.message || error).slice(0, 500),
                String(error?.stack || "").slice(0, 2000),
              ],
            },
            { sql: "DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - 500", values: [] },
          ]),
        ).catch(() => {});
      return json(
        { error: "Não foi possível concluir a solicitação." },
        500,
        cors,
      );
    }
  },
};
