// Relatório em PDF da avaliação física e da evolução do aluno. Usa a mesma
// base de arquivo da ficha de treino (workout-pdf.js), com a marca e a cor
// do personal.
import { drawWatermark, pdfDocument } from "./workout-pdf.js";

const H = 842;
const LEFT = 25;
const RIGHT = 570;

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const pdfColor = (rgb) => rgb.map((n) => n.toFixed(3)).join(" ");
const mix = (rgb, other, amount) => rgb.map((n, i) => n + (other[i] - n) * amount);
const WHITE = [1, 1, 1];
const INK = pdfColor(hexRgb("#14213d"));
const MUTED = pdfColor(hexRgb("#5d6b84"));
const LINE = pdfColor(hexRgb("#d5dbe6"));
const PANEL = pdfColor(hexRgb("#f2f5fa"));
const BANDS = [
  [18.5, "Abaixo do peso", "#3b82f6"],
  [25, "Peso normal", "#10b981"],
  [30, "Sobrepeso", "#f59e0b"],
  [Infinity, "Obesidade", "#ef4444"],
];

// Texto com acentos: as fontes usam WinAnsi, então cada letra acentuada vai
// como código octal (o arquivo continua só com caracteres simples).
function pdfText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[–—−]/gu, "-")
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/→/gu, ">")
    .replace(/[^\x20-\x7e\xa0-\xff]/gu, "")
    .replace(/([\\()])/gu, "\\$1")
    .replace(/[\xa0-\xff]/gu, (char) => `\\${char.charCodeAt(0).toString(8)}`);
}
const plainLength = (value) => String(value ?? "").length;
const textWidth = (value, size, bold) => plainLength(value) * size * (bold ? 0.56 : 0.51);

function text(page, value, x, top, size = 10, { bold = false, color = INK, align = "left" } = {}) {
  const width = textWidth(value, size, bold);
  const startX = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  page.push(`BT ${color} rg /${bold ? "F2" : "F1"} ${size} Tf ${startX.toFixed(2)} ${(H - top - size).toFixed(2)} Td (${pdfText(value)}) Tj ET`);
}
function rect(page, x, top, width, height, fill, stroke = null) {
  page.push(`0.8 w ${fill} rg ${stroke || fill} RG ${x.toFixed(2)} ${(H - top - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${stroke ? "B" : "f"}`);
}
function stroke(page, points, color, width = 1) {
  page.push(
    `${width} w 1 J 1 j ${color} RG ${points.map(([x, top], i) => `${x.toFixed(2)} ${(H - top).toFixed(2)} ${i ? "l" : "m"}`).join(" ")} S`,
  );
}
function polygon(page, points, fill) {
  page.push(`${fill} rg ${points.map(([x, top], i) => `${x.toFixed(2)} ${(H - top).toFixed(2)} ${i ? "l" : "m"}`).join(" ")} h f`);
}
function dot(page, x, top, radius, fill, ring) {
  const y = H - top;
  const k = radius * 0.5523;
  page.push(
    `1.4 w ${fill} rg ${ring} RG ${x + radius} ${y} m ${x + radius} ${y + k} ${x + k} ${y + radius} ${x} ${y + radius} c ` +
      `${x - k} ${y + radius} ${x - radius} ${y + k} ${x - radius} ${y} c ${x - radius} ${y - k} ${x - k} ${y - radius} ${x} ${y - radius} c ` +
      `${x + k} ${y - radius} ${x + radius} ${y - k} ${x + radius} ${y} c B`,
  );
}

