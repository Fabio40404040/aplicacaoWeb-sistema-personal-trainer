export const planNames = {
  ready: 'Treinos Prontos',
  basic: 'Consultoria Básica',
  premium: 'Consultoria Premium',
  athlete: 'Performance Atleta',
}

const whatsappNumber = String(import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/gu, '')

export function createWhatsappUrl({ name = '', planCode = '', planName = '', purpose = '' } = {}) {
  const selectedPlan = planName || planNames[planCode] || 'consultoria online'
  const greeting = name ? `Olá, Fábio! Meu nome é ${name}.` : 'Olá, Fábio!'
  const request =
    purpose === 'card'
      ? 'Gostaria de receber o link seguro para pagamento no cartão de crédito.'
      : 'Gostaria de finalizar a contratação.'
  const message = `${greeting} Escolhi o plano ${selectedPlan}. ${request}`
  const destination = whatsappNumber ? `https://wa.me/${whatsappNumber}` : 'https://wa.me/'
  return `${destination}?text=${encodeURIComponent(message)}`
}
