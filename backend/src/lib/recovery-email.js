export function hasRecoveryEmailProvider(env) {
  return Boolean(
    (env.BREVO_API_KEY && (env.EMAIL_FROM || env.BREVO_FROM_EMAIL)) || env.PASSWORD_MAILER,
  )
}

// Versão em texto simples do e-mail (Outlook e Gmail confiam mais em e-mails
// que trazem as duas versões, HTML e texto).
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/giu, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu, (_, href, label) => {
      const text = label.replace(/<[^>]+>/gu, '').trim()
      return text && text !== href ? `${text}: ${href}` : href
    })
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|main|section)>/giu, '\n\n')
    .replace(/<li[^>]*>/giu, '• ')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

const replyTo = (env, fromEmail) => ({ replyTo: { email: env.BREVO_REPLY_TO || fromEmail } })

export async function sendRecoveryEmail(env, message, idempotencyKey) {
  const fromEmail = env.EMAIL_FROM || env.BREVO_FROM_EMAIL
  if (env.BREVO_API_KEY && fromEmail) {
    return fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: env.BREVO_FROM_NAME || 'FARISA Personal Trainer',
          email: fromEmail,
        },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: htmlToText(message.html),
        tags: ['password-reset'],
        headers: { 'X-FARISA-Reset-ID': idempotencyKey },
        ...replyTo(env, fromEmail),
      }),
    })
  }
  if (env.PASSWORD_MAILER)
    return env.PASSWORD_MAILER.fetch('https://mailer.internal/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
  return null
}

// Nomes (nunca valores) das configurações que faltam para enviar e-mails.
export function missingEmailConfig(env, siteUrl) {
  const missing = []
  if (!env.BREVO_API_KEY && !env.PASSWORD_MAILER) missing.push('BREVO_API_KEY')
  if (env.BREVO_API_KEY && !env.EMAIL_FROM && !env.BREVO_FROM_EMAIL) missing.push('EMAIL_FROM')
  if (!siteUrl) missing.push('PUBLIC_SITE_URL')
  return missing
}

// Avisos gerais (ex.: agenda). Só envia pela Brevo; sem chave, não faz nada.
export async function sendNoticeEmail(env, message) {
  const fromEmail = env.EMAIL_FROM || env.BREVO_FROM_EMAIL
  if (!env.BREVO_API_KEY || !fromEmail) return null
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: env.BREVO_FROM_NAME || 'FARISA Personal Trainer', email: fromEmail },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: htmlToText(message.html),
      tags: ['agenda'],
      ...replyTo(env, fromEmail),
    }),
  })
}
