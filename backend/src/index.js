import { withDb } from "./lib/db.js";
import { corsHeaders, json, readJson } from "./lib/http.js";
import { runBillingNotices } from "./routes/billing-notices.js";
import { isRevoked, readSession, revokeSession, sessionSignature } from "./lib/session.js";
import { addAttempt, attemptKeys, clearAttempts, isBlocked } from "./lib/rate-limit.js";
import {
  adminAuditLog,
  adminCreateTrainer,
  adminDeleteTrainer,
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
} from "./routes/resources.js";
import { updateStudentAccess } from "./routes/access.js";
import {
  acceptPrivacy,
  changePlan,
  requestPlan,
  studentPortal,
  submitCheckin,
} from "./routes/student-portal.js";
import {
  cardPaymentConfig,
  createCardPayment,
  createCheckout,
  createPixPayment,
  mercadoPagoWebhook,
  reconcileStudentPayments,
  manualPixDecision,
  manualPixPaid,
  paymentOptions,
} from "./routes/payments.js";
import { demoSession } from "./routes/demo.js";
import { demoReadOnly, isDemoEmail } from "./lib/demo.js";
import { publicSite, publicSiteHero, saveSite, saveSiteHero, siteIcon, siteManifest, siteSettings } from "./routes/site.js";
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
      if (request.method === "GET" && route === "student/me") {
        await reconcileStudentPayments(
          db,
          session.sub,
          env,
        );
        const data = await studentPortal(db, session.sub, session.version);
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
      if (request.method === "POST" && route === "student/booking")
        return createStudentBooking(db, session.sub, await readJson(request), env);
      if (
        request.method === "POST" &&
        segments[1] === "booking" &&
        segments[2] &&
        segments[3] === "cancel"
      )
        return cancelStudentBooking(db, session.sub, segments[2], env);
      if (request.method === "POST" && route === "student/checkins")
        return submitCheckin(db, session.sub, await readJson(request));
      if (request.method === "POST" && route === "student/account/delete")
        return deleteStudentAccount(env, db, session.sub, await readJson(request));
      if (request.method === "POST" && route === "student/plan-change")
        return changePlan(db, session.sub, await readJson(request));
      if (request.method === "POST" && route === "student/plan-request")
        return requestPlan(db, session.sub, await readJson(request));
      // Personal com o plano cheio: aluno novo não paga até abrir vaga.
      if (
        request.method === "POST" &&
        ["student/payments/checkout", "student/payments/pix", "student/payments/card", "student/payments/manual-paid"].includes(route)
      ) {
        const noSeat = await seatProblem(db, { accountId: session.sub });
        if (noSeat) return { error: noSeat, status: 403 };
      }
      if (request.method === "POST" && route === "student/payments/checkout")
        return createCheckout(db, session.sub, env, await readJson(request));
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
    if (request.method === "GET" && route === "session")
      return { data: { support: session.support || null } };
    // Assinatura da plataforma (planos dos personais).
    if (request.method === "GET" && route === "billing")
      return billingInfo(env, db, session.sub);
    if (request.method === "GET" && route === "billing/card-config")
      return saasCardConfig(env, db, session.sub, new URL(request.url).searchParams.get("plan"));
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
      if (request.method === "POST" && route === "payout/mp/connect") return payoutConnectUrl(env, session.sub);
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
    // Assinatura vencida: o painel fica só para consulta (os alunos continuam
    // com acesso). Suporte, perfil e pagamento seguem liberados.
    if (
      saas?.status === "expired" &&
      !session.support &&
      request.method !== "GET" &&
      !["support", "profile", "billing"].includes(segments[0])
    )
      return {
        error: "Sua assinatura da plataforma venceu. Renove em Minha assinatura para voltar a editar.",
        status: 402,
      };
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
    if (request.method === "PUT" && id)
      return {
        data: await updateResource(
          db,
          resource,
          session.sub,
          id,
          await readJson(request),
        ),
      };
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
      return json(
        { error: "Não foi possível concluir a solicitação." },
        500,
        cors,
      );
    }
  },
};
