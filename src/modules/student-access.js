import { demoInviteOn } from "./demo-invite.js";
import { ACCENTS, currentSiteSlug } from "./site-brand.js";
import { downloadAssessmentPdf } from "./assessment-pdf.js";
import { downloadWorkoutPdf } from "./workout-pdf.js";
import { openSecureCardForm } from "./mercado-pago-card.js";
import { createQrCodeImage } from "./pix.js";
import { hideStudentExtras, renderStudentExtras } from "./student-extras.js";
import { renderStudentAgenda } from "./student-agenda.js";
import { cancelPlanChange, openPlanChange } from "./student-plan.js";
import { createStudentWhatsappUrl } from "./whatsapp.js";
import {
  assessmentCard,
  loadTrend,
  progressCard,
  referralsCard,
  restTimer,
  trainingCalendarCard,
  waterCard,
} from "./student-tools.js";

// Calendário, água e evolução da carga (vêm junto com os dados do aluno).
let studentTools = null;

// Recarrega a área do aluno (definido quando a área inicia).
let reloadStudentPanel = async () => {};

const TOKEN_KEY = "farisa-student-token";
const API_URL = import.meta.env.VITE_API_URL || "";
async function studentRequest(path, data) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  let response;
  try {
    response = await fetch(`${API_URL}/api/student/${path}`, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao serviço de contas. Tente novamente mais tarde.",
    );
  }
  demoInviteOn(response);
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "O serviço de contas está indisponível. Tente novamente mais tarde.",
    );
  }
  if (!response.ok)
    throw new Error(result?.error || "Não foi possível acessar sua conta.");
  return result;
}
async function loadStudentExerciseVideo(id) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const response = await fetch(
    `${API_URL}/api/student/exercise-videos/${id}/file`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || "Não foi possível carregar o vídeo.");
  }
  return URL.createObjectURL(await response.blob());
}
// Fotos de evolução das avaliações do aluno (guardadas enquanto a página
// está aberta, para a atualização automática não baixar de novo).
const studentPhotoUrls = new Map();
function loadStudentPhoto(assessmentId, pose, version) {
  const key = `${assessmentId}:${pose}:${version}`;
  if (!studentPhotoUrls.has(key)) {
    const pending = fetch(`${API_URL}/api/student/assessment-photos/${assessmentId}/${pose}?v=${version}`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}` },
    }).then(async (response) => (response.ok ? URL.createObjectURL(await response.blob()) : null));
    studentPhotoUrls.set(key, pending);
    pending.then((url) => !url && studentPhotoUrls.delete(key)).catch(() => studentPhotoUrls.delete(key));
  }
  return studentPhotoUrls.get(key);
}
// GIF do exercício na conta do aluno: o animado para a tela e o quadro
// parado para o PDF da ficha.
// Os GIFs animados ficam guardados enquanto a página está aberta: assim a
// atualização automática da área do aluno não baixa tudo de novo (era isso
// que fazia os GIFs "piscarem" e sumirem por um instante).
const studentGifUrls = new Map();
async function loadStudentGif(id, kind = "file") {
  if (kind === "file") {
    if (!studentGifUrls.has(id)) {
      const pending = fetchStudentGif(id, kind);
      studentGifUrls.set(id, pending);
      pending.then((url) => !url && studentGifUrls.delete(id)).catch(() => studentGifUrls.delete(id));
    }
    return studentGifUrls.get(id);
  }
  return fetchStudentGif(id, kind);
}
async function fetchStudentGif(id, kind) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const response = await fetch(
    `${API_URL}/api/student/exercise-gifs/${id}/${kind}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!response.ok) return null;
  return kind === "frame"
    ? new Uint8Array(await response.arrayBuffer())
    : URL.createObjectURL(await response.blob());
}
const loadStudentGifFrame = (id) => loadStudentGif(id, "frame");

// GIF em tela cheia na área do aluno: toca no GIF, ele ocupa a tela toda, e
// o "✕" (ou o botão Voltar do celular) fecha e volta para o treino. É uma
// camada por cima da página, e não o modo tela cheia do navegador, porque o
// Safari do iPhone não deixa imagem entrar nesse modo nem sair dele direito.
function openStudentGifViewer(src, title) {
  if (!src) return;
  const image = document.createElement("img");
  image.src = src;
  image.alt = title || "";
  openStudentViewer(image, title);
}

