import { clearStoredData, getData, replaceData } from "./state.js";

const API_URL = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "farisa-coach-api-token";

// Login vencido: a API responde 401 para tudo. Em vez de continuar pedindo
// centenas de GIFs (e encher o terminal de "401 Unauthorized"), apagamos o
// token uma vez só, paramos de pedir arquivos e avisamos a tela de login.
function handleUnauthorized(status) {
  if (status !== 401 || !sessionStorage.getItem(TOKEN_KEY)) return;
  sessionStorage.removeItem(TOKEN_KEY);
  clearStoredData();
  window.dispatchEvent(new CustomEvent("farisa:session-expired"));
}
const sessionExpiredError = () =>
  new Error("Sua sessão expirou. Entre de novo para continuar.");

async function request(path, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const { timeoutMs = 12000, ...fetchOptions } = options;
  const controller = new AbortController();
  const cancelRequest = () => controller.abort();
  const timeoutId = setTimeout(cancelRequest, timeoutMs);
  if (fetchOptions.signal?.aborted) cancelRequest();
  else
    fetchOptions.signal?.addEventListener("abort", cancelRequest, {
      once: true,
    });
  let response;
  try {
    const isFormData = fetchOptions.body instanceof FormData;
    response = await fetch(`${API_URL}/api${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchOptions.headers,
      },
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao serviço de contas. Tente novamente mais tarde.",
    );
  } finally {
    clearTimeout(timeoutId);
    fetchOptions.signal?.removeEventListener("abort", cancelRequest);
  }
  // O 401 do próprio login é senha errada, não sessão vencida.
  if (token && path !== "/auth/login") handleUnauthorized(response.status);
  if (response.status === 204) return null;
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "O serviço de contas está indisponível. Tente novamente mais tarde.",
    );
  }
  if (!response.ok)
    throw new Error(
      result?.error || "Não foi possível concluir a solicitação.",
    );
  return result;
}

export async function login(credentials, signal) {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
    signal,
  });
  if (signal?.aborted) throw new Error("Entrada cancelada.");
  if (!result?.token)
    throw new Error("O servidor não retornou uma sessão válida.");
  sessionStorage.setItem(TOKEN_KEY, result.token);
  return result;
}
export function clearApiSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  clearStoredData();
}
export function persistRecord(collection, record, editingId = null) {
  return request(`/${collection}${editingId ? `/${editingId}` : ""}`, {
    method: editingId ? "PUT" : "POST",
    body: JSON.stringify(record),
  });
}
export function removeRecord(collection, id) {
  return request(`/${collection}/${id}`, { method: "DELETE" });
}
export function updateStudentAccess(id, data) {
  return request(`/students/${id}/access`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
export function persistReadyProgram(record, id = null) {
  return request(`/ready-programs${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(record),
  });
}
export function setReadyProgramSitePreview(id, enabled) {
  return request(`/ready-programs/${id}/site-preview`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}
export async function loadPublicPreviewFrame(id) {
  const response = await fetch(`${API_URL}/api/public/ready-preview/frame/${id}`);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}
export function fetchReadyPreview() {
  return request("/public/ready-preview");
}
export function removeReadyProgram(id) {
  return request(`/ready-programs/${id}`, { method: "DELETE" });
}
export function uploadReadyWorkout(formData) {
  return request("/ready-workouts", { method: "POST", body: formData });
}
export function deleteReadyWorkout(id) {
  return request(`/ready-workouts/${id}`, { method: "DELETE" });
}
export function updateReadyWorkout(id, published) {
  return request(`/ready-workouts/${id}`, {
    method: "PUT",
    body: JSON.stringify({ published }),
  });
}
export async function downloadReadyWorkout(id, filename) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) throw sessionExpiredError();
  const response = await fetch(`${API_URL}/api/ready-workouts/${id}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  handleUnauthorized(response.status);
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || "Não foi possível baixar o PDF.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "treino-pronto.pdf";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export function uploadExerciseVideo(formData) {
  return request("/exercise-videos", {
    method: "POST",
    body: formData,
    timeoutMs: 180000,
  });
}
export function deleteExerciseVideo(id) {
  return request(`/exercise-videos/${id}`, { method: "DELETE" });
}
export async function loadExerciseVideo(id) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) throw sessionExpiredError();
  const response = await fetch(`${API_URL}/api/exercise-videos/${id}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  handleUnauthorized(response.status);
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || "Não foi possível carregar o vídeo.");
  }
  return URL.createObjectURL(await response.blob());
}
export function uploadExerciseGif(formData) {
  return request("/exercise-gifs", {
    method: "POST",
    body: formData,
    timeoutMs: 180000,
  });
}
export function deleteExerciseGif(id) {
  return request(`/exercise-gifs/${id}`, { method: "DELETE" });
}
// Os GIFs saem de uma rota autenticada, entao nao dao para usar direto no src
// da imagem: baixamos com o token e guardamos o endereco temporario em cache
// para nao baixar o mesmo arquivo varias vezes na mesma tela.
const exerciseGifUrls = new Map();
export function loadExerciseGif(id, kind = "file") {
  const cacheKey = `${id}:${kind}`;
  if (exerciseGifUrls.has(cacheKey)) return exerciseGifUrls.get(cacheKey);
  const pending = (async () => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    // Sem login não adianta pedir: a API só devolveria 401.
    if (!token) throw sessionExpiredError();
    const response = await fetch(`${API_URL}/api/exercise-gifs/${id}/${kind}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    handleUnauthorized(response.status);
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error || "Não foi possível carregar o GIF.");
    }
    return URL.createObjectURL(await response.blob());
  })();
  pending.catch(() => exerciseGifUrls.delete(cacheKey));
  exerciseGifUrls.set(cacheKey, pending);
  return pending;
}
// Quadro parado do GIF, em bytes, para embutir no PDF da ficha.
export async function loadExerciseGifFrame(id) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const response = await fetch(`${API_URL}/api/exercise-gifs/${id}/frame`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  handleUnauthorized(response.status);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}
export function createMuscleGroup(name) {
  return request("/muscle-groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
export function deleteMuscleGroup(id) {
  return request(`/muscle-groups/${id}`, { method: "DELETE" });
}
export function forgetExerciseGif(id) {
  ["file", "frame"].forEach((kind) => {
    const cacheKey = `${id}:${kind}`;
    const pending = exerciseGifUrls.get(cacheKey);
    if (!pending) return;
    exerciseGifUrls.delete(cacheKey);
    void pending.then(URL.revokeObjectURL).catch(() => {});
  });
}
export async function syncRemoteData() {
  if (!sessionStorage.getItem(TOKEN_KEY)) return;
  try {
    const remote = await request("/dashboard");
    replaceData({ ...getData(), ...remote });
  } catch {
    // Mantém o último estado disponível quando a API estiver temporariamente indisponível.
  }
}
export function initRemoteSync() {
  window.addEventListener("farisa:remote-refresh", syncRemoteData);
  return syncRemoteData();
}
// Perfil do personal (nome, foto, contato e limite de alunos do plano).
export function saveTrainerProfile(profile) {
  return request("/profile", { method: "PUT", body: JSON.stringify(profile) });
}
// Resposta do personal a um check-in do aluno.
export function saveCheckinFeedback(id, feedback) {
  return request(`/checkins/${id}/feedback`, {
    method: "PUT",
    body: JSON.stringify({ feedback }),
  });
}
// Agenda online/presencial: horários, tipos de atendimento e cota por plano.
export function fetchBookingConfig() {
  return request("/booking/config");
}
export function saveBookingConfig(config) {
  return request("/booking/config", { method: "PUT", body: JSON.stringify(config) });
}
