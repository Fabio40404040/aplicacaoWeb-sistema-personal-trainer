const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const COLORS = {
  blue: "0.035 0.302 0.796",
  blueDark: "0.027 0.145 0.357",
  cyan: "0.055 0.690 0.824",
  cyanSoft: "0.855 0.961 0.976",
  ink: "0.039 0.098 0.196",
  muted: "0.380 0.447 0.553",
  line: "0.745 0.788 0.847",
  panel: "0.941 0.953 0.969",
  white: "1 1 1",
};
const THEMES = {
  blue: {
    blue: "0.035 0.302 0.796",
    blueDark: "0.027 0.145 0.357",
    cyan: "0.055 0.690 0.824",
  },
  red: {
    blue: "0.780 0.020 0.020",
    blueDark: "0.180 0.180 0.180",
    cyan: "0.925 0.180 0.180",
  },
  green: {
    blue: "0.020 0.500 0.280",
    blueDark: "0.020 0.250 0.160",
    cyan: "0.120 0.700 0.450",
  },
  black: {
    blue: "0.100 0.100 0.100",
    blueDark: "0.025 0.025 0.025",
    cyan: "0.400 0.400 0.400",
  },
};

function ascii(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\x20-\x7E]/gu, "");
}

function escapePdf(value) {
  return ascii(value).replace(/([\\()])/gu, "\\$1");
}

// URLs nao levam acento, entao so precisa escapar barra invertida/parenteses
// (sem passar por ascii(), que tambem mudaria caracteres que nao aparecem
// numa URL mesmo).
function escapeUri(value) {
  return String(value || "").replace(/([\\()])/gu, "\\$1");
}

// Base do link publico do GIF, embutido no PDF baixado. O PDF pode ser
// reaberto em qualquer dispositivo, sem o app carregado, entao o link tem
// que ser absoluto. window.location.origin cobre tanto o domínio de
// produção quanto o localhost do dev (com o proxy /api do Vite).
function publicOrigin() {
  return typeof window !== "undefined" && window.location
    ? window.location.origin
    : "";
}

function truncate(value, length) {
  const content = ascii(value).trim();
  return content.length > length
    ? `${content.slice(0, Math.max(1, length - 3))}...`
    : content;
}

// Marca do personal: vai na marca d'água, no cabeçalho e no rodapé de todas
// as páginas. No SaaS, cada personal terá a própria marca (workout.brandName).
const DEFAULT_BRAND = "FARISA PERSONAL";
const brandOf = (workout) =>
  ascii(workout?.brandName || DEFAULT_BRAND).trim().toUpperCase() || DEFAULT_BRAND;

// Aceita só o nome (texto) ou { name, email }.
function studentInfo(student) {
  if (student && typeof student === "object")
    return {
      name: String(student.name || "Aluno(a)"),
      email: String(student.email || ""),
    };
  return { name: String(student || "Aluno(a)"), email: "" };
}

// Em vez de cortar o nome do aluno com "...", diminui a fonte quando o nome
// é mais comprido do que o espaço reservado — assim o nome completo sempre
// aparece por inteiro na ficha.
function fitText(value, maxChars, baseSize, minSize = 8) {
  const content = ascii(value).trim();
  if (!content) return { text: "", size: baseSize };
  const ratio = content.length / maxChars;
  const size = ratio > 1 ? Math.max(minSize, baseSize / ratio) : baseSize;
  return { text: content, size };
}

// Estimativa simples da largura do texto (Helvetica bold ~0.62 do corpo da
// fonte por caractere) pra centralizar um rótulo num ponto x, em vez de um
// x fixo que fica torto dependendo do tamanho do texto.
function centeredX(value, size, targetCenterX, factor = 0.62) {
  const width = ascii(value).length * size * factor;
  return targetCenterX - width / 2;
}

function text(commands, value, x, top, size = 10, options = {}) {
  const font = options.bold ? "F2" : "F1";
  const color = options.color || COLORS.ink;
  commands.push(
    `BT ${color} rg /${font} ${size} Tf ${x} ${PAGE_HEIGHT - top - size} Td (${escapePdf(value)}) Tj ET`,
  );
}