// Vídeo MP4 do exercício na mesma tela cheia do GIF, com o mesmo "✕".
function openStudentViewer(media, title, onClose) {
  if (document.querySelector(".student-gif-viewer")) return;
  const viewer = document.createElement("div");
  viewer.className = "student-gif-viewer";
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", title || "GIF do exercício");
  const bar = document.createElement("div");
  bar.className = "student-gif-viewer-bar";
  const name = document.createElement("span");
  name.textContent = title || "";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "student-gif-viewer-close";
  close.setAttribute("aria-label", "Fechar e voltar ao treino");
  close.textContent = "✕";
  bar.append(name, close);
  viewer.append(bar, media);

  const previousOverflow = document.body.style.overflow;
  let closed = false;
  const onKey = (event) => {
    if (event.key === "Escape") requestClose();
  };
  const finish = () => {
    if (closed) return;
    closed = true;
    onClose?.();
    viewer.remove();
    document.body.style.overflow = previousOverflow;
    window.removeEventListener("popstate", finish);
    document.removeEventListener("keydown", onKey);
  };
  // Uma entrada no histórico só para o GIF: o botão Voltar do celular fecha
  // o GIF em vez de sair da área do aluno.
  history.pushState({ studentGifViewer: true }, "");
  window.addEventListener("popstate", finish);
  function requestClose() {
    if (history.state?.studentGifViewer) history.back();
    else finish();
  }
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    requestClose();
  });
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) requestClose();
  });
  document.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";
  document.body.append(viewer);
  close.focus();
}
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function article(title) {
  const card = element("article");
  card.append(element("h2", "", title));
  return card;
}
function addLine(parent, text, strong = false) {
  parent.append(element(strong ? "strong" : "p", "", text));
}
// Reduz o "baixar com um clique": tira o ícone de download dos controles
// nativos do navegador e bloqueia o menu de clique-direito sobre o vídeo.
// Não é uma proteção definitiva (sempre dá para gravar a tela ou usar as
// ferramentas de desenvolvedor), mas evita o caminho fácil.
function hardenVideo(video) {
  video.setAttribute("controlsList", "nodownload noremoteplayback");
  video.disablePictureInPicture = true;
  video.addEventListener("contextmenu", (event) => event.preventDefault());
  return video;
}
const billingCycleLabels = {
  monthly: "Plano mensal · 30 dias",
  quarterly: "Plano trimestral · 90 dias",
  semiannual: "Plano semestral · 180 dias",
  annual: "Plano anual · 365 dias",
  permanent: "Acesso permanente",
};
function billingCycleLabel(access) {
  return billingCycleLabels[access.billingCycle] || "";
}
// Botões "Gerar QR Code PIX" e "Pagar com cartão" (cadastro novo ou
// mudança de plano). O valor vem do servidor conforme o plano escolhido.
// PIX direto na chave do personal: mostra o QR Code com o valor, e o aluno
// avisa quando pagar. O personal confere e libera o acesso.
async function manualPixCheckout(checkout, box, status) {
  const value = Number(checkout.amount).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const image = element("img", "pix-qr-code");
  image.src = await createQrCodeImage(checkout.qrCode);
  image.alt = "QR Code PIX";
  const copy = element("button", "button button--secondary", "Copiar código PIX");
  const paid = element("button", "button button--primary", "Já paguei");
  copy.type = paid.type = "button";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(checkout.qrCode);
      copy.textContent = "Código PIX copiado";
    } catch {
      copy.textContent = "Não foi possível copiar";
    }
  });
  paid.addEventListener("click", async () => {
    paid.disabled = true;
    try {
      await studentRequest("payments/manual-paid", { intentId: checkout.intentId });
      box.replaceChildren(
        element("strong", "", "Aviso enviado ao seu personal"),
        element(
          "p",
          "",
          "Assim que ele conferir o pagamento, seu acesso é liberado. Você não precisa pagar de novo.",
        ),
      );
      status.textContent = "Aguardando a confirmação do personal.";
    } catch (error) {
      status.textContent = error.message;
      paid.disabled = false;
    }
  });
  box.replaceChildren(
    element("strong", "", `PIX — ${value}`),
    element(
      "p",
      "",
      `Pague para ${checkout.holder} pelo QR Code ou pelo código. Depois toque em “Já paguei”: seu personal confere e libera o acesso.`,
    ),
    image,
    copy,
    paid,
  );
  status.textContent = "Depois de pagar, toque em “Já paguei”.";
}

