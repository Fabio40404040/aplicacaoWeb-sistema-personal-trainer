export const planNames = {
  ready: 'Treinos Prontos',
  basic: 'Consultoria Básica',
  premium: 'Consultoria Premium',
  athlete: 'Performance Atleta',
}

let whatsappNumber = String(import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/gu, '')
let brandLabel = 'FARISA'

// Página de um personal (Meu site): usa o WhatsApp e a marca dele.
export function setWhatsappContact({ number, brand } = {}) {
  if (number) whatsappNumber = String(number).replace(/\D/gu, '')
  if (brand) brandLabel = brand
  initWhatsappFloat()
}

export function createWhatsappUrl({ name = '', planCode = '', planName = '', purpose = '' } = {}) {
  const selectedPlan = planName || planNames[planCode] || 'consultoria online'
  const greeting = name ? `Olá! Meu nome é ${name}.` : 'Olá!'
  const request =
    purpose === 'card'
      ? 'Gostaria de receber o link seguro para pagamento no cartão de crédito.'
      : 'Gostaria de finalizar a contratação.'
  const message = `${greeting} Escolhi o plano ${selectedPlan}. ${request}`
  const destination = whatsappNumber ? `https://wa.me/${whatsappNumber}` : 'https://wa.me/'
  return `${destination}?text=${encodeURIComponent(message)}`
}

// Aluno logado falando com o personal dele. Sem WhatsApp cadastrado: ''.
export function createStudentWhatsappUrl(name = '') {
  if (!whatsappNumber) return ''
  const message = `Olá! Sou ${name || 'seu aluno'} e estou falando pela área do aluno ${brandLabel}.`
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
}

export function createGeneralWhatsappUrl() {
  const message = `Olá! Vim pelo site ${brandLabel} e gostaria de tirar algumas dúvidas.`
  const destination = whatsappNumber ? `https://wa.me/${whatsappNumber}` : 'https://wa.me/'
  return `${destination}?text=${encodeURIComponent(message)}`
}

// WhatsApp da plataforma FARISA (site principal). As páginas dos personais
// usam o número de cada um (setWhatsappContact).
export const PLATFORM_WHATSAPP = '5588988421103'
export const platformWhatsappUrl = () =>
  `https://wa.me/${PLATFORM_WHATSAPP}?text=${encodeURIComponent('Olá! Sou personal e quero saber mais sobre a FARISA.')}`

// Botão flutuante do WhatsApp no site público.
export function initWhatsappFloat() {
  const platform = document.documentElement.dataset.home === 'saas'
  document.querySelectorAll('[data-whatsapp-float]').forEach((link) => {
    link.href = platform ? platformWhatsappUrl() : createGeneralWhatsappUrl()
  })
}