function rect(
  commands,
  x,
  top,
  width,
  height,
  fill,
  stroke = null,
  lineWidth = 1,
) {
  const y = PAGE_HEIGHT - top - height;
  const paint = stroke ? "B" : "f";
  commands.push(
    `${lineWidth} w ${fill} rg ${stroke || fill} RG ${x} ${y} ${width} ${height} re ${paint}`,
  );
}

function line(commands, x1, top1, x2, top2, color = COLORS.line, width = 1) {
  commands.push(
    `${width} w ${color} RG ${x1} ${PAGE_HEIGHT - top1} m ${x2} ${PAGE_HEIGHT - top2} l S`,
  );
}

function circle(commands, x, top, radius, fill, stroke = null) {
  const y = PAGE_HEIGHT - top;
  const k = radius * 0.55228475;
  commands.push(
    `${fill} rg ${stroke || fill} RG ${x + radius} ${y} m ` +
      `${x + radius} ${y + k} ${x + k} ${y + radius} ${x} ${y + radius} c ` +
      `${x - k} ${y + radius} ${x - radius} ${y + k} ${x - radius} ${y} c ` +
      `${x - radius} ${y - k} ${x - k} ${y - radius} ${x} ${y - radius} c ` +
      `${x + k} ${y - radius} ${x + radius} ${y - k} ${x + radius} ${y} c B`,
  );
}

// Imagens embutidas nesta geracao (um quadro parado de cada GIF usado).
let pdfImages = [];

// Le largura/altura direto do cabecalho do JPEG, sem precisar decodificar.
export function jpegSize(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        components: bytes[offset + 9],
      };
    }
    offset += 2 + length;
  }
  return null;
}

function registerImage(frameBytes) {
  if (!frameBytes || !frameBytes.length) return null;
  const existing = pdfImages.find((image) => image.bytes === frameBytes);
  if (existing) return existing;
  const size = jpegSize(frameBytes);
  if (!size || !size.width || !size.height) return null;
  const image = {
    name: `Im${pdfImages.length + 1}`,
    bytes: frameBytes,
    width: size.width,
    height: size.height,
    gray: size.components === 1,
  };
  pdfImages.push(image);
  return image;
}

function drawImage(commands, image, x, top, width, height) {
  const y = PAGE_HEIGHT - top - height;
  commands.push(
    `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${image.name} Do Q`,
  );
}

// Area clicavel do PDF: fica registrada no comando da pagina e vira uma
// anotacao /Link de verdade na hora de montar o arquivo (em pdfDocument).
function addLink(commands, x, top, width, height, uri) {
  if (!commands.links) commands.links = [];
  commands.links.push({ x, top, width, height, uri });
}

// Selo "GIF" em cima da imagem: o PDF continua estatico (nao anima), mas o
// clique abre o GIF de verdade, em movimento, direto da biblioteca — sem
// precisar do app aberto. A area clicavel cobre a imagem inteira, nao só o
// selo.
function drawGifLinkBadge(commands, x, top, uri) {
  const badgeWidth = 52;
  const badgeHeight = 17;
  const badgeX = x + 142 - badgeWidth - 4;
  const badgeTop = top + 104 - badgeHeight - 4;
  rect(commands, badgeX, badgeTop, badgeWidth, badgeHeight, COLORS.blue);
  // O "top" que text() recebe fica `size` pontos ACIMA da linha de base do
  // texto (ela calcula baseline = top + size). +4 aqui deixa a linha de
  // base perto do meio do selo, com folga em cima e embaixo — antes estava
  // grande demais e a base do texto caía fora da caixinha.
  text(commands, "> GIF", badgeX + 7, badgeTop + 4, 8, {
    bold: true,
    color: COLORS.white,
  });
  addLink(commands, x, top, 142, 104, uri);
}