function paymentControls(onRefresh) {
  const actions = element("div", "student-payment-actions");
  const pix = element(
    "button",
    "button button--primary",
    "Gerar QR Code PIX",
  );
  const card = element(
    "button",
    "button button--primary",
    "Pagar com cartão",
  );
  const paymentStatus = element("p", "student-payment-status");
  const pixCheckout = element("div", "student-pix-checkout");
  pix.type = card.type = "button";
  // O que o personal deste aluno aceita: Mercado Pago (Pix e cartão) ou só a
  // chave Pix dele, com confirmação manual.
  studentRequest("payments/options")
    .then((options) => {
      if (!options) return;
      card.hidden = !options.card;
      pix.hidden = !options.pix;
      if (options.manual) pix.textContent = "Pagar com PIX";
      if (!options.pix && !options.card)
        paymentStatus.textContent =
          "O pagamento pelo site ainda não foi ativado pelo seu personal. Fale com ele para combinar o pagamento.";
    })
    .catch(() => {});
  pix.addEventListener("click", async () => {
    pix.disabled = true;
    paymentStatus.textContent = "Preparando o PIX…";
    try {
      const checkout = await studentRequest("payments/pix", {});
      if (checkout.manual) {
        await manualPixCheckout(checkout, pixCheckout, paymentStatus);
        return;
      }
      const image = element("img", "pix-qr-code");
      image.src = checkout.qrCodeBase64
        ? `data:image/png;base64,${checkout.qrCodeBase64}`
        : await createQrCodeImage(checkout.qrCode);
      image.alt = "QR Code PIX gerado pelo Mercado Pago";
      const value = Number(checkout.amount).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const title = element(
        "strong",
        "",
        `PIX Mercado Pago — ${value}`,
      );
      const instructions = element(
        "p",
        "",
        "Escaneie o QR Code ou copie o código PIX. O acesso será liberado automaticamente após a aprovação.",
      );
      const copy = element(
        "button",
        "button button--secondary",
        "Copiar código PIX",
      );
      copy.type = "button";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(checkout.qrCode);
          copy.textContent = "Código PIX copiado";
        } catch {
          copy.textContent = "Não foi possível copiar";
        }
      });
      pixCheckout.replaceChildren(title, instructions, image, copy);
      paymentStatus.textContent =
        "Aguardando o pagamento. A situação será consultada automaticamente.";
    } catch (error) {
      paymentStatus.textContent = error.message;
      pix.disabled = false;
    }
  });
  card.addEventListener("click", async () => {
    card.disabled = true;
    paymentStatus.textContent = "Abrindo o pagamento seguro…";
    try {
      await openSecureCardForm(studentRequest, {
        onApproved() {
          sessionStorage.setItem(
            "farisa-student-payment-message",
            "Pagamento confirmado. Seu cadastro foi concluído e o acesso está liberado.",
          );
          window.setTimeout(onRefresh, 1300);
        },
      });
      paymentStatus.textContent =
        "Conclua o pagamento no formulário protegido do Mercado Pago.";
    } catch (error) {
      paymentStatus.textContent = error.message;
    } finally {
      card.disabled = false;
    }
  });
  actions.append(pix, card);
  return [actions, paymentStatus, pixCheckout];
}
function renderLocked(container, data, onRefresh) {
  const plan = article("Plano e acesso");
  addLine(plan, data.access.planName, true);
  if (billingCycleLabel(data.access))
    addLine(plan, billingCycleLabel(data.access));
  const messages = {
    pending: "Pré-cadastro ativo. Aguardando a confirmação do pagamento.",
    paused: "Seu acesso está pausado. Fale com o personal.",
    cancelled: "Seu acesso foi cancelado. Fale com o personal.",
  };
  addLine(plan, messages[data.access.status] || "Aguardando liberação.");
  container.replaceChildren(plan);

  if (!["paid", "waived"].includes(data.access.paymentStatus)) {
    const payment = article("Concluir pagamento");
    addLine(
      payment,
      "Seu pré-cadastro está salvo. Escolha uma forma de pagamento abaixo.",
    );
    payment.append(...paymentControls(onRefresh));
    container.append(payment);
  }
  [
    "Ficha de treino",
    "Exercícios",
    "Avaliação física",
    "Progresso",
    "Check-in semanal",
  ].forEach((title) => {
    const card = article(title);
    addLine(card, "Será liberado conforme o seu plano.");
    container.append(card);
  });
}

// Só mostra vídeo para o aluno quando você escolheu o MP4 daquele exercício
// (no cadastro do exercício ou no montador de ficha). Antes havia um
// "palpite" pelo nome/grupo do vídeo, e um exercício como "Barra Fixa"
// ganhava sozinho o vídeo da biblioteca com o mesmo nome.
function matchingUploadedVideo(exercise, videos) {
  if (!exercise.videoId) return null;
  return (
    videos.find((video) => String(video.id) === String(exercise.videoId)) ||
    null
  );
}

// Cartão do exercício dentro da pasta do treino: miniatura do GIF (toque
// para ampliar), nome, séries / repetições / descanso e os atalhos
// "▶ Ver vídeo" (abre o MP4 em tela cheia) e "Ver instruções".
const DEFAULT_INSTRUCTIONS = "Siga a orientação do personal.";

