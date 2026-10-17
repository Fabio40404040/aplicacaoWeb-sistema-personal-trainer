// Ferramentas da área do aluno: cronômetro de descanso e cronômetro livre, evolução da carga,
// calendário de treinos concluídos (com recado ao personal), água e o
// resultado da avaliação física em formato visual.
import "../styles/student-tools.css";
import { FAT_BANDS, FAT_SCALE, bmiNote, fatClass } from "./body-composition.js";
import { PHOTO_TIPS, framePhoto, poseModel, posesFor } from "./photo-poses.js";
import { askConfirm } from "./utils.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};
const pad = (value) => String(value).padStart(2, "0");
const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
// Data sem hora ("2026-10-01") é lida no fuso do aluno; como UTC ela
// apareceria um dia antes no Brasil.
const asDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ]00:00:00)/u.exec(String(value || ""));
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
};
const shortDate = (value) => {
  const date = value instanceof Date ? value : asDate(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const numberBr = (value, digits = 1) =>
  Number(value).toLocaleString("pt-BR", { maximumFractionDigits: digits });

/* ------------------------------------------------------------------ */
/* Cronômetro de descanso                                              */
/* ------------------------------------------------------------------ */

let stopRunningTimer = null;

// Um único <audio> controla todo o alarme. Misturar <audio> e Web Audio fazia
// o iPhone guardar uma segunda tentativa suspensa enquanto a música tocava;
// ao parar a música, essa tentativa antiga disparava fora de hora.
let beepAudio = null;
let beepEndTimer = 0;
let beepEnded = null;
let beepRunId = 0;
let activeHtmlRunId = 0;
let lastAlarmKey = null;
// O pequeno silêncio inicial permite autorizar o <audio> no toque em Iniciar
// sem soltar um bipe naquele momento. No iPhone, reproduzir o elemento como
// "muted" não garante que ele poderá tocar com som quando o tempo acabar.
const ALARM_LEAD = 0.8;
const ALARM_TONES = [
  { offset: 0, frequency: 659, length: 0.18, level: 0.78 },
  { offset: 0.27, frequency: 831, length: 0.2, level: 0.82 },
  { offset: 0.58, frequency: 1047, length: 0.34, level: 0.88 },
];
const ALARM_SPAN = Math.max(...ALARM_TONES.map((tone) => tone.offset + tone.length));
const ALARM_DURATION = ALARM_LEAD + ALARM_SPAN;
function beepWav() {
  const rate = 12000;
  const samples = Math.round(rate * ALARM_DURATION);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index += 1) {
    const time = index / rate;
    let value = 0;
    ALARM_TONES.forEach((tone) => {
      const elapsed = time - (ALARM_LEAD + tone.offset);
      if (elapsed < 0 || elapsed >= tone.length) return;
      // Entrada e saída suaves evitam o estalo de um bipe quadrado. Um
      // harmônico leve deixa o aviso mais reconhecível nos alto-falantes do celular.
      const envelope = Math.min(1, elapsed / 0.018, (tone.length - elapsed) / 0.05);
      const wave =
        Math.sin(2 * Math.PI * tone.frequency * elapsed) +
        Math.sin(2 * Math.PI * tone.frequency * 2 * elapsed) * 0.16;
      value += wave * tone.level * envelope;
    });
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true);
  }
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:audio/wav;base64,${btoa(binary)}`;
}
function requestPlaybackSession() {
  // Safari 17+: "playback" pede uma sessão de mídia que não mistura com a
  // música de outro aplicativo. Em versões anteriores, o <audio> já usa a
  // categoria de reprodução padrão do iOS.
  try {
    if (navigator.audioSession && "type" in navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {
    /* versão sem Audio Session API */
  }
}
function ensureBeepAudio() {
  if (beepAudio) return beepAudio;
  beepAudio = new Audio(beepWav());
  beepAudio.preload = "auto";
  beepAudio.setAttribute("playsinline", "");
  beepAudio.volume = 1;
  beepAudio.addEventListener("playing", () => {
    // Uma Promise antiga pode acordar quando a música é encerrada. Se a
    // execução já mudou, corta o som antes que o primeiro bipe seja emitido.
    if (!activeHtmlRunId || activeHtmlRunId !== beepRunId) {
      beepAudio.pause();
      beepAudio.currentTime = 0;
    }
  });
  beepAudio.addEventListener("ended", () => {
    if (activeHtmlRunId && activeHtmlRunId === beepRunId) stopBeep();
  });
  return beepAudio;
}
export function unlockSound() {
  requestPlaybackSession();
  try {
    const audio = ensureBeepAudio();
    const unlockId = beepRunId;
    activeHtmlRunId = 0;
    audio.pause();
    audio.currentTime = 0;
    audio.muted = true;
    const playing = audio.play();
    const release = () => {
      // Se o alarme verdadeiro já começou, esta liberação perdeu a validade.
      if (unlockId !== beepRunId || activeHtmlRunId) return;
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    };
    playing?.then?.(release, release);
    window.setTimeout(release, 180);
  } catch {
    /* o aviso visual continua disponível */
  }
}
function playHtmlBeep(runId) {
  if (runId !== beepRunId) return false;
  try {
    const audio = ensureBeepAudio();
    requestPlaybackSession();
    activeHtmlRunId = runId;
    audio.pause();
    audio.muted = false;
    // O alarme real pula o trecho silencioso usado somente na autorização.
    audio.currentTime = ALARM_LEAD;
    const playing = audio.play();
    playing?.catch?.(() => {
      if (runId === beepRunId) activeHtmlRunId = 0;
    });
    playing?.then?.(() => {
      if (runId !== beepRunId || activeHtmlRunId !== runId) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    return true;
  } catch {
    activeHtmlRunId = 0;
    return false;
  }
}
function stopBeep() {
  beepRunId += 1;
  activeHtmlRunId = 0;
  window.clearTimeout(beepEndTimer);
  beepEndTimer = 0;
  try {
    beepAudio?.pause();
    if (beepAudio) beepAudio.currentTime = 0;
  } catch {
    /* o áudio já terminou */
  }
  try {
    navigator.vibrate?.(0);
  } catch {
    /* sem vibração */
  }
  const ended = beepEnded;
  beepEnded = null;
  ended?.();
}
function beep(alarmKey, onEnd) {
  // O mesmo encerramento pode ser observado por mais de uma atualização da
  // interface. A chave garante que ele produza somente um aviso sonoro.
  if (alarmKey && alarmKey === lastAlarmKey) {
    onEnd?.();
    return;
  }
  lastAlarmKey = alarmKey;
  stopBeep();
  beepEnded = onEnd || null;
  const runId = beepRunId;
  playHtmlBeep(runId);
  try {
    navigator.vibrate?.([180, 120, 180, 120, 300]);
  } catch {
    /* sem vibração (o iPhone não vibra pelo navegador) */
  }
  beepEndTimer = window.setTimeout(
    () => {
      if (runId === beepRunId) stopBeep();
    },
    ALARM_SPAN * 1000 + 250,
  );
}

export function restTimer(exercise) {
  const total = Math.round(Number(exercise.restSeconds)) || 0;
  if (total <= 0) return null;
  const button = el("button", "student-rest");
  button.type = "button";
  const fill = el("span", "student-rest-fill");
  const label = el("span", "student-rest-label");
  button.append(fill, label);
  const idle = () => {
    button.classList.remove("is-running", "is-done");
    fill.style.width = "0%";
    label.textContent = `⏱ Descanso · ${total}s`;
    button.setAttribute("aria-label", `Iniciar descanso de ${total} segundos em ${exercise.name}`);
  };
  let interval = null;
  let doneTimeout = null;
  let ringing = false;
  const stop = () => {
    if (ringing) stopBeep();
    window.clearInterval(interval);
    window.clearTimeout(doneTimeout);
    interval = null;
    if (stopRunningTimer === stop) stopRunningTimer = null;
    idle();
  };
  const start = () => {
    stopRunningTimer?.();
    // Nunca deixa o alarme anterior continuar sobre uma nova contagem.
    stopBeep();
    unlockSound();
    stopRunningTimer = stop;
    // Conta pelo relógio: continua certo mesmo se a aba ficar em segundo plano.
    const endsAt = Date.now() + total * 1000;
    const alarmKey = {};
    button.classList.add("is-running");
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      label.textContent = `${Math.floor(left / 60)}:${pad(left % 60)} · parar`;
      fill.style.width = `${100 - (left / total) * 100}%`;
      if (left > 0) return;
      window.clearInterval(interval);
      interval = null;
      button.classList.remove("is-running");
      button.classList.add("is-done");
      ringing = true;
      label.textContent = "🔊 Próxima série! · parar som";
      beep(alarmKey, () => {
        ringing = false;
        if (button.classList.contains("is-done")) label.textContent = "✓ Próxima série!";
      });
      doneTimeout = window.setTimeout(stop, 6000);
    };
    tick();
    interval = window.setInterval(tick, 250);
  };
  button.addEventListener("click", () => (interval || button.classList.contains("is-done") ? stop() : start()));
  idle();
  return button;
}

/* ------------------------------------------------------------------ */
/* Cronômetro livre (fora das pastas): o aluno escolhe o tempo          */
/* ------------------------------------------------------------------ */

const TIMER_KEY = "farisa-student-timer";
const TIMER_PRESETS = [30, 45, 60, 90, 120, 180];
// Estado fora do cartão: a área do aluno se redesenha e o tempo continua.
const freeTimer = {
  total: 60,
  endsAt: 0,
  left: 0,
  done: false,
  zeroed: false,
  ringing: false,
  paint: null,
  stop: null,
  interval: 0,
  alarmKey: null,
};
try {
  const saved = Number(localStorage.getItem(TIMER_KEY));
  if (saved >= 5 && saved <= 3600) freeTimer.total = saved;
} catch {
  /* sem armazenamento: 60 s */
}
const clock = (seconds) => `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
const presetLabel = (seconds) =>
  seconds < 60 ? `${seconds}s` : seconds % 60 ? `${Math.floor(seconds / 60)}:${pad(seconds % 60)}` : `${seconds / 60} min`;
const timerLeft = () =>
  freeTimer.endsAt ? Math.max(0, Math.ceil((freeTimer.endsAt - Date.now()) / 1000)) : freeTimer.left || freeTimer.total;
function timerTick() {
  if (freeTimer.endsAt && timerLeft() === 0) {
    const alarmKey = freeTimer.alarmKey;
    freeTimer.endsAt = 0;
    freeTimer.left = 0;
    freeTimer.done = true;
    freeTimer.ringing = true;
    window.clearInterval(freeTimer.interval);
    freeTimer.interval = 0;
    if (stopRunningTimer === freeTimer.stop) stopRunningTimer = null;
    beep(alarmKey, () => {
      freeTimer.ringing = false;
      freeTimer.paint?.();
    });
  }
  freeTimer.paint?.();
}

export function freeTimerCard() {
  const card = el("article", "student-tool student-timer");
  card.append(el("h2", "", "⏱ Cronômetro"));
  card.append(el("p", "student-timer-hint", "Escolha o tempo e toque em Iniciar. Ao terminar, toca um aviso sonoro."));

  const RADIUS = 88;
  const LENGTH = 2 * Math.PI * RADIUS;
  const dial = el("div", "student-timer-dial");
  const ring = svg("svg", { viewBox: "0 0 200 200", "aria-hidden": "true" });
  ring.append(
    svg("circle", { cx: 100, cy: 100, r: RADIUS, class: "student-timer-track" }),
    svg("circle", {
      cx: 100,
      cy: 100,
      r: RADIUS,
      class: "student-timer-progress",
      "stroke-dasharray": LENGTH.toFixed(1),
      transform: "rotate(-90 100 100)",
    }),
  );
  const progress = ring.lastChild;
  const digits = el("strong", "student-timer-digits");
  const state = el("small", "student-timer-state");
  const center = el("div", "student-timer-center");
  center.append(digits, state);
  dial.setAttribute("role", "timer");
  dial.append(ring, center);

  const adjust = el("div", "student-timer-adjust");
  const minus = el("button", "student-timer-step", "−15s");
  const plus = el("button", "student-timer-step", "+15s");
  minus.type = plus.type = "button";
  minus.setAttribute("aria-label", "Diminuir 15 segundos");
  plus.setAttribute("aria-label", "Aumentar 15 segundos");
  adjust.append(minus, dial, plus);

  const presets = el("div", "student-timer-presets");
  const presetButtons = TIMER_PRESETS.map((seconds) => {
    const button = el("button", "", presetLabel(seconds));
    button.type = "button";
    button.addEventListener("click", () => choose(seconds));
    presets.append(button);
    return button;
  });

  const actions = el("div", "student-timer-actions");
  const main = el("button", "button button--primary student-timer-main");
  const reset = el("button", "button button--secondary", "Zerar");
  const silence = el("button", "button button--secondary student-timer-silence", "Parar som");
  main.type = reset.type = silence.type = "button";
  silence.hidden = true;
  actions.append(main, reset, silence);
  card.append(adjust, presets, actions);

  const running = () => Boolean(freeTimer.endsAt);
  const stopFreeTimer = () => {
    if (running()) freeTimer.left = timerLeft();
    freeTimer.endsAt = 0;
    window.clearInterval(freeTimer.interval);
    freeTimer.interval = 0;
    if (freeTimer.ringing) stopBeep();
    freeTimer.ringing = false;
    freeTimer.alarmKey = null;
    if (stopRunningTimer === stopFreeTimer) stopRunningTimer = null;
    freeTimer.paint?.();
  };
  freeTimer.stop = stopFreeTimer;
  const choose = (seconds) => {
    freeTimer.total = Math.max(5, Math.min(3600, seconds));
    freeTimer.endsAt = 0;
    freeTimer.left = 0;
    freeTimer.done = false;
    freeTimer.zeroed = false;
    freeTimer.ringing = false;
    stopBeep();
    window.clearInterval(freeTimer.interval);
    freeTimer.interval = 0;
    if (stopRunningTimer === stopFreeTimer) stopRunningTimer = null;
    try {
      localStorage.setItem(TIMER_KEY, String(freeTimer.total));
    } catch {
      /* sem armazenamento */
    }
    paint();
  };
  const step = (delta) => {
    if (running()) {
      // Contando: soma/tira do tempo que falta.
      freeTimer.endsAt = Math.max(Date.now() + 1000, freeTimer.endsAt + delta * 1000);
      freeTimer.total = Math.max(freeTimer.total, timerLeft());
      paint();
    } else choose((freeTimer.left || freeTimer.total) + delta);
  };
  minus.addEventListener("click", () => step(-15));
  plus.addEventListener("click", () => step(15));
  main.addEventListener("click", () => {
    // Cancela o áudio mesmo se o Safari já tiver mudado o estado visual. Isso
    // impede bipes antigos no começo da próxima contagem.
    stopBeep();
    freeTimer.ringing = false;
    if (running()) {
      stopFreeTimer();
    } else {
      stopRunningTimer?.();
      stopBeep();
      unlockSound();
      stopRunningTimer = stopFreeTimer;
      if (freeTimer.done) freeTimer.left = 0;
      freeTimer.done = false;
      freeTimer.zeroed = false;
      freeTimer.endsAt = Date.now() + (freeTimer.left || freeTimer.total) * 1000;
      freeTimer.alarmKey = {};
      freeTimer.left = 0;
      window.clearInterval(freeTimer.interval);
      freeTimer.interval = window.setInterval(timerTick, 250);
    }
    paint();
  });
  // Zerar: para e mostra 0:00. "Iniciar" começa de novo do tempo escolhido.
  reset.addEventListener("click", () => {
    choose(freeTimer.total);
    freeTimer.zeroed = true;
    paint();
  });
  silence.addEventListener("click", stopBeep);

  function paint() {
    const zero = freeTimer.done || freeTimer.zeroed;
    const left = zero ? 0 : timerLeft();
    const paused = !running() && freeTimer.left > 0;
    digits.textContent = zero ? "0:00" : clock(left);
    state.textContent = freeTimer.done
      ? "✓ Tempo!"
      : freeTimer.zeroed
        ? `zerado · ${clock(freeTimer.total)}`
        : running()
          ? "contando"
          : paused
            ? "pausado"
            : `de ${clock(freeTimer.total)}`;
    // O anel mostra o tempo que falta (cheio no início, esvazia até o fim).
    const fraction = freeTimer.done ? 1 : freeTimer.zeroed ? 0 : left / freeTimer.total;
    progress.setAttribute("stroke-dashoffset", (LENGTH * (1 - fraction)).toFixed(1));
    card.classList.toggle("is-running", running());
    card.classList.toggle("is-done", freeTimer.done);
    reset.disabled = freeTimer.zeroed;
    silence.hidden = !freeTimer.ringing;
    main.textContent = running() ? "Pausar" : paused ? "Continuar" : freeTimer.done ? "De novo" : "Iniciar";
    dial.setAttribute("aria-label", `${digits.textContent} ${state.textContent}`);
    presetButtons.forEach((button, index) =>
      button.classList.toggle("is-active", TIMER_PRESETS[index] === freeTimer.total),
    );
  }
  freeTimer.paint = paint;
  if (running()) {
    stopRunningTimer = stopFreeTimer;
    if (!freeTimer.interval) freeTimer.interval = window.setInterval(timerTick, 250);
  }
  paint();
  return card;
}

/* ------------------------------------------------------------------ */
/* Evolução da carga                                                   */
/* ------------------------------------------------------------------ */

const loadNumber = (text) => {
  const match = String(text || "").replace(",", ".").match(/\d+(\.\d+)?/u);
  return match ? Number(match[0]) : null;
};

function sparkline(values) {
  const width = 120;
  const height = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => [
    4 + (index * (width - 8)) / (values.length - 1),
    height - 5 - ((value - min) / span) * (height - 10),
  ]);
  const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "student-trend-chart", "aria-hidden": "true" });
  chart.append(
    svg("polyline", {
      points: points.map((point) => point.map((n) => n.toFixed(1)).join(",")).join(" "),
      fill: "none",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
  const [x, y] = points.at(-1);
  chart.append(svg("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: "3" }));
  return chart;
}

// Devolve o bloco e uma função para acrescentar a carga recém-salva.
export function loadTrend(exercise, tools, request) {
  const node = el("div", "student-trend");
  const key = `${exercise.workoutId}:${exercise.id}`;
  const history = [...(tools?.loadHistory?.[key] || [])];
  let listOpen = false;
  const render = () => {
    node.replaceChildren();
    node.hidden = history.length < 2;
    if (node.hidden) return;
    const first = history[0];
    const last = history.at(-1);
    const numbers = history.map((item) => loadNumber(item.load));
    const numeric = numbers.every((value) => value !== null);
    const head = el("div", "student-trend-head");
    const text = el("div", "student-trend-text");
    text.append(el("strong", "", `${first.load} → ${last.load}`));
    if (numeric) {
      const diff = numbers.at(-1) - numbers[0];
      if (diff !== 0) {
        const badge = el("span", `student-trend-badge${diff > 0 ? " is-up" : ""}`);
        badge.textContent = `${diff > 0 ? "▲ +" : "▼ −"}${numberBr(Math.abs(diff))}`;
        text.append(badge);
      }
    }
    text.append(el("small", "", `desde ${shortDate(first.at)} · ${history.length} registros`));
    head.append(text);
    if (numeric && history.length >= 3) head.append(sparkline(numbers));
    node.append(head);
    const details = el("div", "student-trend-list");
    const actions = el("div", "student-trend-actions");
    const toggle = el("button", "student-link-button", "Ver histórico");
    toggle.type = "button";
    const list = el("ul");
    list.hidden = !listOpen;
    toggle.textContent = listOpen ? "Ocultar histórico" : "Ver histórico";
    toggle.addEventListener("click", () => {
      listOpen = !listOpen;
      list.hidden = !listOpen;
      toggle.textContent = listOpen ? "Ocultar histórico" : "Ver histórico";
    });
    const clear = el("button", "student-link-button student-trend-clear", "Limpar histórico");
    clear.type = "button";
    clear.addEventListener("click", async () => {
      const confirmed = await askConfirm({
        eyebrow: "Histórico de carga",
        title: `Limpar histórico de ${exercise.name}?`,
        message: "As cargas antigas deste exercício serão apagadas.",
        note: "A carga atual continuará salva na ficha.",
        confirmLabel: "Limpar histórico",
      });
      if (!confirmed) return;
      clear.disabled = true;
      clear.textContent = "Limpando…";
      try {
        await request(`workouts/${exercise.workoutId}/load-history`, { exerciseId: exercise.id }, "DELETE");
        history.length = 0;
        if (tools?.loadHistory) delete tools.loadHistory[key];
        listOpen = false;
        render();
      } catch (error) {
        clear.disabled = false;
        clear.textContent = "Limpar histórico";
        const failure = el("small", "student-trend-error", error.message);
        failure.setAttribute("role", "alert");
        details.append(failure);
      }
    });
    actions.append(toggle, clear);
    details.append(actions);
    [...history].reverse().forEach((item) => {
      const row = el("li");
      row.append(
        el("span", "", shortDate(item.at)),
        el("strong", "", item.load),
        el("small", "", item.by === "student" ? "você" : "personal"),
      );
      list.append(row);
    });
    details.append(list);
    node.append(details);
  };
  render();
  return {
    node,
    add(result, previous) {
      if (!result?.load) return;
      // Primeira mudança: a carga anterior também entra na evolução.
      if (!history.length && previous?.load)
        history.push({ load: previous.load, by: previous.loadBy || "trainer", at: previous.loadAt || new Date().toISOString() });
      if (history.at(-1)?.load === result.load) return;
      history.push({ load: result.load, by: "student", at: result.loadAt || new Date().toISOString() });
      render();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Calendário de treinos                                               */
/* ------------------------------------------------------------------ */

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function trainingCalendarCard(tools, request) {
  const card = el("article", "student-tool student-calendar");
  card.append(el("h2", "", "Meus treinos"));
  const done = new Map((tools.days || []).map((item) => [item.day, item.note || ""]));
  const today = localDay();
  const view = new Date();
  view.setDate(1);
  const status = el("p", "student-tool-status");
  status.setAttribute("role", "status");
  const todayBox = el("div", "student-calendar-today");
  const stats = el("div", "student-calendar-stats");
  const nav = el("div", "student-calendar-nav");
  const grid = el("div", "student-calendar-grid");

  const save = async (day, isDone, note) => {
    status.textContent = "";
    try {
      await request("training-day", { day, done: isDone, ...(note ? { note } : {}) });
      if (isDone) done.set(day, note || done.get(day) || "");
      else done.delete(day);
      return true;
    } catch (error) {
      status.textContent = error.message;
      return false;
    } finally {
      render();
    }
  };

  const renderToday = () => {
    todayBox.replaceChildren();
    if (done.has(today)) {
      todayBox.classList.add("is-done");
      todayBox.append(el("strong", "", "✓ Treino de hoje concluído"));
      if (done.get(today)) todayBox.append(el("small", "", `Seu recado: “${done.get(today)}”`));
      const undo = el("button", "student-link-button", "Desfazer");
      undo.type = "button";
      undo.addEventListener("click", () => void save(today, false));
      todayBox.append(undo);
      return;
    }
    todayBox.classList.remove("is-done");
    const open = el("button", "button button--primary", "✓ Concluir treino de hoje");
    open.type = "button";
    const form = el("form", "student-calendar-note");
    form.hidden = true;
    const label = el("label");
    const area = el("textarea");
    area.rows = 2;
    area.maxLength = 300;
    area.placeholder = "Ex.: senti o ombro no supino · achei leve, posso aumentar";
    label.append(el("span", "", "Recado para o personal (opcional)"), area);
    const confirm = el("button", "button button--primary", "Confirmar");
    confirm.type = "submit";
    form.append(label, confirm);
    open.addEventListener("click", () => {
      open.hidden = true;
      form.hidden = false;
      area.focus();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      confirm.disabled = true;
      const note = area.value.trim();
      const ok = await save(today, true, note);
      if (ok) status.textContent = note ? "Treino marcado e recado enviado ao personal." : "Treino marcado. Bom trabalho!";
    });
    todayBox.append(open, form);
  };

  const renderStats = () => {
    const now = new Date();
    const monthKey = localDay(now).slice(0, 7);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekKey = localDay(weekStart);
    let month = 0;
    let week = 0;
    done.forEach((_, day) => {
      if (day.startsWith(monthKey)) month += 1;
      if (day >= weekKey && day <= today) week += 1;
    });
    // Semanas seguidas com pelo menos um treino (a atual conta se já tiver).
    let streak = 0;
    const cursor = new Date(weekStart);
    for (let i = 0; i < 60; i += 1) {
      const from = localDay(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + 6);
      const to = localDay(end);
      const has = [...done.keys()].some((day) => day >= from && day <= to);
      if (has) streak += 1;
      else if (i > 0) break;
      cursor.setDate(cursor.getDate() - 7);
    }
    stats.replaceChildren();
    [
      [week, "nesta semana"],
      [month, "neste mês"],
      [streak, streak === 1 ? "semana seguida" : "semanas seguidas"],
    ].forEach(([value, text]) => {
      const tile = el("div");
      tile.append(el("strong", "", String(value)), el("span", "", text));
      stats.append(tile);
    });
  };

  const renderGrid = () => {
    nav.replaceChildren();
    const previous = el("button", "", "‹");
    previous.type = "button";
    previous.setAttribute("aria-label", "Mês anterior");
    const next = el("button", "", "›");
    next.type = "button";
    next.setAttribute("aria-label", "Próximo mês");
    const current = new Date();
    next.disabled = view.getFullYear() === current.getFullYear() && view.getMonth() === current.getMonth();
    previous.addEventListener("click", () => {
      view.setMonth(view.getMonth() - 1);
      renderGrid();
    });
    next.addEventListener("click", () => {
      view.setMonth(view.getMonth() + 1);
      renderGrid();
    });
    nav.append(previous, el("strong", "", `${MONTHS[view.getMonth()]} ${view.getFullYear()}`), next);

    grid.replaceChildren();
    ["S", "T", "Q", "Q", "S", "S", "D"].forEach((letter) => grid.append(el("span", "student-calendar-weekday", letter)));
    const offset = (view.getDay() + 6) % 7;
    for (let i = 0; i < offset; i += 1) grid.append(el("span", "student-calendar-blank"));
    const limit = new Date();
    limit.setDate(limit.getDate() - 60);
    const oldest = localDay(limit);
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let number = 1; number <= daysInMonth; number += 1) {
      const day = `${view.getFullYear()}-${pad(view.getMonth() + 1)}-${pad(number)}`;
      const cell = el("button", "student-calendar-day", String(number));
      cell.type = "button";
      const isDone = done.has(day);
      if (isDone) cell.classList.add("is-done");
      if (day === today) cell.classList.add("is-today");
      cell.disabled = day > today || day < oldest;
      cell.setAttribute("aria-pressed", String(isDone));
      cell.setAttribute("aria-label", `${number} de ${MONTHS[view.getMonth()]}${isDone ? ", treino concluído" : ""}`);
      cell.addEventListener("click", () => void save(day, !isDone));
      grid.append(cell);
    }
  };

  function render() {
    renderToday();
    renderStats();
    renderGrid();
  }
  render();
  card.append(
    todayBox,
    stats,
    nav,
    grid,
    el("small", "student-tool-hint", "Toque em um dia para marcar ou desmarcar um treino que você fez."),
    status,
  );
  return card;
}

/* ------------------------------------------------------------------ */
/* Água                                                                */
/* ------------------------------------------------------------------ */

const litres = (ml) => `${numberBr(ml / 1000, 2)} L`;

export function waterCard(tools, request) {
  const card = el("article", "student-tool student-water");
  card.append(el("h2", "", "Água de hoje"));
  const today = localDay();
  const days = { ...(tools.water?.days || {}) };
  let goal = Number(tools.water?.goalMl) || 2000;
  let total = Number(days[today]) || 0;
  const steps = [];
  const status = el("p", "student-tool-status");
  status.setAttribute("role", "status");

  const ringBox = el("div", "student-water-ring");
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const ring = svg("svg", { viewBox: "0 0 120 120", "aria-hidden": "true" });
  const track = svg("circle", { cx: 60, cy: 60, r: radius, class: "student-water-track" });
  const bar = svg("circle", {
    cx: 60,
    cy: 60,
    r: radius,
    class: "student-water-bar",
    "stroke-dasharray": circumference.toFixed(1),
    transform: "rotate(-90 60 60)",
  });
  ring.append(track, bar);
  const ringText = el("div", "student-water-value");
  const amount = el("strong");
  const of = el("span");
  ringText.append(amount, of);
  ringBox.append(ring, ringText);

  const message = el("p", "student-water-message");
  const actions = el("div", "student-water-actions");
  const week = el("div", "student-water-week");
  const goalRow = el("div", "student-water-goal");

  let saving = Promise.resolve();
  const push = (payload) => {
    status.textContent = "";
    saving = saving
      .then(() => request("water", payload))
      .catch((error) => {
        status.textContent = error.message;
      });
  };
  const setTotal = (value) => {
    total = Math.max(0, Math.min(15000, value));
    days[today] = total;
    render();
    push({ day: today, ml: total });
  };

  const sizes = { cup: Number(tools.water?.cupMl) || 200, bottle: Number(tools.water?.bottleMl) || 500 };
  const sizesEditable = Boolean(tools.water?.sizesReady);
  const sizeLabel = (ml) => (ml >= 1000 ? litres(ml) : `${ml} ml`);
  const renderActions = () => {
    actions.replaceChildren();
    [
      ["🥛 Copo", "cup"],
      ["🧴 Garrafa", "bottle"],
    ].forEach(([text, key]) => {
      const ml = sizes[key];
      const button = el("button", "student-water-add");
      button.type = "button";
      button.append(el("strong", "", `+${sizeLabel(ml)}`), el("span", "", text));
      button.addEventListener("click", () => {
        steps.push(ml);
        setTotal(total + ml);
      });
      actions.append(button);
    });
  };
  const undo = el("button", "student-link-button", "Desfazer último");
  undo.type = "button";
  undo.addEventListener("click", () => {
    const last = steps.pop() || sizes.cup;
    setTotal(total - last);
  });

  const renderGoal = () => {
    goalRow.replaceChildren();
    goalRow.append(
      el(
        "span",
        "",
        `Meta: ${litres(goal)} · Copo: ${sizeLabel(sizes.cup)} · Garrafa: ${sizeLabel(sizes.bottle)}`,
      ),
    );
    const change = el("button", "student-link-button", "alterar");
    change.type = "button";
    change.addEventListener("click", () => {
      const form = el("form", "student-water-goal-form");
      const numberField = (text, value, min, max, step) => {
        const label = el("label");
        const input = el("input");
        Object.assign(input, { type: "number", min: String(min), max: String(max), step: String(step), value: String(value), required: true });
        input.inputMode = "numeric";
        label.append(el("span", "", text), input);
        form.append(label);
        return input;
      };
      const goalInput = numberField("Meta do dia (ml)", goal, 500, 8000, 50);
      const cupInput = sizesEditable ? numberField("Copo (ml)", sizes.cup, 50, 3000, 10) : null;
      const bottleInput = sizesEditable ? numberField("Garrafa (ml)", sizes.bottle, 50, 3000, 10) : null;
      const buttons = el("div", "student-water-goal-buttons");
      const ok = el("button", "", "Salvar");
      ok.type = "submit";
      const cancel = el("button", "student-link-button", "Cancelar");
      cancel.type = "button";
      cancel.addEventListener("click", renderGoal);
      buttons.append(ok, cancel);
      form.append(buttons);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = Math.round(Number(goalInput.value));
        if (!(value >= 500 && value <= 8000)) {
          status.textContent = "A meta deve ficar entre 500 ml e 8 litros.";
          return;
        }
        const payload = {};
        if (sizesEditable) {
          const cup = Math.round(Number(cupInput.value));
          const bottle = Math.round(Number(bottleInput.value));
          if (!(cup >= 50 && cup <= 3000) || !(bottle >= 50 && bottle <= 3000)) {
            status.textContent = "O copo e a garrafa devem ter entre 50 ml e 3 litros.";
            return;
          }
          if (cup !== sizes.cup || bottle !== sizes.bottle) Object.assign(payload, { cupMl: cup, bottleMl: bottle });
          Object.assign(sizes, { cup, bottle });
        }
        if (value !== goal) payload.goalMl = value;
        goal = value;
        if (Object.keys(payload).length) push(payload);
        render();
      });
      goalRow.replaceChildren(form);
      (cupInput || goalInput).focus();
    });
    goalRow.append(change);
  };

  const renderWeek = () => {
    week.replaceChildren();
    const letters = ["D", "S", "T", "Q", "Q", "S", "S"];
    for (let back = 6; back >= 0; back -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - back);
      const ml = Number(days[localDay(date)]) || 0;
      const column = el("div", `student-water-day${ml >= goal ? " is-full" : ""}${back === 0 ? " is-today" : ""}`);
      column.title = `${shortDate(date)}: ${litres(ml)}`;
      const barBox = el("span", "student-water-day-bar");
      const fill = el("i");
      fill.style.height = `${Math.min(100, (ml / goal) * 100)}%`;
      barBox.append(fill);
      column.append(barBox, el("small", "", letters[date.getDay()]));
      week.append(column);
    }
  };

  function render() {
    const ratio = Math.min(1, total / goal);
    bar.setAttribute("stroke-dashoffset", (circumference * (1 - ratio)).toFixed(1));
    ringBox.classList.toggle("is-full", total >= goal);
    amount.textContent = litres(total);
    of.textContent = `de ${litres(goal)}`;
    message.textContent =
      total >= goal
        ? "🎉 Meta do dia batida!"
        : total === 0
          ? "Comece o dia com um copo d’água."
          : `Faltam ${litres(goal - total)} para a meta.`;
    undo.hidden = total === 0;
    renderActions();
    renderGoal();
    renderWeek();
  }
  render();
  const top = el("div", "student-water-top");
  const side = el("div", "student-water-side");
  side.append(message, actions, undo);
  top.append(ringBox, side);
  card.append(top, el("span", "student-tool-subtitle", "Últimos 7 dias"), week, goalRow, status);
  return card;
}

/* ------------------------------------------------------------------ */
/* Avaliação física                                                    */
/* ------------------------------------------------------------------ */

const has = (value) => value !== null && value !== undefined && value !== "" && !Number.isNaN(Number(value));

const BMI_BANDS = [
  [18.5, "Abaixo do peso", "low"],
  [25, "Peso normal", "ok"],
  [30, "Sobrepeso", "warn"],
  [Infinity, "Obesidade", "high"],
];
const bmiBand = (bmi) => BMI_BANDS.find(([limit]) => bmi < limit);

function bmiGauge(bmi) {
  const [, label, tone] = bmiBand(bmi);
  const box = el("div", "student-bmi");
  const head = el("div", "student-bmi-head");
  head.append(el("span", "", "IMC"), el("strong", "", numberBr(bmi)), el("em", `student-bmi-tag is-${tone}`, label));
  // Escala de 15 a 40, com as faixas da OMS para adultos.
  const from = 15;
  const to = 40;
  const scale = el("div", "student-bmi-scale");
  const widths = [18.5 - from, 25 - 18.5, 30 - 25, to - 30];
  ["low", "ok", "warn", "high"].forEach((name, index) => {
    const part = el("i", `is-${name}`);
    part.style.flex = String(widths[index]);
    scale.append(part);
  });
  const marker = el("b");
  marker.style.left = `${((Math.min(to, Math.max(from, bmi)) - from) / (to - from)) * 100}%`;
  scale.append(marker);
  const ticks = el("div", "student-bmi-ticks");
  [18.5, 25, 30].forEach((value) => {
    const tick = el("span", "", numberBr(value));
    tick.style.left = `${((value - from) / (to - from)) * 100}%`;
    ticks.append(tick);
  });
  box.append(head, scale, ticks);
  return box;
}

// % de gordura com a faixa certa para o sexo (classificação principal).
function fatGauge(composition) {
  const box = el("div", "student-bmi student-fat");
  const head = el("div", "student-bmi-head");
  head.append(
    el("span", "", "Composição corporal"),
    el("strong", "", `${numberBr(composition.value)}%`),
    el("em", `student-bmi-tag is-${composition.tone}`, composition.label),
  );
  const [from, to] = FAT_SCALE[composition.sex];
  const bands = FAT_BANDS[composition.sex];
  const scale = el("div", "student-bmi-scale");
  let start = from;
  bands.forEach(([limit, , tone]) => {
    const end = Math.min(limit, to);
    const part = el("i", `is-${tone}`);
    part.style.flex = String(Math.max(0.5, end - start));
    scale.append(part);
    start = end;
  });
  const marker = el("b");
  marker.style.left = `${((Math.min(to, Math.max(from, composition.value)) - from) / (to - from)) * 100}%`;
  scale.append(marker);
  const ticks = el("div", "student-bmi-ticks");
  bands.slice(0, -1).forEach(([limit]) => {
    const tick = el("span", "", `${numberBr(limit)}%`);
    tick.style.left = `${((limit - from) / (to - from)) * 100}%`;
    ticks.append(tick);
  });
  box.append(head, scale, ticks);
  return box;
}

function metricTile(icon, label, value, unit, delta) {
  const tile = el("div", "student-metric");
  tile.append(el("span", "student-metric-icon", icon), el("span", "student-metric-label", label));
  const number = el("strong", "student-metric-value", value);
  if (unit) number.append(el("small", "", ` ${unit}`));
  tile.append(number);
  if (delta) tile.append(el("span", "student-metric-delta", delta));
  return tile;
}

const deltaText = (current, previous, unit) => {
  if (!has(current) || !has(previous)) return "";
  const diff = Number(current) - Number(previous);
  if (Math.abs(diff) < 0.05) return "= igual à anterior";
  return `${diff > 0 ? "▲ +" : "▼ −"}${numberBr(Math.abs(diff))} ${unit} vs. anterior`;
};

// Guia das poses: modelo desenhado + explicação de cada uma, para o aluno
// tirar as fotos sozinho (à distância) do mesmo jeito que o personal pede.
let poseGuide = null;
function openPoseGuide(poses) {
  if (!poseGuide) {
    poseGuide = el("dialog", "student-pose-guide");
    document.body.append(poseGuide);
    poseGuide.addEventListener("click", (event) => {
      if (event.target === poseGuide) poseGuide.close();
    });
  }
  const head = el("header");
  head.append(el("h2", "", "📸 Como tirar as fotos de evolução"));
  const close = el("button", "student-pose-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fechar");
  close.addEventListener("click", () => poseGuide.close());
  head.append(close);
  const grid = el("div", "student-pose-grid");
  poses.forEach((item) => {
    const card = el("figure", "student-pose-card");
    const caption = el("figcaption");
    caption.append(el("strong", "", item.label), el("span", "", item.tip));
    card.append(poseModel(item.model, item.label), caption);
    grid.append(card);
  });
  const tips = el("ul", "student-pose-tips");
  PHOTO_TIPS.forEach((tip) => tips.append(el("li", "", tip)));
  poseGuide.replaceChildren(head, grid, el("strong", "student-pose-subtitle", "Para comparar bem"), tips, el("small", "student-tool-hint", "Envie as fotos para o seu personal pelo canal que vocês combinaram. 🔒 Só você e ele veem as fotos aqui."));
  poseGuide.showModal();
}

// Guia visual das medidas corporais. Os desenhos ficam no próprio código para
// carregar imediatamente, inclusive em conexão lenta, e acompanham as cores
// escolhidas para a página do personal.
const MEASURE_GUIDE = [
  ["weight", "Peso", "Balança em piso firme, de manhã, em jejum e depois de ir ao banheiro."],
  ["height", "Altura", "Descalço, calcanhares no chão, costas retas e olhar para a frente."],
  ["chest", "Peitoral", "Passe a fita na altura dos mamilos e anote depois de soltar o ar normalmente."],
  ["waist", "Cintura", "Meça na altura do umbigo, com a barriga relaxada e sem prender a respiração."],
  ["hip", "Quadril", "Pés juntos e fita na parte mais larga do bumbum."],
  ["arm", "Braço", "Braço relaxado: meça no meio entre o ombro e o cotovelo, sempre do mesmo lado."],
  ["thigh", "Coxa", "Em pé, peso nas duas pernas: meça no meio entre a virilha e o joelho."],
  ["calf", "Panturrilha", "Em pé, passe a fita na parte mais grossa, sem contrair a perna."],
];

function measureModel(model, label) {
  const holder = el("span", "student-measure-model");
  const body = `
    <circle cx="60" cy="20" r="11" fill="currentColor"/>
    <rect x="55" y="29" width="10" height="9" rx="3" fill="currentColor"/>
    <path d="M41 42 Q60 35 79 42 L73 99 Q60 105 47 99 Z" fill="currentColor"/>
    <path d="M46 96 Q60 104 74 96 L77 116 L43 116 Z" fill="currentColor"/>
    <path d="M42 45 L30 100 M78 45 L90 100 M51 112 L48 188 M69 112 L72 188"
      fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="10"/>
    <path d="M48 190 L40 191 M72 190 L80 191" fill="none" stroke="currentColor"
      stroke-linecap="round" stroke-width="5"/>`;
  const band = (cx, cy, rx, ry = 5) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none"
      stroke="var(--measure-accent, #fbbf24)" stroke-width="4"/>
     <circle cx="${cx + rx}" cy="${cy}" r="3.5" fill="var(--measure-accent, #fbbf24)"/>`;
  const details = {
    chest: band(60, 62, 22, 6),
    waist: band(60, 88, 17, 5),
    hip: band(60, 108, 21, 6),
    arm: `${band(31, 72, 7, 4)}<path d="M20 58 L11 50" stroke="var(--measure-accent, #fbbf24)" stroke-width="2"/><text x="2" y="47" fill="var(--measure-accent, #fbbf24)" font-size="9">meio</text>`,
    thigh: band(49, 137, 8, 4),
    calf: band(49, 164, 7, 4),
    height: `<path d="M103 10 V191 M97 11 H109 M97 190 H109" fill="none" stroke="var(--measure-accent, #fbbf24)" stroke-width="3"/><path d="M98 35 H106 M98 60 H106 M98 85 H106 M98 110 H106 M98 135 H106 M98 160 H106" stroke="var(--measure-accent, #fbbf24)" stroke-width="2"/>`,
  };
  const weight = `
    <rect x="19" y="68" width="82" height="74" rx="15" fill="currentColor" opacity=".92"/>
    <rect x="39" y="78" width="42" height="25" rx="8" fill="var(--measure-panel, #1b2a40)"/>
    <path d="M60 98 L69 86" stroke="var(--measure-accent, #fbbf24)" stroke-linecap="round" stroke-width="4"/>
    <path d="M34 119 Q42 106 50 121 M70 121 Q78 106 86 119" fill="none" stroke="var(--measure-panel, #1b2a40)" stroke-linecap="round" stroke-width="8"/>`;
  holder.innerHTML = `<svg viewBox="0 0 120 200" role="img" aria-label="Ilustração: ${label}">${model === "weight" ? weight : body + (details[model] || "")}</svg>`;
  return holder;
}

let measureGuide = null;
function openMeasureGuide() {
  if (!measureGuide) {
    measureGuide = el("dialog", "student-pose-guide student-measure-guide");
    document.body.append(measureGuide);
    measureGuide.addEventListener("click", (event) => {
      if (event.target === measureGuide) measureGuide.close();
    });
  }
  const head = el("header");
  head.append(el("h2", "", "📏 Como tirar as medidas"));
  const close = el("button", "student-pose-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fechar");
  close.addEventListener("click", () => measureGuide.close());
  head.append(close);
  const intro = el(
    "p",
    "student-measure-intro",
    "Use uma fita métrica flexível diretamente sobre a pele ou roupa bem fina. A fita deve ficar reta e encostada, sem apertar.",
  );
  const grid = el("div", "student-pose-grid student-measure-grid");
  MEASURE_GUIDE.forEach(([model, label, tip]) => {
    const card = el("figure", "student-pose-card student-measure-card");
    const caption = el("figcaption");
    caption.append(el("strong", "", label), el("span", "", tip));
    card.append(measureModel(model, label), caption);
    grid.append(card);
  });
  const tips = el("ul", "student-pose-tips");
  [
    "Meça sempre no mesmo horário, de preferência pela manhã.",
    "Mantenha a fita paralela ao chão nas medidas do tronco.",
    "Faça duas vezes; se os valores forem diferentes, meça uma terceira vez.",
    "Use sempre o mesmo lado do corpo para braço, coxa e panturrilha.",
    "Anote em centímetros, incluindo uma casa decimal quando necessário.",
  ].forEach((tip) => tips.append(el("li", "", tip)));
  measureGuide.replaceChildren(
    head,
    intro,
    grid,
    el("strong", "student-pose-subtitle", "Para comparar corretamente"),
    tips,
    el("small", "student-tool-hint", "Se puder, peça ajuda para manter a fita reta. Em caso de dúvida, confirme o ponto de medição com o seu personal."),
  );
  measureGuide.showModal();
}
// ---------- Autoavaliação (consultoria à distância)
// O aluno envia peso, medidas e fotos; o personal revisa e publica. Fica
// numa janela própria para não encher a área do aluno.
const SELF_FIELDS = [
  ["weight", "Peso (kg)", "weightKg", "De manhã, em jejum, depois de ir ao banheiro.", true],
  ["height", "Altura (cm)", "heightCm", "Descalço, encostado na parede."],
  ["waist", "Cintura (cm)", "waistCm", "Na altura do umbigo, barriga relaxada."],
  ["hip", "Quadril (cm)", "hipCm", "Na parte mais larga do bumbum, pés juntos."],
  ["chest", "Peitoral (cm)", "chestCm", "Na altura dos mamilos, depois de soltar o ar."],
  ["arm", "Braço (cm)", "armCm", "No meio do braço, relaxado ao lado do corpo."],
  ["thigh", "Coxa (cm)", "thighCm", "No meio da coxa, em pé e com o peso nas duas pernas."],
  ["calf", "Panturrilha (cm)", "calfCm", "Na parte mais grossa, em pé."],
];
let selfDialog = null;
function openSelfAssessment(options, poseList, loadPhoto) {
  if (!selfDialog) {
    selfDialog = el("dialog", "student-pose-guide student-self");
    document.body.append(selfDialog);
    selfDialog.addEventListener("click", (event) => {
      if (event.target === selfDialog) selfDialog.close();
    });
  }
  let pending = options.pending ? { ...options.pending, photos: [...(options.pending.photos || [])] } : null;
  let changed = false;
  const head = el("header");
  head.append(el("h2", "", "📤 Enviar medidas e fotos"));
  const close = el("button", "student-pose-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fechar");
  close.addEventListener("click", () => selfDialog.close());
  head.append(close);
  const intro = el("p", "student-self-intro", "Para a consultoria à distância: meça, tire as fotos e envie. O seu personal revisa e publica na sua avaliação.");
  const tabs = el("div", "student-photos-tabs student-self-tabs");
  const stage = el("div", "student-self-stage");
  const status = el("p", "student-tool-status");
  status.setAttribute("role", "status");
  const tabButton = (label, show) => {
    const button = el("button", "", label);
    button.type = "button";
    button.addEventListener("click", () => {
      [...tabs.children].forEach((item) => item.classList.toggle("is-active", item === button));
      show();
    });
    tabs.append(button);
    return button;
  };

  let measuresForm = null;
  const showMeasures = () => {
    const form = el("form", "student-self-form");
    measuresForm = form;
    SELF_FIELDS.forEach(([name, label, key, hint, required]) => {
      const field = el("label", "student-self-field");
      const input = el("input");
      Object.assign(input, { name, type: "text", inputMode: "decimal", pattern: "[0-9]+([.,][0-9]+)?", maxLength: 6, required: Boolean(required) });
      input.title = "Somente números (ex.: 78,5)";
      if (pending?.[key]) input.value = String(pending[key]);
      field.append(el("span", "", label + (required ? " *" : "")), input, el("small", "", hint));
      form.append(field);
    });
    const sexField = el("label", "student-self-field");
    const sex = el("select");
    sex.name = "sex";
    [["", "Prefiro não informar"], ["M", "Masculino"], ["F", "Feminino"]].forEach(([value, text]) => {
      const option = el("option", "", text);
      option.value = value;
      sex.append(option);
    });
    sex.value = pending?.sex || "";
    sexField.append(el("span", "", "Sexo"), sex, el("small", "", "Ajuda o personal a classificar a composição corporal."));
    const notesField = el("label", "student-self-field student-self-notes");
    const notes = el("textarea");
    notes.name = "notes";
    notes.rows = 3;
    notes.maxLength = 500;
    notes.placeholder = "Como foi a semana, dores, dúvidas…";
    notes.value = pending?.notes || "";
    notesField.append(el("span", "", "Recado para o personal"), notes);
    const submit = el("button", "button button--primary", pending ? "Salvar e ir para as fotos" : "Enviar medidas e ir para as fotos");
    submit.type = "submit";
    form.append(sexField, notesField, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      status.textContent = "Enviando…";
      try {
        const body = Object.fromEntries(new FormData(form));
        const result = await options.save(body);
        pending = { ...(pending || { photos: [] }), id: result.id };
        SELF_FIELDS.forEach(([name, , key]) => {
          pending[key] = body[name] ? Number(String(body[name]).replace(",", ".")) : null;
        });
        pending.sex = body.sex;
        pending.notes = body.notes;
        changed = true;
        status.textContent = "Medidas enviadas. Agora as fotos (opcional).";
        photosTab.click();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    stage.replaceChildren(form);
  };

  const showPhotos = () => {
    if (!pending?.id) {
      // Já preencheu o peso e tocou em "2. Fotos": envia as medidas sozinho.
      if (measuresForm?.isConnected && measuresForm.elements.weight?.value.trim() && measuresForm.checkValidity()) {
        [...tabs.children].forEach((item) => item.classList.toggle("is-active", item === measuresTab));
        measuresForm.requestSubmit();
        return;
      }
      const box = el("div", "student-self-first");
      box.append(
        el("strong", "", "Primeiro, a etapa 1: informe pelo menos o seu peso."),
        el("span", "", "Depois de enviar as medidas, as fotos são liberadas aqui. Veja as poses que vai fazer:"),
      );
      const back = el("button", "button button--primary", "← Preencher as medidas");
      back.type = "button";
      back.addEventListener("click", () => measuresTab.click());
      const preview = el("div", "student-self-preview");
      posesFor(poseList).forEach((item) => {
        const pose = el("figure", "");
        const caption = el("figcaption", "", item.label);
        pose.append(poseModel(item.model, item.label), caption);
        preview.append(pose);
      });
      box.append(back, preview);
      stage.replaceChildren(box);
      return;
    }
    const grid = el("div", "student-self-photos");
    posesFor(poseList).forEach((item) => {
      const slot = el("div", "student-self-photo");
      const frame = el("div", "student-photo-frame");
      const input = el("input");
      input.type = "file";
      input.accept = "image/*";
      input.hidden = true;
      const pick = el("button", "button button--secondary");
      pick.type = "button";
      const remove = el("button", "student-link-button", "Remover");
      remove.type = "button";
      const paint = async () => {
        const photo = pending.photos.find((entry) => entry.pose === item.pose);
        pick.textContent = photo ? "Trocar foto" : "📷 Enviar foto";
        remove.hidden = !photo;
        frame.replaceChildren();
        if (!photo) {
          frame.append(poseModel(item.model, item.label));
          return;
        }
        frame.append(el("small", "", "Carregando…"));
        const url = await loadPhoto?.(pending.id, item.pose, photo.v).catch(() => null);
        frame.replaceChildren();
        if (!url) return frame.append(el("small", "", "Foto enviada ✓"));
        const image = el("img");
        image.src = url;
        image.alt = item.label;
        frame.append(image);
      };
      pick.addEventListener("click", () => input.click());
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        pick.disabled = true;
        status.textContent = `Enviando a foto "${item.label}"…`;
        try {
          const saved = await options.uploadPhoto(pending.id, item.pose, await framePhoto(file));
          pending.photos = [...pending.photos.filter((entry) => entry.pose !== item.pose), { pose: item.pose, v: saved.v }];
          changed = true;
          status.textContent = "Foto enviada.";
          await paint();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          pick.disabled = false;
        }
      });
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          await options.removePhoto(pending.id, item.pose);
          pending.photos = pending.photos.filter((entry) => entry.pose !== item.pose);
          changed = true;
          await paint();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          remove.disabled = false;
        }
      });
      const caption = el("div", "student-self-photo-caption");
      caption.append(el("strong", "", item.label), el("small", "", item.tip));
      const actions = el("div", "student-self-photo-actions");
      actions.append(pick, remove);
      slot.append(frame, caption, actions, input);
      grid.append(slot);
      void paint();
    });
    const tips = el("details", "student-self-tips");
    tips.append(el("summary", "", "📸 Dicas para as fotos"));
    const list = el("ul");
    PHOTO_TIPS.forEach((tip) => list.append(el("li", "", tip)));
    tips.append(list);
    const done = el("button", "button button--primary", "Concluir envio");
    done.type = "button";
    done.addEventListener("click", () => selfDialog.close());
    stage.replaceChildren(tips, grid, done);
  };

  const measuresTab = tabButton("1. Medidas", showMeasures);
  const photosTab = tabButton("2. Fotos", showPhotos);
  selfDialog.replaceChildren(head, intro, tabs, stage, status, el("small", "student-tool-hint", "🔒 Só você e o seu personal veem as fotos e medidas."));
  selfDialog.onclose = () => {
    if (changed) options.reload?.();
  };
  measuresTab.click();
  selfDialog.showModal();
}

// Linha de ações do cartão: enviar medidas/fotos e o guia das poses.
function assessmentActions(poseList, selfOptions, loadPhoto) {
  const row = el("div", "student-assessment-actions");
  if (selfOptions?.save) {
    const pending = selfOptions.pending;
    const send = el("button", "button button--secondary", pending ? "📤 Editar o envio (aguardando o personal)" : "📤 Enviar medidas e fotos");
    send.type = "button";
    send.addEventListener("click", () => openSelfAssessment(selfOptions, poseList, loadPhoto));
    row.append(send);
  }
  row.append(poseGuideButton(poseList), measureGuideButton());
  const box = el("div", "student-assessment-actions-box");
  box.append(row);
  if (selfOptions?.pending) {
    const when = new Intl.DateTimeFormat("pt-BR").format(asDate(selfOptions.pending.assessedAt));
    box.append(el("small", "student-tool-hint", `✓ Você enviou medidas${selfOptions.pending.photos?.length ? ` e ${selfOptions.pending.photos.length} foto(s)` : ""} em ${when}. O personal vai revisar e publicar.`));
  }
  return box;
}

export function poseGuideButton(poses) {
  const button = el("button", "button button--secondary student-pose-button", "📸 Como tirar as fotos (poses)");
  button.type = "button";
  button.addEventListener("click", () => openPoseGuide(posesFor(poses)));
  return button;
}

export function measureGuideButton() {
  const button = el("button", "button button--secondary student-pose-button", "📏 Como tirar as medidas");
  button.type = "button";
  button.addEventListener("click", openMeasureGuide);
  return button;
}

// Antes e depois: a primeira avaliação com foto ao lado da mais recente.
function photoCompare(assessments, loadPhoto, poseList) {
  const withPhotos = assessments.filter((item) => item.photos?.length);
  if (!withPhotos.length || !loadPhoto) return null;
  // Por pose: "Antes" = a primeira avaliação com essa foto e "Depois" = a
  // mais recente. Assim nenhuma foto some (do personal ou do aluno).
  const withPose = (pose) => withPhotos.filter((item) => item.photos.some((photo) => photo.pose === pose));
  const poses = posesFor(poseList)
    .map((item) => [item.pose, item.label])
    .filter(([pose]) => withPose(pose).length);
  if (!poses.length) return null;
  const box = el("div", "student-photos");
  box.append(el("span", "student-tool-subtitle", "Fotos de evolução"));
  const tabs = el("div", "student-photos-tabs");
  const stage = el("div", "student-photos-stage");
  const dateOf = (item) => new Intl.DateTimeFormat("pt-BR").format(asDate(item.assessedAt));
  const figure = (item, pose, caption) => {
    const wrap = el("figure", "student-photo");
    const frame = el("div", "student-photo-frame");
    const photo = item.photos.find((entry) => entry.pose === pose);
    const label = el("figcaption");
    label.append(el("strong", "", caption), el("span", "", dateOf(item)));
    if (!photo) frame.append(el("small", "", "Sem foto nesta posição"));
    else {
      // Quem enviou a foto: o próprio aluno (autoavaliação) ou o personal.
      const mine = photo.by === "student";
      frame.append(el("em", `student-photo-origin${mine ? " is-mine" : ""}`, mine ? "📤 Você enviou" : "📷 Personal"));
      const loading = el("small", "", "Carregando…");
      frame.append(loading);
      loadPhoto(item.id, pose, photo.v)
        .then((url) => {
          loading.remove();
          if (!url) return frame.append(el("small", "", "Não foi possível carregar."));
          const image = el("img");
          image.src = url;
          image.alt = `${caption} · ${dateOf(item)}`;
          image.loading = "lazy";
          frame.prepend(image);
          // Baixar a foto (as do personal e as que o aluno enviou).
          const download = el("a", "student-photo-download", "⬇ Baixar");
          download.href = url;
          download.download = `foto-${pose}-${dateOf(item).replace(/\//gu, "-")}.jpg`;
          label.append(download);
        })
        .catch(() => frame.replaceChildren(el("small", "", "Não foi possível carregar.")));
    }
    wrap.append(frame, label);
    return wrap;
  };
  const all = el("details", "student-photos-all");
  const show = (pose) => {
    [...tabs.children].forEach((tab) => tab.classList.toggle("is-active", tab.dataset.pose === pose));
    stage.replaceChildren();
    const list = withPose(pose);
    const latest = list[0];
    const first = list.at(-1);
    stage.classList.toggle("is-single", first === latest);
    if (first === latest) stage.append(figure(latest, pose, "Avaliação"));
    else stage.append(figure(first, pose, "Antes"), figure(latest, pose, "Depois"));
    // Todas as fotos desta pose, por data (abre só quando tocar).
    all.hidden = list.length < 3;
    all.open = false;
    all.replaceChildren(el("summary", "", `Ver todas as fotos desta pose (${list.length})`));
    all.ontoggle = () => {
      if (!all.open || all.dataset.pose === pose) return;
      all.dataset.pose = pose;
      const grid = el("div", "student-photos-grid");
      list.forEach((item) => grid.append(figure(item, pose, item.protocol || "Avaliação")));
      all.append(grid);
    };
    delete all.dataset.pose;
  };
  poses.forEach(([pose, label]) => {
    const tab = el("button", "", label);
    tab.type = "button";
    tab.dataset.pose = pose;
    tab.addEventListener("click", () => show(pose));
    tabs.append(tab);
  });
  box.append(tabs, stage, all, el("small", "student-tool-hint", "🔒 Só você e o seu personal veem estas fotos."));
  show(poses[0][0]);
  return box;
}

export function assessmentCard(assessments, onDownload, loadPhoto, poseList = null, selfOptions = null) {
  const card = el("article", "student-tool student-assessment student-card--wide");
  card.append(el("h2", "", "Avaliação física"));
  if (!assessments.length) {
    card.append(el("p", "student-tool-empty", "Nenhuma avaliação foi publicada ainda. Quando o personal publicar, o resultado aparece aqui."), assessmentActions(poseList, selfOptions, loadPhoto));
    return card;
  }
  const [latest, previous] = assessments;
  const meta = el("p", "student-assessment-meta");
  meta.textContent = `${latest.protocol || "Avaliação"} · ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(asDate(latest.assessedAt))}`;
  card.append(meta);
  // Com % de gordura e sexo, a gordura é a classificação principal e o IMC
  // vira referência (o IMC não diferencia músculo de gordura).
  const composition = fatClass(latest.sex, latest.bodyFatPercent);
  if (composition) card.append(fatGauge(composition));
  if (has(latest.bmi) && Number(latest.bmi) > 0) {
    const gauge = bmiGauge(Number(latest.bmi));
    if (composition) gauge.classList.add("is-secondary");
    card.append(gauge, el("p", "student-bmi-note", bmiNote(latest.bmi, latest.sex, latest.bodyFatPercent)));
  }
  const tiles = el("div", "student-metrics");
  const add = (icon, label, key, unit, digits = 1) => {
    if (!has(latest[key]) || Number(latest[key]) === 0) return;
    tiles.append(metricTile(icon, label, numberBr(latest[key], digits), unit, deltaText(latest[key], previous?.[key], unit)));
  };
  add("⚖️", "Peso", "weightKg", "kg");
  add("📉", "Gordura corporal", "bodyFatPercent", "%");
  // Massa magra e massa gorda saem do peso e do percentual de gordura.
  const masses = (item) =>
    item && has(item.weightKg) && has(item.bodyFatPercent) && Number(item.bodyFatPercent) > 0
      ? {
          leanKg: Number(item.weightKg) * (1 - Number(item.bodyFatPercent) / 100),
          fatKg: (Number(item.weightKg) * Number(item.bodyFatPercent)) / 100,
        }
      : {};
  Object.assign(latest, masses(latest));
  if (previous) Object.assign(previous, masses(previous));
  add("💪", "Massa magra", "leanKg", "kg");
  add("🧈", "Massa gorda", "fatKg", "kg");
  add("📏", "Altura", "heightCm", "cm", 0);
  add("➰", "Cintura", "waistCm", "cm");
  add("🍐", "Quadril", "hipCm", "cm");
  add("➗", "Relação cintura/quadril", "whr", "", 2);
  if (latest.bloodPressure) tiles.append(metricTile("🩺", "Pressão arterial", String(latest.bloodPressure), "mmHg"));
  add("❤️", "Frequência em repouso", "restingHr", "bpm", 0);
  add("👕", "Peitoral", "chestCm", "cm");
  add("💪", "Braço", "armCm", "cm");
  add("🦵", "Coxa", "thighCm", "cm");
  add("🦶", "Panturrilha", "calfCm", "cm");
  add("🏋️", "Flexões", "pushUps", "rep.", 0);
  add("⏱️", "Prancha", "plankSeconds", "s", 0);
  add("🤸", "Flexibilidade", "sitAndReachCm", "cm");
  if (tiles.childElementCount) card.append(tiles);
  if (latest.notes) {
    const notes = el("div", "student-assessment-notes");
    notes.append(el("span", "", "💬 Observações do personal"), el("p", "", latest.notes));
    card.append(notes);
  }
  const compare = photoCompare(assessments, loadPhoto, poseList);
  if (compare) card.append(compare);
  card.append(assessmentActions(poseList, selfOptions, loadPhoto));
  if (assessments.length > 1) {
    const older = el("details", "student-assessment-older");
    older.append(el("summary", "", `Avaliações anteriores (${assessments.length - 1})`));
    const list = el("ul");
    assessments.slice(1).forEach((item) => {
      const row = el("li");
      row.append(el("span", "", new Intl.DateTimeFormat("pt-BR").format(asDate(item.assessedAt))));
      const parts = [];
      if (has(item.weightKg)) parts.push(`${numberBr(item.weightKg)} kg`);
      if (has(item.bmi)) parts.push(`IMC ${numberBr(item.bmi)}`);
      if (has(item.bodyFatPercent)) parts.push(`${numberBr(item.bodyFatPercent)}% gordura`);
      row.append(el("strong", "", parts.join(" · ") || "—"));
      list.append(row);
    });
    older.append(list);
    card.append(older);
  }
  if (onDownload) {
    const download = el("button", "button button--secondary", "⬇ Baixar avaliação e evolução em PDF");
    download.type = "button";
    download.addEventListener("click", () => onDownload());
    card.append(download);
  }
  card.append(el("small", "student-tool-hint", "Composição corporal pela tabela do ACE (homem/mulher). O IMC é uma referência geral para adultos. Vale a leitura do seu personal."));
  return card;
}

function lineChart(points, unit) {
  const width = 320;
  const height = 130;
  const left = 8;
  const right = 8;
  const top = 22;
  const bottom = 22;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xy = points.map((point, index) => [
    left + (index * (width - left - right)) / (points.length - 1),
    top + (1 - (point.value - min) / span) * (height - top - bottom),
  ]);
  const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "student-progress-chart", role: "img" });
  chart.setAttribute("aria-label", points.map((point) => `${point.label}: ${numberBr(point.value)} ${unit}`).join("; "));
  const path = xy.map((point) => point.map((n) => n.toFixed(1)).join(",")).join(" ");
  chart.append(
    svg("polygon", {
      class: "student-progress-area",
      points: `${xy[0][0].toFixed(1)},${height - bottom} ${path} ${xy.at(-1)[0].toFixed(1)},${height - bottom}`,
    }),
    svg("polyline", { class: "student-progress-line", points: path, fill: "none" }),
  );
  const labelEvery = Math.ceil(points.length / 6);
  xy.forEach(([x, y], index) => {
    chart.append(svg("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.5, class: "student-progress-dot" }));
    const edge = index === 0 || index === points.length - 1;
    if (!edge && index % labelEvery !== 0) return;
    const anchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
    if (edge) {
      const value = svg("text", { x: x.toFixed(1), y: (y - 8).toFixed(1), "text-anchor": anchor, class: "student-progress-value" });
      value.textContent = numberBr(points[index].value);
      chart.append(value);
    }
    const date = svg("text", { x: x.toFixed(1), y: height - 6, "text-anchor": anchor, class: "student-progress-date" });
    date.textContent = points[index].label;
    chart.append(date);
  });
  return chart;
}

export function progressCard(assessments) {
  const card = el("article", "student-tool student-progress student-card--wide");
  card.append(el("h2", "", "Progresso"));
  const ordered = [...assessments].reverse();
  const series = [
    ["Peso", "weightKg", "kg"],
    ["Gordura corporal", "bodyFatPercent", "%"],
    ["Cintura", "waistCm", "cm"],
  ]
    .map(([label, key, unit]) => ({
      label,
      unit,
      points: ordered
        .filter((item) => has(item[key]) && Number(item[key]) > 0)
        .map((item) => ({ value: Number(item[key]), label: shortDate(item.assessedAt) })),
    }))
    .filter((item) => item.points.length >= 2);
  if (!series.length) {
    card.append(el("p", "student-tool-empty", "Seu gráfico de evolução aparece aqui depois da próxima reavaliação."));
    return card;
  }
  const grid = el("div", "student-progress-grid");
  series.forEach((item) => {
    const box = el("div", "student-progress-item");
    const first = item.points[0].value;
    const last = item.points.at(-1).value;
    const diff = last - first;
    const head = el("div", "student-progress-head");
    head.append(el("span", "", item.label));
    head.append(
      el(
        "strong",
        "",
        Math.abs(diff) < 0.05 ? "sem variação" : `${diff > 0 ? "+" : "−"}${numberBr(Math.abs(diff))} ${item.unit}`,
      ),
    );
    box.append(head, lineChart(item.points, item.unit), el("small", "", `De ${numberBr(first)} para ${numberBr(last)} ${item.unit} em ${item.points.length} avaliações`));
    grid.append(box);
  });
  card.append(grid);
  return card;
}

/* ------------------------------------------------------------------ */
/* Nutrição: indicações do personal                                    */
/* ------------------------------------------------------------------ */

const safeLink = (value) => (/^https:\/\//iu.test(String(value || "")) ? String(value) : "");

export function referralsCard(referrals, studentName) {
  const nutritionist = referrals?.nutritionist;
  const app = referrals?.app;
  if (!nutritionist && !app) return null;
  const card = el("article", "student-tool student-referrals");
  card.append(el("h2", "", "Nutrição"), el("p", "student-tool-empty", "Indicações do seu personal para cuidar da alimentação."));
  const linkButton = (text, href, primary) => {
    const link = el("a", `button ${primary ? "button--primary" : "button--secondary"}`, text);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  };
  if (nutritionist) {
    const box = el("div", "student-referral");
    const head = el("div", "student-referral-head");
    head.append(el("span", "student-referral-icon", "🥗"));
    const who = el("div");
    who.append(el("small", "", "Nutricionista indicado"), el("strong", "", nutritionist.name));
    if (nutritionist.registration) who.append(el("span", "", nutritionist.registration));
    head.append(who);
    box.append(head);
    if (nutritionist.note) box.append(el("p", "", nutritionist.note));
    const actions = el("div", "student-referral-actions");
    if (/^55\d{10,11}$/u.test(String(nutritionist.whatsapp || ""))) {
      const message = `Olá! Sou ${studentName || "aluno(a)"} e fui indicado(a) pelo meu personal. Gostaria de agendar uma consulta.`;
      actions.append(linkButton("Chamar no WhatsApp", `https://wa.me/${nutritionist.whatsapp}?text=${encodeURIComponent(message)}`, true));
    }
    if (safeLink(nutritionist.link)) actions.append(linkButton("Ver perfil", safeLink(nutritionist.link), false));
    if (actions.childElementCount) box.append(actions);
    card.append(box);
  }
  if (app) {
    const box = el("div", "student-referral");
    const head = el("div", "student-referral-head");
    head.append(el("span", "student-referral-icon", "📱"));
    const which = el("div");
    which.append(el("small", "", "App para refeições e calorias"), el("strong", "", app.name));
    head.append(which);
    box.append(head);
    if (app.note) box.append(el("p", "", app.note));
    // Aviso fixo: indicar um app de registro não é prescrever dieta.
    box.append(
      el(
        "p",
        "student-referral-warning",
        "⚠️ É só uma ferramenta de registro, não uma dieta montada por mim. Para um plano alimentar individualizado, procure um(a) nutricionista.",
      ),
    );
    const actions = el("div", "student-referral-actions");
    const android = safeLink(app.link);
    const ios = safeLink(app.linkIos);
    if (android) actions.append(linkButton(ios ? "Android" : /play\.google\.com/iu.test(android) ? "Baixar no Android" : "Abrir o app", android, false));
    if (ios) actions.append(linkButton("iPhone", ios, false));
    const web = safeLink(app.linkWeb);
    if (web) actions.append(linkButton("💻 Computador (site)", web, false));
    if (actions.childElementCount) box.append(actions);
    if (!ios) box.append(el("small", "student-referral-ios", `iPhone: busque “${app.name}” na App Store.`));
    card.append(box);
  }
  if (/^[A-Za-z0-9._]{1,60}$/u.test(String(referrals.instagram || ""))) {
    const contact = el("p", "student-referral-contact", "Dúvidas? Fale com seu personal no Instagram: ");
    const profile = el("a", "", `@${referrals.instagram}`);
    profile.href = `https://instagram.com/${referrals.instagram}`;
    profile.target = "_blank";
    profile.rel = "noopener noreferrer";
    contact.append(profile);
    card.append(contact);
  }
  card.append(el("small", "student-tool-hint", "O plano alimentar é feito pelo nutricionista. O personal cuida do seu treino."));
  return card;
}
