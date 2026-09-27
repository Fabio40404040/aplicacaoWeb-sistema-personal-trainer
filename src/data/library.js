// Biblioteca de conteúdo da FARISA Personal.
//
// COMO ADICIONAR UM VÍDEO MP4
// 1. Coloque o arquivo na pasta do grupo em: public/library/exercises/videos/
// 2. Copie um objeto de exerciseVideoLibrary e altere os dados.
// 3. Use published: true para exibir o vídeo aos alunos com acesso ativo.
//
// Use caminhos iniciados por /library/. Não coloque arquivos grandes dentro de src/.

// leg: true = o grupo entra dentro da pasta "Pernas" nas bibliotecas e no
// montador de treino. Ao criar um grupo novo de perna (ex.: Adutor máximo),
// marque leg: true, senão ele vira uma pasta separada.
export const muscleGroups = [
  { id: 'peitoral', name: 'Peitoral' },
  { id: 'costas', name: 'Costas' },
  { id: 'ombros', name: 'Ombros' },
  { id: 'biceps', name: 'Bíceps' },
  { id: 'triceps', name: 'Tríceps' },
  { id: 'antebracos', name: 'Antebraços' },
  { id: 'abdomen', name: 'Abdômen' },
  { id: 'gluteos', name: 'Glúteos', leg: true },
  { id: 'quadriceps', name: 'Quadríceps', leg: true },
  { id: 'posteriores', name: 'Posteriores de coxa', leg: true },
  { id: 'adultor', name: 'Adultor Maximo', leg: true },
  { id: 'panturrilhas', name: 'Panturrilhas', leg: true },
  { id: 'cardio', name: 'Cardio e condicionamento' },
]

// Nomes dos grupos que ficam dentro da pasta "Pernas".
export const legGroupNames = muscleGroups.filter((group) => group.leg).map((group) => group.name)

export const exerciseVideoLibrary = [
  // MODELO PARA COPIAR:
  // {
  //   id: 'supino-reto-barra',
  //   name: 'Supino reto com barra',
  //   group: 'Peitoral',
  //   equipment: 'Barra e banco',
  //   difficulty: 'Intermediário',
  //   videoUrl: '/library/exercises/videos/peitoral/supino-reto-barra.mp4',
  //   posterUrl: '',
  //   instructions: 'Mantenha as escápulas retraídas e controle a descida.',
  //   published: true,
  // },
]

export function publishedExerciseVideos() {
  return exerciseVideoLibrary.filter((item) => item.published)
}

export function videosByMuscleGroup(items = publishedExerciseVideos()) {
  return muscleGroups.map((group) => ({
    ...group,
    exercises: items.filter((item) => item.group === group.name),
  }))
}

export function findExerciseVideo(exercise) {
  const id = String(exercise?.libraryId || exercise?.id || '').toLocaleLowerCase('pt-BR')
  const name = String(exercise?.name || '').trim().toLocaleLowerCase('pt-BR')
  return exerciseVideoLibrary.find(
    (item) =>
      item.published &&
      (item.id.toLocaleLowerCase('pt-BR') === id ||
        item.name.trim().toLocaleLowerCase('pt-BR') === name),
  )
}
