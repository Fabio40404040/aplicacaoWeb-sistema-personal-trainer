export function hasRecoveryEmailProvider(env) {
  return Boolean(
    (env.BREVO_API_KEY && (env.EMAIL_FROM || env.BREVO_FROM_EMAIL)) || env.PASSWORD_MAILER,
  )
}

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
        tags: ['password-reset'],
        headers: { 'X-FARISA-Reset-ID': idempotencyKey },
        ...(env.BREVO_REPLY_TO ? { replyTo: { email: env.BREVO_REPLY_TO } } : {}),
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
