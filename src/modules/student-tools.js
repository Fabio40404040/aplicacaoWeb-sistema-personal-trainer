// Ferramentas da área do aluno: cronômetro de descanso, evolução da carga,
// calendário de treinos concluídos (com recado ao personal), água e o
// resultado da avaliação física em formato visual.
import "../styles/student-tools.css";

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

function beep() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    const context = new Audio();
    [0, 0.25, 0.5].forEach((start) => {
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.frequency.value = 880;
      gain.gain.value = 0.15;
      tone.connect(gain).connect(context.destination);
      tone.start(context.currentTime + start);
      tone.stop(context.currentTime + start + 0.15);
    });
    window.setTimeout(() => void context.close(), 1200);
  } catch {
    /* sem som: fica o aviso na tela */
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* sem vibração */
  }
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
  const stop = () => {
    window.clearInterval(interval);
    window.clearTimeout(doneTimeout);
    interval = null;
    if (stopRunningTimer === stop) stopRunningTimer = null;
    idle();
  };
  const start = () => {
    stopRunningTimer?.();
    stopRunningTimer = stop;
    // Conta pelo relógio: continua certo mesmo se a aba ficar em segundo plano.
    const endsAt = Date.now() + total * 1000;
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
      label.textContent = "✓ Próxima série!";
      beep();
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
export function loadTrend(exercise, tools) {
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
    details.append(toggle);
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

export function assessmentCard(assessments, onDownload) {
  const card = el("article", "student-tool student-assessment student-card--wide");
  card.append(el("h2", "", "Avaliação física"));
  if (!assessments.length) {
    card.append(el("p", "student-tool-empty", "Nenhuma avaliação foi publicada ainda. Quando o personal publicar, o resultado aparece aqui."));
    return card;
  }
  const [latest, previous] = assessments;
  const meta = el("p", "student-assessment-meta");
  meta.textContent = `${latest.protocol || "Avaliação"} · ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(asDate(latest.assessedAt))}`;
  card.append(meta);
  if (has(latest.bmi) && Number(latest.bmi) > 0) card.append(bmiGauge(Number(latest.bmi)));
  const tiles = el("div", "student-metrics");
  const add = (icon, label, key, unit, digits = 1) => {
    if (!has(latest[key]) || Number(latest[key]) === 0) return;
    tiles.append(metricTile(icon, label, numberBr(latest[key], digits), unit, deltaText(latest[key], previous?.[key], unit)));
  };
  add("⚖️", "Peso", "weightKg", "kg");
  add("📉", "Gordura corporal", "bodyFatPercent", "%");
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
  card.append(el("small", "student-tool-hint", "O IMC é uma referência geral para adultos e não considera a massa muscular. Vale a leitura do seu personal."));
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
    if (safeLink(app.link)) {
      const actions = el("div", "student-referral-actions");
      actions.append(linkButton("Abrir o app", safeLink(app.link), false));
      box.append(actions);
    }
    card.append(box);
  }
  card.append(el("small", "student-tool-hint", "O plano alimentar é feito pelo nutricionista. O personal cuida do seu treino."));
  return card;
}