function drawExerciseFigure(commands, x, top, number, frameBytes, gifLinkUri) {
  rect(commands, x, top, 142, 104, COLORS.white);
  const image = registerImage(frameBytes);
  if (image) {
    // O GIF entra aqui como quadro parado, encaixado sem distorcer:
    // PDF nao aceita imagem animada.
    const boxWidth = 138;
    const boxHeight = 100;
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    drawImage(
      commands,
      image,
      x + 2 + (boxWidth - width) / 2,
      top + 2 + (boxHeight - height) / 2,
      width,
      height,
    );
    if (gifLinkUri) drawGifLinkBadge(commands, x, top, gifLinkUri);
    return;
  }
  if (gifLinkUri) drawGifLinkBadge(commands, x, top, gifLinkUri);
  circle(commands, x + 70, top + 27, 9, COLORS.cyanSoft, COLORS.cyan);
  line(commands, x + 70, top + 36, x + 70, top + 67, COLORS.blueDark, 4);
  line(commands, x + 70, top + 44, x + 45, top + 57, COLORS.blueDark, 4);
  line(commands, x + 70, top + 44, x + 95, top + 57, COLORS.blueDark, 4);
  line(commands, x + 70, top + 67, x + 51, top + 89, COLORS.blueDark, 4);
  line(commands, x + 70, top + 67, x + 89, top + 89, COLORS.blueDark, 4);
  line(commands, x + 35, top + 57, x + 105, top + 57, COLORS.cyan, 3);
  line(commands, x + 34, top + 49, x + 34, top + 65, COLORS.blue, 5);
  line(commands, x + 106, top + 49, x + 106, top + 65, COLORS.blue, 5);
  text(
    commands,
    `EXERCICIO ${String(number).padStart(2, "0")}`,
    x + 8,
    top + 88,
    7,
    {
      bold: true,
      color: COLORS.muted,
    },
  );
}

function drawHeader(commands, workout, student, continuation = false) {
  const { name: studentName, email: studentEmail } = student;
  rect(commands, 25, 20, 545, 52, COLORS.blue);
  const titleFit = fitText(
    continuation ? "FICHA DE TREINO (CONT.)" : "FICHA DE TREINO",
    24,
    22,
    14,
  );
  text(commands, titleFit.text, 42, 31, titleFit.size, {
    bold: true,
    color: COLORS.white,
  });
  const headerBrand = fitText(brandOf(workout), 24, 9, 6);
  text(commands, headerBrand.text, 414, 37, headerBrand.size, {
    bold: true,
    color: COLORS.white,
  });
  rect(commands, 25, 80, 545, 54, COLORS.panel, COLORS.line);
  text(commands, "ALUNO", 39, 92, 7, { bold: true, color: COLORS.muted });
  // Orçamento de caracteres calibrado para o espaço real até a coluna
  // PROGRAMA (x=255), pra nomes compridos nunca mais invadirem o campo
  // vizinho.
  const alunoFit = fitText(studentName, 22, 12, 7);
  text(commands, alunoFit.text, 39, 103, alunoFit.size, { bold: true });
  if (studentEmail) {
    const emailFit = fitText(studentEmail, 40, 7.5, 5.5);
    text(commands, emailFit.text, 39, 119, emailFit.size, { color: COLORS.muted });
  }
  text(commands, "PROGRAMA", 255, 92, 7, { bold: true, color: COLORS.muted });
  const programFit = fitText(workout.name, 27, 11, 8);
  text(commands, programFit.text, 255, 105, programFit.size, { bold: true });
  text(commands, "OBJETIVO / DURACAO", 430, 92, 7, {
    bold: true,
    color: COLORS.muted,
  });
  text(commands, truncate(workout.goal || "Treinamento", 20), 430, 104, 9, {
    bold: true,
  });
  text(commands, truncate(workout.duration || "A definir", 20), 430, 117, 8, {
    color: COLORS.muted,
  });
  return 146;
}

