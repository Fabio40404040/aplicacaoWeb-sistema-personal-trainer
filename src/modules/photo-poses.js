// Poses das fotos de evolução: as 6 que os personais mais usam, com um modelo
// desenhado (silhueta) e a explicação, para o aluno conseguir fazer a pose
// sozinho, à distância. O personal pode trocar os nomes e criar outras.

export const DEFAULT_POSES = [
  {
    pose: 'front',
    label: 'Frente',
    model: 'front-relaxed',
    tip: 'De frente para a câmera, pés na largura do quadril, braços soltos e um pouco afastados do corpo.',
  },
  {
    pose: 'side',
    label: 'Lado',
    model: 'side-relaxed',
    tip: 'De lado (lado direito para a câmera), braços soltos ao lado do corpo, olhando para a frente.',
  },
  {
    pose: 'back',
    label: 'Costas',
    model: 'back-relaxed',
    tip: 'De costas para a câmera, na mesma posição da foto de frente.',
  },
  {
    pose: 'front_biceps',
    label: 'Duplo bíceps de frente',
    model: 'front-biceps',
    tip: 'De frente, braços erguidos na altura dos ombros e cotovelos dobrados para cima, contraindo bíceps e abdômen.',
  },
  {
    pose: 'back_biceps',
    label: 'Duplo bíceps de costas',
    model: 'back-biceps',
    tip: 'De costas, mesma pose do duplo bíceps, contraindo costas e braços.',
  },
  {
    pose: 'side_arms',
    label: 'Lado com braços estendidos',
    model: 'side-arms',
    tip: 'De lado, braços esticados para a frente na altura dos ombros, palmas para baixo.',
  },
]

export const PHOTO_TIPS = [
  'Mesmo lugar, mesma luz e de preferência no mesmo horário (de manhã, em jejum).',
  'Câmera na altura do umbigo, a uns 2 a 3 metros, pegando o corpo inteiro.',
  'Roupa de treino justa ou de banho, sempre parecida entre uma avaliação e outra.',
  'Fundo liso e sem contraluz (não fique de costas para a janela).',
  'Peça ajuda a alguém ou use o temporizador do celular.',
]

const isDefault = (pose) => DEFAULT_POSES.some((item) => item.pose === pose)
export const CUSTOM_POSE = /^c_[a-z0-9]{4,16}$/u

// Lista do personal (nomes trocados e poses criadas) por cima das padrão.
export function posesFor(saved) {
  if (!Array.isArray(saved) || !saved.length) return DEFAULT_POSES.map((item) => ({ ...item }))
  return saved
    .filter((item) => isDefault(item.pose) || CUSTOM_POSE.test(String(item.pose || '')))
    .map((item) => {
      const base = DEFAULT_POSES.find((entry) => entry.pose === item.pose)
      return {
        pose: item.pose,
        label: String(item.label || base?.label || 'Pose').slice(0, 40),
        model: base?.model || 'free',
        tip: base?.tip || 'Pose combinada com o seu personal.',
        custom: !base,
      }
    })
}

// ---------- modelos desenhados (silhuetas)
const LIMB = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"'
const line = (points, width) => `<polyline points="${points}" ${LIMB} stroke-width="${width}"/>`

function frontBody({ back = false, arms }) {
  return [
    `<circle cx="50" cy="20" r="11" fill="currentColor"/>`,
    `<rect x="45.5" y="29" width="9" height="9" rx="3" fill="currentColor"/>`,
    `<path d="M32 41 Q50 35 68 41 L62 95 L38 95 Z" fill="currentColor"/>`,
    `<path d="M37.5 92 L62.5 92 L65 113 L35 113 Z" fill="currentColor"/>`,
    line('43.5,110 42,186', 11),
    line('56.5,110 58,186', 11),
    line('42,188 37,190', 5),
    line('58,188 63,190', 5),
    arms === 'biceps'
      ? line('34,45 15,47 17,23', 8.5) + line('66,45 85,47 83,23', 8.5) + `<circle cx="17" cy="21" r="4.5" fill="currentColor"/><circle cx="83" cy="21" r="4.5" fill="currentColor"/>`
      : line('34,45 27,72 25,97', 8.5) + line('66,45 73,72 75,97', 8.5),
    back
      ? `<line x1="50" y1="42" x2="50" y2="90" stroke="var(--pose-detail, #fff)" stroke-opacity=".55" stroke-width="1.6"/><path d="M38 52 Q43 58 46 53 M62 52 Q57 58 54 53" fill="none" stroke="var(--pose-detail, #fff)" stroke-opacity=".45" stroke-width="1.4"/>`
      : `<path d="M44 58 Q50 62 56 58" fill="none" stroke="var(--pose-detail, #fff)" stroke-opacity=".35" stroke-width="1.4"/>`,
  ].join('')
}

function sideBody({ arms }) {
  // O braço fica por cima do tronco: contorno na cor do fundo para aparecer.
  const arm = arms === 'forward' ? '49,47 71,48 93,49' : '49,47 51,72 52,97'
  return [
    `<circle cx="50" cy="20" r="11" fill="currentColor"/>`,
    `<rect x="45" y="29" width="9" height="9" rx="3" fill="currentColor"/>`,
    `<path d="M39 41 Q57 37 61 50 Q60 72 57 95 L42 95 Q36 70 39 41 Z" fill="currentColor"/>`,
    `<path d="M41.5 92 L57.5 92 L59 113 L40.5 113 Z" fill="currentColor"/>`,
    line('50,110 50,186', 14),
    line('50,188 60,190', 5.5),
    `<polyline points="${arm}" fill="none" stroke="var(--pose-detail, #fff)" stroke-opacity=".7" stroke-linecap="round" stroke-linejoin="round" stroke-width="11.5"/>`,
    line(arm, 8.5),
  ].join('')
}

const MODELS = {
  'front-relaxed': () => frontBody({ arms: 'relaxed' }),
  'back-relaxed': () => frontBody({ back: true, arms: 'relaxed' }),
  'front-biceps': () => frontBody({ arms: 'biceps' }),
  'back-biceps': () => frontBody({ back: true, arms: 'biceps' }),
  'side-relaxed': () => sideBody({ arms: 'relaxed' }),
  'side-arms': () => sideBody({ arms: 'forward' }),
  free: () => frontBody({ arms: 'relaxed' }),
}

// Silhueta da pose (SVG). Fica na cor do texto em volta.
export function poseModel(model, label = '') {
  const holder = document.createElement('span')
  holder.className = `pose-model${model === 'free' ? ' is-free' : ''}`
  holder.innerHTML = `<svg viewBox="0 0 100 200" role="img" aria-label="Modelo da pose: ${String(label).replace(/[<>"&]/gu, '')}">${(MODELS[model] || MODELS.free)()}</svg>`
  return holder
}
