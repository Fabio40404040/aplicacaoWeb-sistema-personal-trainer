// E-mails de aviso com a cara da FARISA. O "env" da requisição fica guardado
// aqui (é o mesmo para todas as requisições do servidor), para qualquer rota
// conseguir enviar sem precisar repassar a configuração.
import { isDemoEmail } from './demo.js'
import { sendNoticeEmail } from './recovery-email.js'

let ENV = null
export const useEnv = (env) => {
  ENV = env
}
export const siteUrl = () => String(ENV?.PUBLIC_SITE_URL || '').replace(/\/$/u, '')
export const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const day = (value) =>
  new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Fortaleza' })
export const escape = (text) =>
  String(text || '').replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

// lines: parágrafos em HTML (escape o que vier de usuário). button: { label, url }.
// Nunca lança erro: aviso por e-mail não pode derrubar a ação principal.
export async function notify({ to, name, subject, lines, button, footer }) {
  try {
    if (!ENV || !to || isDemoEmail(to)) return false
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#0f172a;max-width:520px">
<p>Olá, ${escape(String(name || '').trim().split(' ')[0] || 'tudo bem')}.</p>
${lines.map((line) => `<p>${line}</p>`).join('\n')}
${button ? `<p><a href="${button.url}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#1557f0;color:#ffffff;text-decoration:none;font-weight:700">${escape(button.label)}</a></p>` : ''}
<p style="font-size:13px;color:#64748b">${escape(footer || 'FARISA · você recebe este e-mail porque tem uma conta na plataforma.')}</p>
</div>`
    const response = await sendNoticeEmail(ENV, { to, subject, html })
    if (!response) await logEmailFailure(subject, to, 'envio de e-mail não configurado (BREVO_API_KEY / EMAIL_FROM)')
    else if (!response.ok)
      await logEmailFailure(subject, to, `Brevo respondeu ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`)
    return Boolean(response?.ok)
  } catch (error) {
    console.error('[e-mail] não enviado', error?.message)
    await logEmailFailure(subject, to, String(error?.message || error))
    return false
  }
}

// E-mail que não saiu fica em Admin → Registro de ações → Erros do sistema
// (rota "E-MAIL"), com o motivo dado pela Brevo. Nunca guarda a chave.
async function logEmailFailure(subject, to, reason) {
  try {
    const masked = String(to || '').replace(/^(.{2}).*(@.*)$/u, '$1***$2')
    await ENV?.DB?.prepare('INSERT INTO error_log (route, message, detail) VALUES (?1, ?2, ?3)')
      .bind('E-MAIL', `Não enviado: ${String(subject || '').slice(0, 120)} → ${masked}`, String(reason || '').slice(0, 500))
      .run()
  } catch {
    /* sem a migração 036 */
  }
}