function drawCover(workout, student) {
  const { name: studentName, email: studentEmail } = student;
  const commands = [];
  rect(commands, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, COLORS.ink);
  rect(commands, 25, 25, 545, 7, COLORS.cyan);
  text(commands, "FARISA PERSONAL TRAINER", 42, 58, 12, {
    bold: true,
    color: COLORS.cyan,
  });
  text(
    commands,
    workout.sitePreview
      ? "PREVIA - TREINO PRONTO"
      : workout.readyProgram
        ? "TREINO PRONTO"
        : "FICHA PERSONALIZADA",
    42,
    102,
    15,
    {
      bold: true,
      color: COLORS.white,
    },
  );
  text(commands, truncate(workout.name, 26).toUpperCase(), 42, 145, 31, {
    bold: true,
    color: COLORS.white,
  });
  rect(commands, 42, 213, 511, 3, COLORS.blue);
  text(commands, workout.goal || "Treinamento", 42, 240, 18, {
    bold: true,
    color: COLORS.cyan,
  });
  text(
    commands,
    `${workout.duration || "Duracao definida"} · Programa completo`,
    42,
    271,
    12,
    {
      color: COLORS.white,
    },
  );
  text(
    commands,
    workout.readyProgram ? "ACESSO PERMANENTE" : "ALUNO",
    42,
    590,
    9,
    {
      bold: true,
      color: COLORS.cyan,
    },
  );
  const coverNameFit = fitText(studentName.toUpperCase(), 44, 22, 12);
  text(commands, coverNameFit.text, 42, 614, coverNameFit.size, {
    bold: true,
    color: COLORS.white,
  });
  if (studentEmail)
    text(commands, truncate(studentEmail, 70), 42, 642, 10, { color: COLORS.cyan });
  text(commands, "Treinamento com orientação profissional", 42, 668, 11, {
    color: COLORS.line,
  });
  rect(commands, 42, 738, 82, 52, COLORS.blue);
  text(commands, "FARISA", 57, 755, 14, { bold: true, color: COLORS.white });
  text(commands, "PERSONAL TRAINER", 142, 752, 14, {
    bold: true,
    color: COLORS.white,
  });
  text(commands, "Ficha de treino gerada pelo sistema FARISA", 142, 774, 8, {
    color: COLORS.line,
  });
  return commands;
}

function drawGroupHeader(commands, group, top) {
  rect(commands, 25, top, 545, 28, COLORS.blueDark);
  rect(commands, 25, top, 10, 28, COLORS.cyan);
  text(commands, ascii(group || "OUTROS").toUpperCase(), 45, top + 7, 13, {
    bold: true,
    color: COLORS.white,
  });
}

function drawExerciseCard(commands, exercise, top, number) {
  rect(commands, 25, top, 545, 128, COLORS.panel, COLORS.ink, 1.2);
  rect(commands, 25, top, 27, 128, COLORS.cyan);
  text(commands, String(number).padStart(2, "0"), 31, top + 54, 11, {
    bold: true,
    color: COLORS.white,
  });
  const gifLinkUri = exercise.gifId
    ? // Abre uma página com o GIF e um botão Fechar (no iPhone o .gif puro
      // abria em tela cheia sem ter como sair).
      `${publicOrigin()}/api/public/exercise-gifs/${exercise.gifId}/ver`
    : null;
  drawExerciseFigure(
    commands,
    59,
    top + 12,
    number,
    exercise.gifFrame,
    gifLinkUri,
  );
  const infoX = 214;
  text(
    commands,
    truncate(exercise.name, 38).toUpperCase(),
    infoX,
    top + 12,
    13,
    {
      bold: true,
      color: COLORS.blueDark,
    },
  );
  text(
    commands,
    truncate(
      `${exercise.equipment || "Livre"} - ${exercise.difficulty || "Intermediario"}`,
      50,
    ),
    infoX,
    top + 31,
    8,
    { color: COLORS.muted },
  );
  // Com carga anotada, as tres linhas ficam mais baixas para caber no cartao.
  const load = truncate(exercise.load, 14);
  const rowHeight = load ? 19 : 27;
  const rows = [
    ["SERIES", String(exercise.sets || 3), COLORS.cyan],
    ["REPETICOES", truncate(exercise.repetitions || "10-12", 9), COLORS.blue],
  ];
  if (load) rows.push(["CARGA", load, COLORS.blueDark]);
  rows.forEach(([label, value, fill], row) => {
    const rowTop = top + (load ? 45 : 48) + row * (rowHeight + (load ? 2 : 5));
    const pad = (rowHeight - 10) / 2;
    rect(commands, infoX, rowTop, 134, rowHeight, COLORS.white);
    text(commands, label, infoX + 10, rowTop + pad, 10, { bold: true });
    rect(commands, infoX + 140, rowTop, 64, rowHeight, fill);
    const fit = fitText(value, 9, 11, 6.5);
    text(commands, fit.text, centeredX(fit.text, fit.size, infoX + 172, 0.56), rowTop + (rowHeight - fit.size) / 2 - 1, fit.size, {
      bold: true,
      color: COLORS.white,
    });
  });
  circle(commands, 520, top + 76, 31, COLORS.white, COLORS.ink);
  text(commands, "INTERVALO", centeredX("INTERVALO", 7, 520), top + 55, 7, {
    bold: true,
  });
  const restLabel = `${Number(exercise.restSeconds) || 0}s`;
  text(commands, restLabel, centeredX(restLabel, 12, 520), top + 70, 12, {
    bold: true,
  });
  const note = exercise.notes || exercise.instructions;
  if (note)
    text(commands, truncate(note, 73), infoX, top + 113, 7, {
      color: COLORS.muted,
    });
}

