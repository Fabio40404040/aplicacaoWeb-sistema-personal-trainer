// O próprio personal: primeiros passos, uso de armazenamento, exportar os
// dados e excluir a conta.
import { isDemoEmail } from '../lib/demo.js'
import { verifyPassword } from '../lib/session.js'
import { removeTrainer } from './admin.js'
import { saasState } from './saas.js'

// ---------- armazenamento (vídeos e PDFs; GIFs não contam)
export const FREE_MEDIA_BYTES = 300 * 1024 * 1024
const mb = (bytes) => `${Math.round(Number(bytes || 0) / (1024 * 1024))} MB`

export async function mediaUsage(db, trainerId) {
  const sum = async (table) => {
    try {
      return Number((await db.query(`SELECT COALESCE(SUM(size_bytes),0) AS total FROM ${table} WHERE trainer_id=$1`, [trainerId])).rows[0]?.total || 0)
    } catch {
      return 0
    }
  }
  const used = (await sum('exercise_videos')) + (await sum('ready_workout_pdfs'))
  const state = await saasState(db, trainerId)
  return { used, limit: state?.isFree ? FREE_MEDIA_BYTES : 0 }
}

// Devolve a mensagem de "sem espaço" ou '' quando o arquivo cabe.
export async function mediaQuotaProblem(db, trainerId, newBytes) {
  try {
    const { used, limit } = await mediaUsage(db, trainerId)
    if (!limit || used + Number(newBytes || 0) <= limit) return ''
    return `O plano Grátis permite até ${mb(limit)} de vídeos e PDFs, e você já usa ${mb(used)}. Apague arquivos antigos ou assine o Ilimitado em "Minha assinatura". GIFs não contam nesse limite.`
  } catch {
    return ''
  }
}

// ---------- primeiros passos
export async function onboarding(db, trainerId) {
  const one = async (sql) => {
    try {
      return (await db.query(sql, [trainerId])).rows[0] || {}
    } catch {
      return {}
    }
  }
  const profile = await one('SELECT avatar, phone, bio FROM trainers WHERE id=$1')
  // "Montou a página" = mexeu em alguma coisa: marca, cor, banner, contato, redes ou preços.
  const site = await one(
    `SELECT slug,
       (brand_name IS NOT NULL OR brand_mark IS NOT NULL OR accent<>'blue' OR hero_kind<>'default'
        OR whatsapp IS NOT NULL OR contact_email IS NOT NULL OR address IS NOT NULL
        OR instagram IS NOT NULL OR facebook IS NOT NULL OR tiktok IS NOT NULL
        OR EXISTS (SELECT 1 FROM trainer_plan_prices p WHERE p.trainer_id=trainer_site.trainer_id)) AS edited
     FROM trainer_site WHERE trainer_id=$1`,
  )
  const payout = await one('SELECT mode FROM trainer_payout WHERE trainer_id=$1')
  const counts = await one(
    `SELECT (SELECT COUNT(*) FROM students WHERE trainer_id=$1) AS students,
       (SELECT COUNT(*) FROM workouts WHERE trainer_id=$1) AS workouts`,
  )
  return {
    data: {
      slug: site.slug || '',
      steps: {
        profile: Boolean(profile.avatar || profile.bio || profile.phone),
        site: Boolean(site.slug && Number(site.edited)),
        payout: Boolean(payout.mode && payout.mode !== 'none'),
        student: Number(counts.students || 0) > 0,
        workout: Number(counts.workouts || 0) > 0,
      },
    },
  }
}

// ---------- exportar os dados (LGPD)
const HIDDEN = /password|token|secret|hash|object_key/iu
function clean(row) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !HIDDEN.test(key))
      .map(([key, value]) => [key, typeof value === 'string' && value.length > 20_000 ? '[arquivo ou imagem omitido]' : value]),
  )
}

export async function exportAccount(db, trainerId) {
  const tables = (
    await db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name`)
  ).rows.map((row) => row.name)
  const data = {}
  for (const table of tables) {
    if (!/^[a-z0-9_]+$/u.test(table) || ['trainers', 'login_attempts', 'revoked_sessions', 'admin_audit', 'error_log'].includes(table)) continue
    try {
      const columns = (await db.query(`SELECT name FROM pragma_table_info('${table}')`)).rows.map((row) => row.name)
      if (!columns.includes('trainer_id')) continue
      const rows = (await db.query(`SELECT * FROM ${table} WHERE trainer_id=$1 LIMIT 20000`, [trainerId])).rows
      if (rows.length) data[table] = rows.map(clean)
    } catch {
      // tabela sem acesso: segue para a próxima
    }
  }
  const account = (await db.query('SELECT * FROM trainers WHERE id=$1', [trainerId])).rows[0]
  return {
    data: {
      geradoEm: new Date().toISOString(),
      observacao: 'Cópia dos seus dados na FARISA. Senhas, chaves de pagamento e arquivos enviados (vídeos, PDFs, GIFs, imagens) não entram neste arquivo.',
      conta: account ? clean(account) : null,
      dados: data,
    },
  }
}

// ---------- excluir a própria conta
export async function deleteOwnAccount(env, db, session, body) {
  if (session.support) return { error: 'No acesso de suporte não é possível excluir a conta.', status: 403 }
  const trainer = (await db.query('SELECT id, name, email, password_hash FROM trainers WHERE id=$1', [session.sub])).rows[0]
  if (!trainer) return { error: 'Conta não encontrada.', status: 404 }
  if (isDemoEmail(trainer.email)) return { error: 'A conta de demonstração não pode ser excluída.', status: 403 }
  const owner = (await db.query('SELECT id FROM trainers ORDER BY created_at, id LIMIT 1')).rows[0]?.id
  if (owner === trainer.id)
    return { error: 'Esta é a conta do dono da plataforma e não pode ser excluída por aqui.', status: 403 }
  if (String(body?.confirm || '').trim().toUpperCase() !== 'EXCLUIR')
    return { error: 'Digite EXCLUIR para confirmar.', status: 400 }
  if (typeof body?.password !== 'string' || !(await verifyPassword(body.password, trainer.password_hash)))
    return { error: 'Senha incorreta.', status: 400 } // 401 faria o painel achar que a sessão caiu
  const result = await removeTrainer(env, db, trainer.id)
  try {
    await db.query(
      `INSERT INTO admin_audit (admin_email, action, target_type, target_label, details) VALUES ($1,'trainer_self_deleted','trainer',$2,$3)`,
      [trainer.email, trainer.email, `Conta excluída pelo próprio personal · ${result.removedFiles} arquivo(s) e ${result.removedAccounts} conta(s) de aluno`],
    )
  } catch {
    // registro é opcional
  }
  return { data: { deleted: true } }
}
