// Contas de demonstração do portfólio (ver backend/demo/demo-seed.sql).
// Qualquer visitante entra nelas, então algumas ações ficam bloqueadas no
// servidor: recuperar/trocar senha e fazer pagamentos. O envio de arquivos é
// livre; o que a demo enviar é apagado na restauração diária (demo-reset).
export const DEMO_TRAINER_EMAIL = 'demo@farisa.example'
export const DEMO_STUDENT_EMAIL = 'aluno.demo@farisa.example'
export const DEMO_READY_STUDENT_EMAIL = 'aluno.pronto@farisa.example'

const DEMO_EMAILS = new Set([DEMO_TRAINER_EMAIL, DEMO_STUDENT_EMAIL, DEMO_READY_STUDENT_EMAIL])

export function isDemoEmail(email) {
  return DEMO_EMAILS.has(String(email || '').trim().toLowerCase())
}

export const demoBlocked = {
  error: 'Este recurso fica desativado na conta de demonstração.',
  status: 403,
}

// A demonstração é só para olhar: qualquer visitante entra nela pela página
// principal, então nada do que ele fizer é gravado.
export const demoReadOnly = {
  error: 'Demonstração: nada é salvo aqui. Crie sua conta grátis em 1 minuto para fazer isso de verdade.',
  status: 403,
}