function normalizedExercises(workout) {
  const exercises = Array.isArray(workout.exercises)
    ? workout.exercises
    : Array.isArray(workout.exercisePrescriptions)
      ? workout.exercisePrescriptions
      : [];
  return exercises
    .map((exercise, index) => ({
      ...exercise,
      name: exercise.name || `Exercicio ${index + 1}`,
      group: exercise.group || "Outros",
      sessionLabel: String(exercise.sessionLabel || "A").toUpperCase(),
      originalPosition: Number(exercise.position) || index,
    }))
    .sort(
      (a, b) =>
        a.sessionLabel.localeCompare(b.sessionLabel) ||
        a.originalPosition - b.originalPosition,
    );
}

function buildPages(workout, studentInput) {
  const student = studentInfo(studentInput);
  const pages = [drawCover(workout, student)];
  let commands = [];
  let top = drawHeader(commands, workout, student);
  let previousSession = "";
  const exercises = normalizedExercises(workout);
  if (!exercises.length) {
    rect(commands, 25, top, 545, 86, COLORS.panel, COLORS.line);
    text(commands, "NENHUM EXERCICIO ADICIONADO", 45, top + 22, 14, {
      bold: true,
      color: COLORS.blueDark,
    });
    text(
      commands,
      "Edite esta ficha no painel e selecione os exercicios da biblioteca.",
      45,
      top + 49,
      10,
      { color: COLORS.muted },
    );
  }
  exercises.forEach((exercise, index) => {
    const newSession = exercise.sessionLabel !== previousSession;
    const needed = (newSession ? 36 : 0) + 136;
    if (top + needed > 803) {
      pages.push(commands);
      commands = [];
      top = drawHeader(commands, workout, student, true);
      previousSession = "";
    }
    if (exercise.sessionLabel !== previousSession) {
      const sessionItems = exercises.filter(
        (item) => item.sessionLabel === exercise.sessionLabel,
      );
      const groups = [...new Set(sessionItems.map((item) => item.group))].join(
        " / ",
      );
      drawGroupHeader(
        commands,
        `TREINO ${exercise.sessionLabel} - ${groups}`,
        top,
      );
      top += 36;
      previousSession = exercise.sessionLabel;
    }
    drawExerciseCard(commands, exercise, top, index + 1);
    top += 136;
  });
  pages.push(commands);
  const brand = brandOf(workout);
  const footerName = ascii(student.name).trim() || "Aluno(a)";
  const footerText = truncate(
    `${brand} - Aluno(a): ${footerName}${student.email ? ` - ${student.email}` : ""}`,
    110,
  );
  pages.forEach((page, index) => {
    line(page, 25, 818, 570, 818);
    text(page, footerText, 25, 824, 7, { color: COLORS.muted });
    text(page, `Pagina ${index + 1} de ${pages.length}`, 515, 824, 7, {
      color: COLORS.muted,
    });
    drawWatermark(page, workout.sitePreview ? `PREVIA - ${brand}` : brand);
  });
  return pages;
}

