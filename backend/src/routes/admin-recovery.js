// "Esqueci a senha" da área do administrador (/admin). Mesmo funcionamento
// da recuperação do personal: link por e-mail (Brevo), válido por 30 minutos,
// guardado só como hash e usado uma única vez.
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
      'Se houver uma conta de administrador com esse e-mail, você receberá um link de recuperação. Confira também o spam.',
  },
}
const hex = (bytes) => Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('')
const digest = async (text) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))

async function resetPassword(env, db, body) {
  const { token, password } = body || {}
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token) || !isStrongPassword(password))
    return {
      error: 'Use um link válido e uma senha com maiúscula, minúscula, número e caractere especial.',
      status: 400,
    }
  const hashed = await hashPassword(password)
  const tokenHash = await digest(token)
  const [result] = await db.batch([
    {
      sql: `UPDATE platform_admins SET password_hash = $2, auth_version = auth_version + 1
        WHERE id IN (SELECT admin_id FROM admin_password_resets WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP) RETURNING id`,
      values: [tokenHash, hashed],
    },
    { sql: 'DELETE FROM admin_password_resets WHERE token_hash = $1', values: [tokenHash] },
  ])
  if (!result.rows.length)
    return { error: 'Este link expirou ou já foi usado. Solicite outro.', status: 400 }
  const admin = (
    await db.query(
      'SELECT id, name, email, auth_version FROM platform_admins WHERE id = $1 LIMIT 1',
      [result.rows[0].id],
    )
  ).rows[0]
  return {
    data: {
      message: 'Senha alterada. Abrindo a administração…',
      token: await createSession(admin, env, 'admin'),
      user: { id: admin.id, name: admin.name, email: admin.email },
    },
  }
}

export async function adminRecovery(request, env, db, action) {
  const body = await readJson(request)
  try {
    await db.query('SELECT 1 FROM admin_password_resets LIMIT 1')
  } catch {
    return {
      error: 'Recuperação de senha do administrador ainda não configurada (rode a migração 022).',
      status: 503,
    }
  }
  if (action === 'reset') return resetPassword(env, db, body)

  const email = body?.email
  if (
    typeof email !== 'string' ||
    email.length > 180 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())
  )
    return { error: 'Informe um e-mail válido.', status: 400 }

  const requestUrl = new URL(request.url)
  const isLocal = ['localhost', '127.0.0.1'].includes(requestUrl.hostname)
  // No computador o link volta para o endereço aberto no navegador (Vite).
  const siteUrl = isLocal
    ? request.headers.get('Origin') || env.PUBLIC_SITE_URL || 'http://localhost:5173'
    : env.PUBLIC_SITE_URL || (isLocal ? request.headers.get('Origin') : null) || env.ALLOWED_ORIGIN
  const hasEmailProvider = hasRecoveryEmailProvider(env)
  if ((!hasEmailProvider || !siteUrl) && !isLocal) {
    const missing = missingEmailConfig(env, siteUrl)
    console.error(`[recuperação de senha] configuração ausente: ${missing.join(', ')}`)
    return {
      error: `A recuperação por e-mail ainda não está disponível.`,
      status: 503,
    }
  }

  const admin = (
    await db.query('SELECT id, email FROM platform_admins WHERE lower(email) = lower($1) LIMIT 1', [
      email.trim(),
    ])
  ).rows[0]
  if (!admin) return generic

  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await digest(token)
  const inserted = await db.query(
    `INSERT INTO admin_password_resets (admin_id, token_hash, expires_at)
    VALUES ($1, $2, datetime('now', '+30 minutes'))
    ON CONFLICT (admin_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, requested_at = CURRENT_TIMESTAMP
    ${isLocal ? '' : "WHERE admin_password_resets.requested_at < datetime('now', '-2 minutes')"}
    RETURNING admin_id`,
    [admin.id, tokenHash],
  )
  if (!inserted.rows.length) return generic

  const link = new URL('admin/', siteUrl)
  link.hash = `nova-senha?token=${token}`
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
        to: admin.email,
        subject: 'Redefinição de senha · Administração FARISA',
        text: `Acesse ${link.href} para redefinir a senha da administração. O link vale por 30 minutos. Se você não solicitou, ignore esta mensagem.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#18212d">
          <h1 style="font-size:24px">Redefina a senha da administração</h1>
          <p>Recebemos uma solicitação para alterar a senha da sua conta de administrador da plataforma FARISA.</p>
          <p style="margin:28px 0"><a href="${link.href}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#1764ff;color:#fff;text-decoration:none;font-weight:700">Criar nova senha</a></p>
          <p style="font-size:13px;color:#526075">Este link vale por 30 minutos. Se o botão não abrir, copie e cole o endereço abaixo:</p>
          <p style="font-size:12px;word-break:break-all;color:#1764ff">${link.href}</p>
          <p style="font-size:13px;color:#526075">Se você não solicitou esta alteração, ignore a mensagem.</p>
        </div>`,
      },
      tokenHash,
    )
    if (!delivery?.ok) {
      const detail = delivery ? await delivery.text().catch(() => '') : 'sem provedor de e-mail'
      console.error(
        `[recuperação de senha] envio recusado (${delivery?.status || '-'}): ${String(detail).slice(0, 500)}`,
      )
      throw new Error('Delivery failed')
    }
  } catch (error) {
    if (error?.message !== 'Delivery failed')
      console.error('[recuperação de senha] erro ao chamar a Brevo:', error?.message || error)
    await db.query('DELETE FROM admin_password_resets WHERE admin_id = $1 AND token_hash = $2', [
      admin.id,
      tokenHash,
    ])
    return {
      error: 'Não foi possível enviar a recuperação agora. Tente novamente mais tarde.',
      status: 503,
    }
  }
  return isLocal
    ? { data: { message: 'E-mail de recuperação enviado. Confira sua caixa de entrada.' } }
    : generic
}
