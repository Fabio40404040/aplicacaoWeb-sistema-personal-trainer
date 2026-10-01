import { withDb } from "./lib/db.js";
import { corsHeaders, json, readJson } from "./lib/http.js";
import { readSession } from "./lib/session.js";
import { adminLogin, adminTrainers, currentAdmin } from "./routes/admin.js";
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
import { paymentWebhook, updateStudentAccess } from "./routes/access.js";
import {
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
} from "./routes/payments.js";
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

async function handle(request, env) {
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
  if (request.method === "POST" && route === "payments/mercadopago/webhook")
    return withDb(env, (db) => mercadoPagoWebhook(request, env, db));
  if (request.method === "POST" && route === "payments/webhook")
    return withDb(env, (db) => paymentWebhook(request, env, db));
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
      return { error: "Rota não encontrada.", status: 404 };
    });
  }
  if (segments[0] === "student") {
    if (session.role !== "student")
      return { error: "Use sua conta de aluno.", status: 403 };
    return withDb(env, async (db) => {
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
      if (request.method === "POST" && route === "student/plan-request")
        return requestPlan(db, session.sub, await readJson(request));
      if (request.method === "POST" && route === "student/payments/checkout")
        return createCheckout(db, session.sub, env, await readJson(request));
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
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    try {
      const result = await handle(request, env);
      if (result instanceof Response) {
        const headers = new Headers(result.headers);
        Object.entries(cors).forEach(([name, value]) =>
          headers.set(name, value),
        );
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