// Marca d'água "FARISA-PERSONAL" em textura pequena e bem sutil, repetida em
// grade por cima de tudo (transparência real via ExtGState /GS1). Usar
// muitos carimbos pequenos e bem apagados, em vez de poucos grandes,
// evita que um deles caia bem em cima de um número/círculo e "estrague"
// visualmente aquele ponto específico — o efeito fica uniforme na página
// inteira. Evita a faixa do cabeçalho (título, nome, programa) e do
// rodapé, pra nunca cruzar com esse texto fino.
function drawWatermark(commands, text = DEFAULT_BRAND) {
  const label = escapePdf(text);
  const angle = (30 * Math.PI) / 180;
  const cos = Math.cos(angle).toFixed(4);
  const sin = Math.sin(angle).toFixed(4);
  const cols = [40, 210, 380, 550];
  const rows = [60, 190, 320, 450, 580];
  commands.push("q /GS1 gs 0.5 0.5 0.5 rg");
  rows.forEach((y, rowIndex) => {
    const offsetX = rowIndex % 2 === 0 ? 0 : 95;
    cols.forEach((x) => {
      commands.push(
        `BT /F2 12 Tf ${cos} ${sin} ${-sin} ${cos} ${x + offsetX} ${y} Tm (${label}) Tj ET`,
      );
    });
  });
  commands.push("Q");
}

function pdfDocument(pages, images) {
  const encoder = new TextEncoder();
  const objects = [];
  const pageIds = pages.map((_, index) => 3 + index * 2);
  const regularFontId = 3 + pages.length * 2;
  const boldFontId = regularFontId + 1;
  const watermarkGsId = boldFontId + 1;
  const imageIds = images.map((_, index) => watermarkGsId + 1 + index);
  const xobjects = images.length
    ? ` /XObject << ${images
        .map((image, index) => `/${image.name} ${imageIds[index]} 0 R`)
        .join(" ")} >>`
    : "";
  // Cada selo "GIF" vira uma anotacao /Link (id proprio), alocada depois das
  // imagens. IDs contiguos em toda a sequencia, senao a tabela xref no final
  // do arquivo fica com buraco e o PDF nao abre.
  let nextAnnotId = watermarkGsId + 1 + images.length;
  const pageAnnotIds = pages.map(
    (pageCommands) => (pageCommands.links || []).map(() => nextAnnotId++),
  );
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((pageCommands, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const commands = encoder.encode(pageCommands.join("\n"));
    const links = pageCommands.links || [];
    const annotIds = pageAnnotIds[index];
    const annotsField = annotIds.length
      ? ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(" ")}]`
      : "";
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> /ExtGState << /GS1 ${watermarkGsId} 0 R >>${xobjects} >> /Contents ${contentId} 0 R${annotsField} >>`;
    objects[contentId] = {
      dict: `<< /Length ${commands.length} >>`,
      data: commands,
    };
    links.forEach((link, linkIndex) => {
      const annotId = annotIds[linkIndex];
      const llx = link.x;
      const lly = PAGE_HEIGHT - link.top - link.height;
      const urx = link.x + link.width;
      const ury = PAGE_HEIGHT - link.top;
      objects[annotId] =
        `<< /Type /Annot /Subtype /Link /Rect [${llx.toFixed(2)} ${lly.toFixed(2)} ${urx.toFixed(2)} ${ury.toFixed(2)}] /Border [0 0 0] /A << /Type /Action /S /URI /URI (${escapeUri(link.uri)}) >> >>`;
    });
  });
  objects[regularFontId] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[boldFontId] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[watermarkGsId] = "<< /Type /ExtGState /ca 0.09 /CA 0.09 >>";
  images.forEach((image, index) => {
    objects[imageIds[index]] = {
      dict: `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${image.gray ? "/DeviceGray" : "/DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>`,
      data: image.bytes,
    };
  });

  // O arquivo e montado em pedacos de bytes: os JPEG nao sobrevivem se o
  // documento for tratado como texto.
  const chunks = [];
  let size = 0;
  const push = (value) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    size += bytes.length;
  };
  push("%PDF-1.4\n");
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = size;
    const object = objects[id];
    if (typeof object === "string") {
      push(`${id} 0 obj\n${object}\nendobj\n`);
    } else {
      push(`${id} 0 obj\n${object.dict}\nstream\n`);
      push(object.data);
      push("\nendstream\nendobj\n");
    }
  }
  const xref = size;
  push(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < objects.length; id += 1)
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  );
  const output = new Uint8Array(size);
  let at = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, at);
    at += chunk.length;
  });
  return output;
}

