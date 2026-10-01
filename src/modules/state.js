const STORAGE_KEY = 'farisa-coach-data-v1'

const initialData = {
  students: [],
  workouts: [],
  exercises: [
    {
      id: 'e1',
      name: 'Agachamento livre',
      group: 'Pernas',
      equipment: 'Barra',
      instructions: 'Mantenha o tronco firme e os joelhos alinhados.',
    },
    {
      id: 'e2',
      name: 'Supino reto',
      group: 'Peitoral',
      equipment: 'Barra e banco',
      instructions: 'Controle a descida e mantenha as escápulas retraídas.',
    },
    {
      id: 'e3',
      name: 'Remada curvada',
      group: 'Costas',
      equipment: 'Barra',
      instructions: 'Preserve a coluna neutra durante o movimento.',
    },
    {
      id: 'e4',
      name: 'Desenvolvimento militar',
      group: 'Ombros',
      equipment: 'Halteres',
      instructions: 'Evite compensar com a lombar.',
    },
    {
      id: 'e5',
      name: 'Rosca direta',
      group: 'Braços',
      equipment: 'Barra W',
      instructions: 'Mantenha os cotovelos próximos ao corpo.',
    },
  ],
  assessments: [],
  appointments: [],
}

// Dados do painel só na aba aberta (sessionStorage): somem ao fechar ou sair,
// para não deixar dados de alunos (saúde/LGPD) num aparelho compartilhado.
function storage() {
  try {
    localStorage.removeItem(STORAGE_KEY) // versões antigas guardavam aqui
  } catch {
    // ignora
  }
  return sessionStorage
}
const store = storage()

export function clearStoredData() {
  try {
    store.removeItem(STORAGE_KEY)
  } catch {
    // ignora
  }
  data = structuredClone(initialData)
}

function loadData() {
  try {
    return JSON.parse(store.getItem(STORAGE_KEY)) || structuredClone(initialData)
  } catch {
    return structuredClone(initialData)
  }
}

let data = loadData()

export function getData() {
  return data
}

export function updateData(callback) {
  callback(data)
  store.setItem(STORAGE_KEY, JSON.stringify(data))
  window.dispatchEvent(new CustomEvent('farisa:data-changed'))
}

export function replaceData(nextData) {
  data = nextData
  store.setItem(STORAGE_KEY, JSON.stringify(data))
  window.dispatchEvent(new CustomEvent('farisa:data-changed'))
}

export function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}`
}
