import { getData, updateData, createId } from './state.js'

export function initWebTools() {
  const context = document.modelContext
  if (!context?.registerTool) return

  void context.registerTool({
    name: 'list_students',
    title: 'Listar alunos',
    description: 'Lista os alunos visíveis no painel FARISA Personal.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => ({
      students: getData().students.map(({ id, name, goal, status }) => ({
        id,
        name,
        goal,
        status,
      })),
    }),
  })

  void context.registerTool({
    name: 'create_student',
    title: 'Cadastrar aluno',
    description: 'Cadastra um novo aluno no painel FARISA Personal e atualiza a interface.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 3 },
        email: { type: 'string', format: 'email' },
        goal: {
          type: 'string',
          enum: ['Hipertrofia', 'Emagrecimento', 'Condicionamento', 'Força'],
        },
      },
      required: ['name', 'email', 'goal'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: (input) => {
      if (!input || typeof input.name !== 'string' || !input.email?.includes('@'))
        throw new Error('Dados do aluno inválidos.')
      const student = {
        id: createId('s'),
        name: input.name.trim(),
        email: input.email.trim(),
        goal: input.goal,
        status: 'Ativo',
        assessmentDate: '',
        workout: 'Aguardando ficha',
        activity: 'Novo cadastro',
      }
      updateData((data) => data.students.unshift(student))
      return { id: student.id, status: 'created' }
    },
  })
}
