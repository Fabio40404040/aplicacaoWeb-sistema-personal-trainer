import { readJson } from '../lib/http.js'
import {
  hasRecoveryEmailProvider,
  missingEmailConfig,
  sendRecoveryEmail,
} from '../lib/recovery-email.js'
import { createSession, hashPassword, isStrongPassword } from '../lib/session.js'

const generic = {
  data: {
    message:
      'Se houver uma conta de personal com esse e-mail, você receberá um link de recuperação. Confira também o spam.',
  },
}
const hex = (bytes) => Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('')
const digest = async (text) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))

export async function personalRecovery(request, env, db, action) {
  const body = await readJson(request)
  if (action === 'reset') {
    const { token, password } = body || {}
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token) || !isStrongPassword(password))
      return {
        error:
          'Use um link válido e uma senha com maiúscula, minúscula, número e caractere especial.',
        status: 400,
      }
    const hashed = await hashPassword(password)
    const tokenHash = await digest(token)
    const [result] = await db.batch([
      {
        sql: `UPDATE trainers SET password_hash = $2, auth_version = auth_version + 1
        WHERE id IN (SELECT trainer_id FROM trainer_password_resets WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP) RETURNING id`,
        values: [tokenHash, hashed],
      },
      {
        sql: 'DELETE FROM trainer_password_resets WHERE token_hash = $1',
        values: [tokenHash],
      },
    ])
    if (!result.rows.length)
      return {
        error: 'Este link expirou ou já foi usado. Solicite outro.',
        status: 400,
      }
    const trainerResult = await db.query(
      'SELECT id, name, email, auth_version FROM trainers WHERE id = $1 LIMIT 1',
      [result.rows[0].id],
    )
    const trainer = trainerResult.rows[0]
    return {
      data: {
        message: 'Senha alterada. Abrindo o painel do personal…',
        token: await createSession(trainer, env),
        user: { id: trainer.id, name: trainer.name, email: trainer.email },
      },
    }
  }

  const email = body?.email
  if (
    typeof email !== 'string' ||
    email.length > 180 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())
  )
    return { error: 'Informe um e-mail válido.', status: 400 }

  const requestUrl = new URL(request.url)
  const isLocal = ['localhost', '127.0.0.1'].includes(requestUrl.hostname)
  const siteUrl = env.PUBLIC_SITE_URL || (isLocal ? request.headers.get('Origin') : null) || env.ALLOWED_ORIGIN
  const hasEmailProvider = hasRecoveryEmailProvider(env)
  if ((!hasEmailProvider || !siteUrl) && !isLocal) {
    const missing = missingEmailConfig(env, siteUrl)
    console.error(`[recuperação de senha] configuração ausente: ${missing.join(', ')}`)
    return {
      error: `A recuperação por e-mail ainda não está disponível. Entre em contato com o suporte. (Configuração ausente: ${missing.join(', ') || 'desconhecida'})`,
      status: 503,
    }
  }

  const result = await db.query(
    'SELECT id, email FROM trainers WHERE lower(email) = lower($1) LIMIT 1',
    [email.trim()],
  )
  const trainer = result.rows[0]
  if (!trainer) return generic

  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await digest(token)
  const inserted = await db.query(
    `INSERT INTO trainer_password_resets (trainer_id, token_hash, expires_at)
    VALUES ($1, $2, datetime('now', '+30 minutes'))
    ON CONFLICT (trainer_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, requested_at = CURRENT_TIMESTAMP
    ${isLocal ? '' : "WHERE trainer_password_resets.requested_at < datetime('now', '-2 minutes')"}
    RETURNING trainer_id`,
    [trainer.id, tokenHash],
  )
  if (!inserted.rows.length) return generic

  // O link abre no FARISA Painel (/personal/), não no site público.
  const link = new URL('personal/', siteUrl || 'http://localhost:5173')
  link.hash = `nova-senha-personal?token=${token}`
  if (!hasEmailProvider && isLocal)
    return {
      data: {
        message: 'Link local criado. Use o botão abaixo para definir uma nova senha.',
        resetUrl: link.href,
      },
    }

  try {
    const delivery = await sendRecoveryEmail(
      env,
      {
        to: trainer.email,
        subject: 'Redefinição de senha · FARISA Personal Trainer',
        text: `Acesse ${link.href} para redefinir sua senha. O link vale por 30 minutos. Se você não solicitou, ignore esta mensagem.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#18212d">
          <h1 style="font-size:24px">Redefina sua senha</h1>
          <p>Recebemos uma solicitação para alterar a senha da sua conta de personal no FARISA Personal Trainer.</p>
          <p style="margin:28px 0"><a href="${link.href}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#1764ff;color:#fff;text-decoration:none;font-weight:700">Criar nova senha</a></p>
          <p style="font-size:13px;color:#526075">Este link vale por 30 minutos. Se o botão não abrir, copie e cole o endereço abaixo:</p>
          <p style="font-size:12px;word-break:break-all;color:#1764ff">${link.href}</p>
          <p style="font-size:13px;color:#526075">Se você não solicitou esta alteração, ignore a mensagem.</p>
        </div>`,
      },
      tokenHash,
    )
    if (!delivery?.ok) {
      // Mostra no terminal (npm run dev) ou nos logs do Cloudflare o motivo
      // exato da recusa da Brevo. Nunca inclui a chave.
      const detail = delivery ? await delivery.text().catch(() => '') : 'sem provedor de e-mail'
      console.error(
        `[recuperação de senha] envio recusado (${delivery?.status || '-'}) de ${
          env.EMAIL_FROM || env.BREVO_FROM_EMAIL || '(sem remetente)'
        }: ${String(detail).slice(0, 500)}`,
      )
      throw new Error('Delivery failed')
    }
  } catch (error) {
    if (error?.message !== 'Delivery failed')
      console.error('[recuperação de senha] erro ao chamar a Brevo:', error?.message || error)
    await db.query(
      'DELETE FROM trainer_password_resets WHERE trainer_id = $1 AND token_hash = $2',
      [trainer.id, tokenHash],
    )
    return {
      error: 'Não foi possível enviar a recuperação agora. Tente novamente mais tarde.',
      status: 503,
    }
  }
  return isLocal
    ? {
        data: {
          message: 'E-mail de recuperação enviado. Confira sua caixa de entrada.',
        },
      }
    : generic
}