// Carga do exercício: o aluno anota o peso que está usando e salva. O
// personal vê a mudança na ficha e também pode ajustar.
function loadEditor(exercise, onSaved) {
  const box = element("form", "student-load");
  box.noValidate = true;
  const label = element("label", "");
  const input = element("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.maxLength = 20;
  input.placeholder = "ex.: 20 kg";
  input.value = exercise.load || "";
  input.setAttribute("aria-label", `Carga de ${exercise.name}`);
  label.append(element("span", "", "Carga"), input);
  const save = element("button", "", "Salvar");
  save.type = "submit";
  save.hidden = true;
  const note = element("small", "");
  const describe = () => {
    if (!exercise.load) return "Anote o peso que você está usando.";
    const date = exercise.loadAt ? new Date(exercise.loadAt) : null;
    const when = date && !Number.isNaN(date.getTime()) ? ` em ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : "";
    return exercise.loadBy === "trainer" ? `Definida pelo personal${when}.` : `Atualizada por você${when}.`;
  };
  note.textContent = describe();
  input.addEventListener("input", () => {
    save.hidden = input.value.trim() === (exercise.load || "");
  });
  box.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    note.textContent = "Salvando…";
    try {
      const result = await studentRequest(`workouts/${exercise.workoutId}/load`, {
        exerciseId: exercise.id,
        load: input.value,
      });
      const previous = { load: exercise.load, loadBy: exercise.loadBy, loadAt: exercise.loadAt };
      Object.assign(exercise, { load: result.load || "", loadBy: result.loadBy, loadAt: result.loadAt });
      onSaved?.(result, previous);
      input.value = exercise.load;
      save.hidden = true;
      note.textContent = describe();
    } catch (error) {
      note.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });
  box.append(label, save, note);
  return box;
}
function exerciseCard(exercise, uploadedVideos) {
  const card = element("li", "student-exercise-card");
  const video = matchingUploadedVideo(exercise, uploadedVideos);

  const thumb = element("button", "student-exercise-thumb");
  thumb.type = "button";
  if (exercise.gifId) {
    const image = element("img");
    image.alt = "";
    image.loading = "lazy";
    thumb.title = "Toque para ampliar o GIF";
    thumb.setAttribute("aria-label", `Ampliar o GIF de ${exercise.name}`);
    thumb.append(image);
    thumb.addEventListener("click", () => {
      if (image.src) openStudentGifViewer(image.src, exercise.name);
    });
    void loadStudentGif(exercise.gifId)
      .then((url) => {
        if (url) image.src = url;
        else thumb.classList.add("is-empty");
      })
      .catch(() => thumb.classList.add("is-empty"));
  } else if (video) {
    thumb.classList.add("is-video");
    thumb.textContent = "▶";
    thumb.setAttribute("aria-label", `Assistir o vídeo de ${exercise.name}`);
    thumb.addEventListener("click", () => openStudentVideoViewer(video.id, exercise.name));
  } else {
    thumb.classList.add("is-empty");
    thumb.disabled = true;
    thumb.setAttribute("aria-label", "Demonstração em preparação");
  }

  const body = element("div", "student-exercise-body");
  body.append(element("strong", "student-exercise-name", exercise.name));
  const chips = element("div", "student-exercise-chips");
  const chip = (text) => chips.append(element("span", "", text));
  if (exercise.sets) chip(`${exercise.sets} ${Number(exercise.sets) === 1 ? "série" : "séries"}`);
  if (exercise.repetitions) chip(`${exercise.repetitions} reps`);
  if (Number(exercise.restSeconds)) chip(`descanso ${exercise.restSeconds}s`);
  body.append(chips);
  const timer = restTimer(exercise);
  if (timer) body.append(timer);
  let trend = null;
  if (exercise.loadEditable && exercise.workoutId) {
    trend = loadTrend(exercise, studentTools);
    body.append(loadEditor(exercise, trend.add));
  }

  const links = element("div", "student-exercise-links");
  if (video) {
    const watch = element("button", "", "▶ Ver vídeo");
    watch.type = "button";
    watch.addEventListener("click", () => openStudentVideoViewer(video.id, exercise.name));
    links.append(watch);
  } else if (!exercise.gifId && /^(https:\/\/|\/(?!\/))/u.test(String(exercise.mediaUrl || ""))) {
    const demo = element("a", "", "Ver demonstração");
    demo.href = exercise.mediaUrl;
    demo.target = "_blank";
    demo.rel = "noreferrer";
    links.append(demo);
  }
  const texts = [
    exercise.instructions && exercise.instructions !== DEFAULT_INSTRUCTIONS
      ? exercise.instructions
      : "",
    exercise.notes ? `Observação do personal: ${exercise.notes}` : "",
  ].filter(Boolean);
  let details = null;
  if (texts.length) {
    const toggle = element("button", "", "Ver instruções");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    details = element("div", "student-exercise-instructions");
    details.hidden = true;
    texts.forEach((text) => details.append(element("p", "", text)));
    toggle.addEventListener("click", () => {
      details.hidden = !details.hidden;
      toggle.textContent = details.hidden ? "Ver instruções" : "Ocultar instruções";
      toggle.setAttribute("aria-expanded", String(!details.hidden));
    });
    links.append(toggle);
  }
  if (links.childElementCount) body.append(links);
  card.append(thumb, body);
  if (trend) card.append(trend.node);
  if (details) card.append(details);
  return card;
}

function openStudentVideoViewer(videoId, title) {
  if (!videoId) return;
  const video = hardenVideo(element("video"));
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  let closed = false;
  openStudentViewer(video, title, () => {
    closed = true;
    video.pause();
    if (video.src.startsWith("blob:")) URL.revokeObjectURL(video.src);
  });
  loadStudentExerciseVideo(videoId)
    .then((url) => {
      if (closed) return URL.revokeObjectURL(url);
      video.src = url;
      video.play().catch(() => {});
    })
    .catch(() => {
      const bar = document.querySelector(".student-gif-viewer-bar span");
      if (bar) bar.textContent = "Não foi possível carregar o vídeo.";
    });
}


function appendExerciseGroups(parent, exercises, uploadedVideos = []) {
  const sessions = new Map();
  exercises.forEach((exercise) => {
    const session = exercise.sessionLabel || "A";
    if (!sessions.has(session)) sessions.set(session, []);
    sessions.get(session).push(exercise);
  });
  [...sessions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([session, items]) => {
      const section = element("details", "student-muscle-group");
      // "Glúteos, Quadríceps" vira dois nomes; repetidos aparecem uma vez só.
      const groups = [
        ...new Set(
          items
            .flatMap((exercise) => String(exercise.group || "").split(","))
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ];
      const summary = element("summary", "");
      summary.append(
        element(
          "span",
          "student-folder-title",
          `Treino ${session} — ${groups.join(" / ") || "Exercícios"}`,
        ),
        element(
          "small",
          "student-folder-count",
          `${items.length} ${items.length === 1 ? "exercício" : "exercícios"}`,
        ),
      );
      section.append(summary);
      const list = element("ul", "student-exercise-grid");
      items.forEach((exercise) =>
        list.append(exerciseCard(exercise, uploadedVideos)),
      );
      section.append(list);
      parent.append(section);
    });
}

function renderReadyWorkoutLibrary(container, data) {
  if (data.access.planCode !== "ready") return;
  const card = article("Meus Treinos Prontos");
  card.classList.add("student-card--wide");
  const workouts = data.readyWorkouts || [];
  if (!workouts.length) {
    addLine(
      card,
      "Os programas completos aparecerão aqui assim que forem publicados pelo personal.",
    );
  }
  workouts.forEach((workout) => {
    const block = element("section", "student-workout");
    addLine(block, workout.name, true);
    addLine(block, `${workout.goal} · ${workout.level} · ${workout.duration}`);
    if (workout.description) addLine(block, workout.description);
    const open = element(
      "button",
      "button button--secondary",
      "Baixar PDF completo",
    );
    open.type = "button";
    open.addEventListener("click", () =>
      // O nome do aluno cadastrado, não o rótulo do programa.
      void downloadWorkoutPdf(
        { ...workout, readyProgram: true },
        { name: data.name, email: data.email },
        loadStudentGifFrame,
      ),
    );
    block.append(open);
    appendExerciseGroups(
      block,
      workout.exercises || [],
      data.exerciseVideos || [],
    );
    card.append(block);
  });
  container.append(card);
}

function renderPortal(container, data) {
  studentTools = data.tools?.ready ? data.tools : null;
  // Faixa "Meu plano" em uma linha, ocupando a largura toda.
  const plan = element("article", "student-plan-strip student-card--wide");
  plan.append(
    element("span", "student-plan-label", "Meu plano"),
    element("strong", "student-plan-name", data.access.planName),
  );
  if (billingCycleLabel(data.access))
    plan.append(element("span", "", billingCycleLabel(data.access)));
  plan.append(
    element(
      "span",
      "",
      data.access.accessType === "permanent"
        ? "Acesso permanente"
        : `Acesso até ${new Intl.DateTimeFormat("pt-BR").format(new Date(data.access.expiresAt))}`,
    ),
  );
  // Mudar de plano (upgrade/downgrade ou outro período).
  const planOptions = {
    request: studentRequest,
    reload: () => reloadStudentPanel(),
    paymentControls: (done) => paymentControls(done),
  };
  const change = element("button", "button button--secondary student-plan-change", "Mudar plano");
  change.type = "button";
  change.addEventListener("click", () => openPlanChange(data, planOptions));
  plan.append(change);
  if (data.pendingChange) {
    const pending = element("div", "student-plan-pending");
    pending.append(
      element(
        "span",
        "",
        `⏳ Mudança para ${data.pendingChange.planName} aguardando pagamento. Você segue no plano atual até lá.`,
      ),
    );
    const pay = element("button", "button button--primary", "Pagar agora");
    pay.type = "button";
    pay.addEventListener("click", () => openPlanChange(data, { ...planOptions, resume: true }));
    const quit = element("button", "button button--secondary", "Desistir");
    quit.type = "button";
    quit.addEventListener("click", () => void cancelPlanChange(planOptions));
    pending.append(pay, quit);
    plan.append(pending);
  }
  container.replaceChildren(plan);
  // "Minha agenda": atendimentos online/presenciais e agendamento pelo app.
  if (!data.trainerLocked) {
    const agenda = element("article");
    container.append(agenda);
    void renderStudentAgenda(agenda, {
      request: studentRequest,
      reload: () => reloadStudentPanel(),
    });
  }
  renderReadyWorkoutLibrary(container, data);
  if (data.access.planCode !== "ready") {
    const workouts = article("Minha ficha personalizada");
    workouts.classList.add("student-card--wide");
    if (!data.workouts.length)
      addLine(workouts, "O personal ainda não publicou uma ficha para você.");
    data.workouts.forEach((workout) => {
      const workoutBlock = element("section", "student-workout");
      addLine(
        workoutBlock,
        `${workout.name} · ${workout.goal} · ${workout.duration}`,
        true,
      );
      const download = element(
        "button",
        "button button--secondary",
        "Baixar PDF personalizado",
      );
      download.type = "button";
      download.addEventListener("click", () =>
        void downloadWorkoutPdf(
          workout,
          { name: data.name, email: data.email },
          loadStudentGifFrame,
        ),
      );
      workoutBlock.append(download);
      if (!workout.exercises.length)
        addLine(workoutBlock, "O personal ainda não adicionou exercícios.");
      if (!workout.exercises.length) {
        const library = element(
          "div",
          "exercise-3d-pending",
          "Biblioteca de animações 3D em preparação. Os exercícios aparecerão aqui quando forem cadastrados.",
        );
        workoutBlock.append(library);
      }
      appendExerciseGroups(
        workoutBlock,
        workout.exercises,
        data.exerciseVideos || [],
      );
      workouts.append(workoutBlock);
    });
    container.append(workouts);
  }
  if (studentTools) {
    container.append(
      trainingCalendarCard(studentTools, studentRequest),
      waterCard(studentTools, studentRequest),
    );
  }
  const referrals = referralsCard(data.referrals, data.name);
  if (referrals) container.append(referrals);
  if (data.access.features.includes("assessments"))
    container.append(
      assessmentCard(data.assessments, data.trainerLocked ? null : downloadReport, loadStudentPhoto),
    );
  if (data.access.features.includes("progress"))
    container.append(progressCard(data.assessments));
  function downloadReport() {
    // Marca e cor da página do personal em que o aluno está.
    const mark = document.querySelector(".student-access-shell .brand-mark, [data-public-screen] .brand-mark")?.textContent?.trim();
    const brandName = document.querySelector("[data-public-screen] .brand-name")?.textContent?.trim();
    downloadAssessmentPdf(
      data.assessments,
      { name: data.name },
      {
        brand: mark ? `${mark} ${brandName || "Personal"}` : "",
        accent: ACCENTS[document.documentElement.dataset.accent] || ACCENTS.blue,
      },
    );
  }
  if (data.access.features.includes("checkins") && !data.trainerLocked) {
    const checkin = article("Check-in semanal");
    checkin.id = "student-checkin";
    const form = element("form");
    form.dataset.checkinForm = "";
    form.innerHTML = `<label class="field"><span>Energia (1 a 5)</span><input name="energy" type="number" min="1" max="5" required></label><label class="field"><span>Qualidade do sono (1 a 5)</span><input name="sleep" type="number" min="1" max="5" required></label><label class="field"><span>Dor ou desconforto</span><input name="pain" maxlength="200"></label><label class="field"><span>Como foi sua semana?</span><textarea name="notes" rows="3" maxlength="1000"></textarea></label><button class="button button--primary" type="submit">Enviar check-in</button><p role="status"></p>`;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = form.querySelector('[role="status"]');
      try {
        await studentRequest(
          "checkins",
          Object.fromEntries(new FormData(form)),
        );
        form.reset();
        status.textContent = "Check-in enviado ao personal.";
      } catch (error) {
        status.textContent = error.message;
      }
    });
    checkin.append(form);
    // Check-ins: o mais recente fica à vista (com a resposta do personal ou o
    // aviso de que ainda não foi respondido); os anteriores ficam guardados
    // numa lista que abre ao clicar.
    const dateOf = (item) =>
      new Intl.DateTimeFormat("pt-BR").format(new Date(item.createdAt));
    const checkinCard = (item, highlight = false) => {
      const card = element(
        "div",
        `student-checkin-reply${highlight ? " student-checkin-reply--latest" : ""}${item.trainerFeedback ? "" : " is-waiting"}`,
      );
      card.append(
        element(
          "strong",
          "",
          `${highlight && item.trainerFeedback ? "Última resposta do personal" : "Check-in"} · ${dateOf(item)}`,
        ),
      );
      const summary = [`Energia ${item.energy}/5`, `Sono ${item.sleep}/5`];
      if (item.pain) summary.push(`Dor: ${item.pain}`);
      card.append(element("small", "student-checkin-summary", summary.join(" · ")));
      if (item.notes) card.append(element("p", "student-checkin-notes", item.notes));
      if (item.trainerFeedback) {
        card.append(
          element("span", "student-checkin-label", "💬 Resposta do personal"),
          element("p", "", item.trainerFeedback),
        );
      } else {
        card.append(
          element("span", "student-checkin-label", "⏳ Aguardando resposta do personal"),
        );
      }
      return card;
    };
    // À vista: a resposta mais recente do personal. Se o check-in mais novo
    // ainda não foi respondido, ele também aparece, com o aviso de espera.
    const newest = data.checkins[0];
    const latestAnswered = data.checkins.find((item) => item.trainerFeedback);
    const visible = [];
    if (newest && !newest.trainerFeedback) visible.push(newest);
    if (latestAnswered) visible.push(latestAnswered);
    visible.forEach((item) =>
      checkin.append(checkinCard(item, item === latestAnswered || !latestAnswered)),
    );
    const older = data.checkins.filter((item) => !visible.includes(item));
    if (older.length) {
      const history = element("details", "student-checkin-history");
      history.append(
        element(
          "summary",
          "",
          `Check-ins anteriores (${older.length})`,
        ),
      );
      const list = element("div", "student-checkin-history-list");
      older.forEach((item) => list.append(checkinCard(item)));
      history.append(list);
      checkin.append(history);
    }
    container.append(checkin);
  }
  const unavailable = [
    [
      "assessments",
      "Avaliação física",
      "Disponível a partir da Consultoria Básica.",
    ],
    ["progress", "Progresso", "Disponível a partir da Consultoria Básica."],
    ["checkins", "Check-in semanal", "Disponível nos planos Premium e Atleta."],
  ];
  unavailable
    .filter(([feature]) => !data.access.features.includes(feature))
    .filter(([feature]) => !(feature === "checkins" && data.trainerLocked))
    .forEach(([, title, message]) => {
      const locked = article(`🔒 ${title}`);
      locked.classList.add("student-feature-locked");
      addLine(locked, message);
      addLine(
        locked,
        "O recurso permanece visível para você conhecer as opções de evolução do plano.",
      );
      container.append(locked);
    });
}
function applyPlanFromHash() {
  const select = document.querySelector(
    '[data-student-form="register"] [name="planCode"]',
  );
  if (!select) return;
  const plan = new URLSearchParams(location.hash.split("?")[1] || "").get(
    "plan",
  );
  if ([...select.options].some((o) => o.value === plan)) {
    select.value = plan;
    select.dispatchEvent(new Event("change"));
  }
}
export function initStudentAccess() {
  let generation = 0;
  let hasLoadedOnce = false;
  let hasRendered = false;
  let lastSignature = "";
  // Pastas abertas/fechadas, pelo título ("Treino A — Peitoral").
  const folderState = (container) =>
    new Map(
      [...container.querySelectorAll("details")].map((details) => [
        details.querySelector("summary")?.textContent,
        details.open,
      ]),
    );
  // Você está digitando ou já preencheu algo num formulário da área?
  const isEditing = (container) => {
    const active = document.activeElement;
    if (
      active &&
      container.contains(active) &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
    )
      return true;
    // Cronômetro de descanso contando: não redesenha por cima dele.
    if (container.querySelector(".student-rest.is-running")) return true;
    return [...container.querySelectorAll("form")].some((form) =>
      [...form.elements].some(
        (field) =>
          ["text", "number", "textarea", "email", "tel", "date"].includes(
            field.type,
          ) && field.value !== field.defaultValue,
      ),
    );
  };
  // "Falar com o treinador": abre o WhatsApp do personal em vez de sair da
  // área do aluno para o site público.
  let studentDisplayName = "";
  document.querySelector("[data-student-contact]")?.addEventListener("click", (event) => {
    event.preventDefault();
    const status = document.querySelector("[data-student-panel-status]");
    const url = createStudentWhatsappUrl(studentDisplayName);
    if (url) window.open(url, "_blank", "noopener");
    else if (status) {
      status.textContent = "Seu personal ainda não cadastrou um WhatsApp de contato.";
      status.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
  reloadStudentPanel = () => loadPanel();
  async function loadPanel() {
    applyPlanFromHash();
    const current = ++generation;
    if (location.hash.split("?")[0] !== "#painel-aluno") return;
    const status = document.querySelector("[data-student-panel-status]"),
      container = document.querySelector(".student-access-features");
    document.querySelector("[data-student-name]").textContent = "Área do Aluno";
    if (!hasLoadedOnce) status.textContent = "Carregando seu acompanhamento…";
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      location.hash = "#entrar-aluno";
      return;
    }
    try {
      const data = await studentRequest("me");
      if (current !== generation) return;
      // Aluno que entrou pela página principal ou pela de outro personal:
      // vai para a página do personal dele (marca, cor e contato certos).
      if (data.siteSlug && data.siteSlug !== currentSiteSlug()) {
        location.replace(`/p/${data.siteSlug}#painel-aluno`);
        return;
      }
      hasLoadedOnce = true;
      studentDisplayName = data.name || "";
      document.querySelector("[data-student-name]").textContent =
        `Olá, ${data.name}`;
      const paymentMessage = sessionStorage.getItem(
        "farisa-student-payment-message",
      );
      if (paymentMessage) {
        sessionStorage.removeItem("farisa-student-payment-message");
        status.textContent = paymentMessage;
      } else {
        status.textContent = data.access.active
          ? "Seu acompanhamento está ativo e sincronizado com o personal."
          : data.access.paymentStatus === "pending"
            ? "Seu pré-cadastro está ativo. Conclua o pagamento para liberar o acesso."
            : "Seu acompanhamento está aguardando liberação.";
      }
      // A área do aluno se atualiza sozinha (a cada 30 s e ao voltar para a
      // aba). Antes ela era redesenhada inteira toda vez: a pasta "Treino A"
      // reabria, a página pulava para o topo e o check-in que você estava
      // digitando era apagado. Agora só redesenha se algo mudou de verdade e
      // se você não está no meio de um formulário, mantendo pastas abertas
      // e a posição da página.
      // Calendário e água guardam o próprio estado na tela: mudanças neles
      // não precisam redesenhar a área inteira.
      const signature = JSON.stringify({ ...data, tools: null });
      const changed = signature !== lastSignature;
      if (changed && (!hasRendered || !isEditing(container))) {
        const openFolders = hasRendered ? folderState(container) : null;
        const scrollY = window.scrollY;
        if (data.access.active) renderPortal(container, data);
        else renderLocked(container, data, loadPanel);
        if (openFolders) {
          container.querySelectorAll("details").forEach((details) => {
            const key = details.querySelector("summary")?.textContent;
            if (openFolders.has(key)) details.open = openFolders.get(key);
          });
          window.scrollTo(0, scrollY);
        }
        lastSignature = signature;
        hasRendered = true;
      }
      // Foto/perfil e sininho de notificações no topo da área do aluno.
      renderStudentExtras(data, { request: studentRequest, reload: loadPanel });
    } catch (error) {
      if (current === generation) status.textContent = error.message;
    }
  }
  document.querySelectorAll("[data-student-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = form.querySelector('[role="status"]'),
        button = form.querySelector('[type="submit"]'),
        label = button.textContent.trim();
      if (!form.reportValidity()) return;
      button.disabled = true;
      status.textContent = "Aguarde…";
      try {
        const data = Object.fromEntries(new FormData(form)),
          action = form.dataset.studentForm;
        // Cadastro feito na página de um personal (/p/<slug>) cai para ele.
        if (action === "register") data.site = currentSiteSlug();
        if (action === "reset")
          data.token = new URLSearchParams(
            location.hash.split("?")[1] || "",
          ).get("token");
        const result = await studentRequest(`auth/${action}`, data);
        if (["forgot", "reset"].includes(action)) {
          form.reset();
          status.textContent = result.message;
          if (action === "reset") {
            sessionStorage.removeItem(TOKEN_KEY);
            history.replaceState(null, "", "#nova-senha");
          }
          return;
        }
        if (!result?.token)
          throw new Error("O servidor não retornou uma sessão válida.");
        sessionStorage.setItem(TOKEN_KEY, result.token);
        // Entrou com conta de verdade: deixa de ser sessão de demonstração.
        sessionStorage.removeItem("farisa-demo");
        if (action === "register") {
          form.reset();
          sessionStorage.setItem(
            "farisa-student-payment-message",
            "Pré-cadastro criado. Escolha PIX ou cartão para concluir a contratação.",
          );
          location.hash = "#painel-aluno";
          loadPanel();
          return;
        }
        form.reset();
        status.textContent = "";
        location.hash = "#painel-aluno";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });
  });
  document
    .querySelector("[data-student-logout]")
    .addEventListener("click", () => {
      generation++;
      // Encerra a sessão também no servidor (o token deixa de valer).
      void studentRequest("auth/logout", {}).catch(() => {});
      sessionStorage.removeItem(TOKEN_KEY);
      hideStudentExtras();
      hasRendered = false;
      lastSignature = "";
      document.querySelector("[data-student-name]").textContent =
        "Área do Aluno";
      location.hash = "#entrar-aluno";
    });
  let lastAutoLoadAt = 0;
  function loadPanelThrottled() {
    const now = Date.now();
    if (now - lastAutoLoadAt < 5000) return;
    lastAutoLoadAt = now;
    loadPanel();
  }
  window.addEventListener("hashchange", loadPanel);
  window.addEventListener("focus", loadPanelThrottled);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadPanelThrottled();
  });
  window.setInterval(() => {
    if (!document.hidden && location.hash.split("?")[0] === "#painel-aluno")
      loadPanelThrottled();
  }, 30000);
  loadPanel();
}
