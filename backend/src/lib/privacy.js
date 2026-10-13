// Versão dos Termos de Uso e da Política de Privacidade aceita pelo aluno.
// Ao mudar o texto de um deles, troque esta versão: no próximo acesso cada
// aluno vê de novo a janela de aceite (com as duas caixas).
export const PRIVACY_VERSION = '2026-10'

// Aceite dos dados de saúde (LGPD, art. 11): caixa própria, separada dos Termos.
export const acceptedHealth = (value) => value === true || value === 'on' || value === 'true'