const has = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) !== 0;
const num = (value, digits = 1) => Number(value).toLocaleString("pt-BR", { maximumFractionDigits: digits });
function asDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(String(value || ""));
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
}
const dateBr = (value) => {
  const date = asDate(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
};
const shortDate = (value) => dateBr(value).slice(0, 5);

const ROWS = [
  ["Peso", "weightKg", "kg", 1],
  ["Altura", "heightCm", "cm", 0],
  ["Gordura corporal", "bodyFatPercent", "%", 1],
  ["Cintura", "waistCm", "cm", 1],
  ["Quadril", "hipCm", "cm", 1],
  ["Relação cintura/quadril", "whr", "", 2],
  ["Peitoral", "chestCm", "cm", 1],
  ["Braço", "armCm", "cm", 1],
  ["Coxa", "thighCm", "cm", 1],
  ["Panturrilha", "calfCm", "cm", 1],
  ["Frequência cardíaca em repouso", "restingHr", "bpm", 0],
  ["Flexões", "pushUps", "rep.", 0],
  ["Prancha", "plankSeconds", "s", 0],
  ["Flexibilidade (sentar e alcançar)", "sitAndReachCm", "cm", 1],
];

function wrap(value, limit) {
  const lines = [];
  String(value || "")
    .split(/\r?\n/u)
    .forEach((paragraph) => {
      let current = "";
      paragraph.split(/\s+/u).forEach((word) => {
        if ((current + " " + word).trim().length > limit) {
          if (current) lines.push(current);
          current = word;
        } else current = `${current} ${word}`.trim();
      });
      lines.push(current);
    });
  return lines.filter((line, index, all) => line || (index > 0 && index < all.length - 1));
}

function header(page, theme, title, subtitle, brand) {
  rect(page, LEFT, 20, RIGHT - LEFT, 58, theme.main);
  rect(page, LEFT, 20, 8, 58, theme.dark);
  text(page, title, 44, 31, 20, { bold: true, color: "1 1 1" });
  text(page, subtitle, 44, 57, 9, { color: "1 1 1" });
  text(page, brand, RIGHT - 16, 42, 10, { bold: true, color: "1 1 1", align: "right" });
}

function sectionTitle(page, theme, label, top) {
  rect(page, LEFT, top + 1, 4, 12, theme.main);
  text(page, label.toUpperCase(), LEFT + 10, top + 2, 9.5, { bold: true, color: theme.dark });
  return top + 22;
}

function bmiBlock(page, theme, bmi, top) {
  const [, label, hex] = BANDS.find(([limit]) => bmi < limit);
  const tone = hexRgb(hex);
  rect(page, LEFT, top, RIGHT - LEFT, 84, PANEL, LINE);
  text(page, "ÍNDICE DE MASSA CORPORAL (IMC)", LEFT + 16, top + 12, 7.5, { bold: true, color: MUTED });
  text(page, num(bmi), LEFT + 16, top + 27, 30, { bold: true });
  const pillWidth = textWidth(label, 9, true) + 20;
  rect(page, LEFT + 16, top + 62, pillWidth, 15, pdfColor(mix(tone, WHITE, 0.82)));
  text(page, label, LEFT + 26, top + 65, 9, { bold: true, color: pdfColor(mix(tone, [0, 0, 0], 0.35)) });
  // Régua de 15 a 40 com as faixas da OMS.
  const from = 15;
  const to = 40;
  const x0 = 215;
  const x1 = RIGHT - 20;
  const at = (value) => x0 + ((Math.min(to, Math.max(from, value)) - from) / (to - from)) * (x1 - x0);
  let start = from;
  BANDS.forEach(([limit, , bandHex]) => {
    const end = Math.min(limit, to);
    rect(page, at(start) + 1, top + 34, at(end) - at(start) - 2, 11, pdfColor(hexRgb(bandHex)));
    start = end;
  });
  [18.5, 25, 30].forEach((value) => text(page, num(value), at(value), top + 50, 7.5, { color: MUTED, align: "center" }));
  ["Abaixo", "Normal", "Sobrepeso", "Obesidade"].forEach((name, index) => {
    const edges = [from, 18.5, 25, 30, to];
    text(page, name, (at(edges[index]) + at(edges[index + 1])) / 2, top + 20, 7, { color: MUTED, align: "center" });
  });
  const x = at(bmi);
  rect(page, x - 2.5, top + 30, 5, 19, INK, "1 1 1");
  text(page, "Referência geral para adultos; não considera a massa muscular.", x0, top + 66, 7, { color: MUTED });
  return top + 98;
}

function table(page, theme, latest, previous, top) {
  const rows = ROWS.filter(([, key]) => has(latest[key]));
  if (latest.bloodPressure) rows.splice(Math.min(rows.length, 10), 0, ["Pressão arterial", "bloodPressure", "mmHg", null]);
  if (!rows.length) return top;
  const columns = [LEFT + 14, 300, 400, 490];
  rect(page, LEFT, top, RIGHT - LEFT, 20, theme.dark);
  ["Medida", "Atual", previous ? `Anterior (${shortDate(previous.assessedAt)})` : "Anterior", "Variação"].forEach((label, index) =>
    text(page, label, columns[index], top + 6, 8, { bold: true, color: "1 1 1" }),
  );
  let y = top + 20;
  rows.forEach(([label, key, unit, digits], index) => {
    if (index % 2 === 0) rect(page, LEFT, y, RIGHT - LEFT, 18, PANEL);
    text(page, label, columns[0], y + 5, 9);
    const show = (value) => (digits === null ? String(value) : num(value, digits)) + (unit ? ` ${unit}` : "");
    text(page, show(latest[key]), columns[1], y + 5, 9.5, { bold: true });
    const before = previous?.[key];
    const hasBefore = digits === null ? Boolean(before) : has(before);
    text(page, hasBefore ? show(before) : "-", columns[2], y + 5, 9, { color: MUTED });
    if (hasBefore && digits !== null) {
      const diff = Number(latest[key]) - Number(before);
      const flat = Math.abs(diff) < 0.5 / 10 ** digits;
      text(page, flat ? "igual" : `${diff > 0 ? "+" : "-"}${num(Math.abs(diff), digits)}${unit ? ` ${unit}` : ""}`, columns[3], y + 5, 9, {
        bold: !flat,
        color: flat ? MUTED : theme.dark,
      });
    } else text(page, "-", columns[3], y + 5, 9, { color: MUTED });
    y += 18;
  });
  stroke(page, [[LEFT, y], [RIGHT, y]], LINE, 0.8);
  return y + 16;
}

function chart(page, theme, series, x, top, width) {
  const height = 122;
  rect(page, x, top, width, height, "1 1 1", LINE);
  const first = series.points[0].value;
  const last = series.points.at(-1).value;
  const diff = last - first;
  text(page, series.label, x + 10, top + 9, 8.5, { bold: true, color: MUTED });
  text(
    page,
    Math.abs(diff) < 0.05 ? "sem variação" : `${diff > 0 ? "+" : "-"}${num(Math.abs(diff))} ${series.unit}`,
    x + width - 10,
    top + 8,
    10,
    { bold: true, color: theme.dark, align: "right" },
  );
  const values = series.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const px0 = x + 18;
  const px1 = x + width - 18;
  const py0 = top + 44;
  const py1 = top + height - 24;
  const xy = series.points.map((point, index) => [
    px0 + (index * (px1 - px0)) / (series.points.length - 1),
    py0 + (1 - (point.value - min) / span) * (py1 - py0),
  ]);
  [0, 0.5, 1].forEach((ratio) => stroke(page, [[px0 - 6, py0 + ratio * (py1 - py0)], [px1 + 6, py0 + ratio * (py1 - py0)]], LINE, 0.4));
  polygon(page, [[xy[0][0], py1 + 4], ...xy, [xy.at(-1)[0], py1 + 4]], theme.soft);
  stroke(page, xy, theme.main, 2);
  xy.forEach(([px, py], index) => {
    dot(page, px, py, 2.6, "1 1 1", theme.main);
    text(page, num(series.points[index].value), px, py - 13, 7.5, { bold: true, align: "center" });
    text(page, series.points[index].label, px, top + height - 14, 6.5, { color: MUTED, align: "center" });
  });
}

export function buildAssessmentPdfBytes(assessments, student, options = {}) {
  const accent = hexRgb(options.accent?.main || "#1764ff");
  const dark = hexRgb(options.accent?.dark || "#0d3aa8");
  const theme = { main: pdfColor(accent), dark: pdfColor(mix(dark, [0, 0, 0], 0.25)), soft: pdfColor(mix(accent, WHITE, 0.86)) };
  const brand = String(options.brand || "FARISA PERSONAL").trim().toUpperCase().slice(0, 34);
  const ordered = [...assessments].sort((a, b) => asDate(b.assessedAt) - asDate(a.assessedAt));
  const [latest, previous] = ordered;
  const pages = [];
  let page = [];
  header(page, theme, "AVALIAÇÃO FÍSICA", "Relatório de resultados e evolução", brand);

  rect(page, LEFT, 86, RIGHT - LEFT, 46, PANEL, LINE);
  [
    ["ALUNO", String(student?.name || "Aluno(a)").slice(0, 38), LEFT + 14],
    ["AVALIAÇÃO", String(latest.protocol || "Avaliação física").slice(0, 24), 300],
    ["DATA", dateBr(latest.assessedAt), 470],
  ].forEach(([label, value, x]) => {
    text(page, label, x, 96, 7, { bold: true, color: MUTED });
    text(page, value, x, 109, 11.5, { bold: true });
  });

  let top = 146;
  if (has(latest.bmi)) top = bmiBlock(page, theme, Number(latest.bmi), top);
  top = sectionTitle(page, theme, "Medidas e testes", top);
  top = table(page, theme, latest, previous, top);

  const series = [
    ["Peso", "weightKg", "kg"],
    ["Gordura corporal", "bodyFatPercent", "%"],
    ["Cintura", "waistCm", "cm"],
  ]
    .map(([label, key, unit]) => ({
      label,
      unit,
      points: [...ordered]
        .reverse()
        .filter((item) => has(item[key]))
        .slice(-6)
        .map((item) => ({ value: Number(item[key]), label: shortDate(item.assessedAt) })),
    }))
    .filter((item) => item.points.length >= 2);
  const newPage = (title) => {
    pages.push(page);
    page = [];
    header(page, theme, title, String(student?.name || ""), brand);
    return 96;
  };
  if (series.length) {
    if (top + 150 > 790) top = newPage("EVOLUÇÃO");
    top = sectionTitle(page, theme, `Evolução em ${ordered.length} avaliações`, top);
    const gap = 10;
    const width = (RIGHT - LEFT - gap * (series.length - 1)) / series.length;
    series.forEach((item, index) => chart(page, theme, item, LEFT + index * (width + gap), top, Math.min(width, 300)));
    top += 138;
  }
  if (latest.notes) {
    const lines = wrap(latest.notes, 100).slice(0, 30);
    if (top + 34 + lines.length * 13 > 790) top = newPage("OBSERVAÇÕES");
    top = sectionTitle(page, theme, "Observações do personal", top);
    rect(page, LEFT, top - 4, 3, lines.length * 13 + 8, theme.main);
    lines.forEach((line, index) => text(page, line, LEFT + 12, top + index * 13, 9.5));
  }
  pages.push(page);
  pages.forEach((commands, index) => {
    stroke(commands, [[LEFT, 818], [RIGHT, 818]], LINE, 0.8);
    text(commands, `${brand} - ${String(student?.name || "Aluno(a)").slice(0, 50)}`, LEFT, 824, 7, { color: MUTED });
    text(commands, `Página ${index + 1} de ${pages.length}`, RIGHT, 824, 7, { color: MUTED, align: "right" });
    drawWatermark(commands, brand);
  });
  return pdfDocument(pages, []);
}

export function downloadAssessmentPdf(assessments, student, options) {
  if (!assessments?.length) return;
  const blob = new Blob([buildAssessmentPdfBytes(assessments, student, options)], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const slug = String(student?.name || "aluno")
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  link.download = `avaliacao-fisica-${slug || "aluno"}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
}