export function buildWorkoutPdfBytes(workout, studentName) {
  const original = {
    blue: COLORS.blue,
    blueDark: COLORS.blueDark,
    cyan: COLORS.cyan,
  };
  Object.assign(COLORS, THEMES[workout.colorTheme] || THEMES.blue);
  pdfImages = [];
  try {
    const pages = buildPages(workout, studentName);
    return pdfDocument(pages, pdfImages);
  } finally {
    pdfImages = [];
    Object.assign(COLORS, original);
  }
}

// Busca o quadro parado de cada GIF usado na ficha. Se algum falhar, aquele
// exercicio volta a mostrar o bonequinho desenhado.
async function withGifFrames(workout, loadFrame) {
  const exercises = Array.isArray(workout.exercises)
    ? workout.exercises
    : Array.isArray(workout.exercisePrescriptions)
      ? workout.exercisePrescriptions
      : [];
  const ids = [...new Set(exercises.map((item) => item?.gifId).filter(Boolean))];
  if (!loadFrame || !ids.length) return workout;
  const frames = new Map();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const bytes = await loadFrame(id);
        if (bytes && bytes.length) frames.set(id, bytes);
      } catch {
        /* sem quadro: fica o bonequinho */
      }
    }),
  );
  if (!frames.size) return workout;
  const withFrames = exercises.map((item) =>
    item?.gifId && frames.has(item.gifId)
      ? { ...item, gifFrame: frames.get(item.gifId) }
      : item,
  );
  return Array.isArray(workout.exercises)
    ? { ...workout, exercises: withFrames }
    : { ...workout, exercisePrescriptions: withFrames };
}

export async function downloadWorkoutPdf(workout, studentName, loadFrame) {
  const prepared = await withGifFrames(workout, loadFrame);
  const blob = new Blob([buildWorkoutPdfBytes(prepared, studentName)], {
    type: "application/pdf",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${
    ascii(`${studentInfo(studentName).name}-${workout.name}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-") || "ficha-treino"
  }.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
}

// Mostra a ficha num visualizador embutido na própria página, sem oferecer
// o botão de salvar/baixar do navegador (o "toolbar=0" remove o ícone de
// download do leitor de PDF nativo do Chrome/Edge). Isso não impede 100% a
// cópia — um usuário decidido sempre consegue tirar print ou usar "imprimir
// em PDF" do sistema — mas tira o "baixar com um clique" da tela do aluno.
export function previewWorkoutPdf(workout, studentName) {
  const blob = new Blob([buildWorkoutPdfBytes(workout, studentName)], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const dialog = document.createElement("dialog");
  dialog.className = "workout-pdf-preview";
  Object.assign(dialog.style, {
    width: "min(880px, 96vw)",
    height: "min(90vh, 1000px)",
    padding: "0",
    border: "none",
    borderRadius: "12px",
    overflow: "hidden",
  });
  dialog.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <header style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #e2e2e2;">
        <strong>Ficha de treino</strong>
        <button type="button" class="icon-button" data-close-pdf-preview aria-label="Fechar">×</button>
      </header>
      <iframe src="${url}#toolbar=0&navpanes=0" style="flex:1;border:0;" title="Ficha de treino em PDF"></iframe>
    </div>
  `;
  document.body.append(dialog);
  const cleanup = () => {
    URL.revokeObjectURL(url);
    dialog.remove();
  };
  dialog.addEventListener("close", cleanup);
  dialog
    .querySelector("[data-close-pdf-preview]")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.showModal();
}

// Abre o PDF numa aba nova. A aba é aberta já no clique (antes de montar o
// arquivo) para o navegador não bloquear como pop-up.
export async function openWorkoutPdfInTab(workout, studentName, openedTab = null, loadFrame = null) {
  const prepared = await withGifFrames(workout, loadFrame);
  const blob = new Blob([buildWorkoutPdfBytes(prepared, studentName)], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  if (openedTab && !openedTab.closed) openedTab.location.href = url;
  else window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
