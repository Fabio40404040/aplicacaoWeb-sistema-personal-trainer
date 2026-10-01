// Planos da plataforma para os personais (migração 027): cadastro do
// personal com teste grátis, limite de alunos por plano, assinatura paga por
// Pix ou cartão (Mercado Pago) e painel em "somente leitura" quando vence.
import { createSession, hashPassword, isStrongPassword } from '../lib/session.js'
import { mercadoPago, officialPaymentForIntent } from './payments.js'

export const SAAS_CYCLES = {
  monthly: { label: 'Mensal', months: 1, factor: 1 },
  quarterly: { label: 'Trimestral', months: 3, factor: 0.95 },
  annual: { label: 'Anual', months: 12, factor: 10 / 12 }, // 2 meses grátis
}
const TRIAL_DAYS = 14
const DAY = 86_400_000

export const saasAmount = (plan, cycle) =>
  Math.round(Number(plan.priceCents) * SAAS_CYCLES[cycle].months * SAAS_CYCLES[cycle].factor)

export async function saasPlans(db, { includeInactive = false } = {}) {
  try {
    return (
      await db.query(
        `SELECT code, name, price_cents AS "priceCents", student_limit AS "studentLimit", description,
           position, active, is_trial AS "isTrial" FROM saas_plans
         ${includeInactive ? '' : 'WHERE active=1'} ORDER BY position`,
      )
    ).rows.map((plan) => ({
      ...plan,
      active: Boolean(plan.active),
      isTrial: Boolean(plan.isTrial),
      prices: plan.isTrial
        ? []
        : Object.keys(SAAS_CYCLES).map((cycle) => ({
            cycle,
            label: SAAS_CYCLES[cycle].label,
            amountCents: saasAmount(plan, cycle),
            monthlyCents: Math.round(saasAmount(plan, cycle) / SAAS_CYCLES[cycle].months),
          })),
    }))
  } catch {
    return []
  }
}

// Situação da assinatura de um personal.
export async function saasState(db, trainerId) {
  let row
  try {
    row = (
      await db.query(
        `SELECT t.saas_plan_code AS "planCode", t.saas_cycle AS "cycle", t.saas_expires_at AS "expiresAt",
           p.name AS "planName", p.student_limit AS "studentLimit", p.is_trial AS "isTrial",
           (SELECT COUNT(*) FROM students s WHERE s.trainer_id=t.id) AS "students"
         FROM trainers t LEFT JOIN saas_plans p ON p.code=t.saas_plan_code WHERE t.id=$1`,
        [trainerId],
      )
    ).rows[0]
  } catch {
    return null // sem a migração 027: sem limites
  }
  if (!row) return null
  const expires = row.expiresAt ? Date.parse(row.expiresAt) : null
  const expired = Boolean(expires && expires < Date.now())
  return {
    planCode: row.planCode,
    planName: row.planName || row.planCode,
    cycle: row.cycle,
    isTrial: Boolean(row.isTrial),
    expiresAt: row.expiresAt,
    daysLeft: expires ? Math.ceil((expires - Date.now()) / DAY) : null,
    status: expired ? 'expired' : row.isTrial ? 'trial' : expires ? 'active' : 'courtesy',
    studentLimit: Number(row.studentLimit || 0),
    students: Number(row.students || 0),
  }
}

// ---------- cadastro do personal (teste grátis)
export async function registerTrainer(env, db, body) {
  const name = String(body?.name || '').trim().slice(0, 120)
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  if (name.length < 3) return { error: 'Informe seu nome completo.', status: 400 }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 180)
    return { error: 'Informe um e-mail válido.', status: 400 }
  if (!isStrongPassword(password))
    return {
      error: 'A senha deve ter no mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial.',
      status: 400,
    }
  if (![true, 'on', 'true'].includes(body?.acceptTerms))
    return { error: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.', status: 400 }
  const exists = (await db.query('SELECT id FROM trainers WHERE lower(email)=$1', [email])).rows[0]
  if (exists) return { error: 'Já existe uma conta com este e-mail. Use “Esqueci a senha”.', status: 409 }
  const trial = (await db.query("SELECT student_limit AS \"limit\" FROM saas_plans WHERE code='trial'")).rows[0]
  const trainer = (
    await db.query(
      `INSERT INTO trainers (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,name,email,auth_version`,
      [name, email, await hashPassword(password)],
    )
  ).rows[0]
  await db.query(
    `UPDATE trainers SET saas_plan_code='trial', saas_expires_at=$2, terms_accepted_at=CURRENT_TIMESTAMP,
       phone=$3, cref=$4, student_limit=$5, plan_name='Teste grátis', last_login_at=CURRENT_TIMESTAMP WHERE id=$1`,
    [
      trainer.id,
      new Date(Date.now() + TRIAL_DAYS * DAY).toISOString(),
      String(body?.phone || '').trim().slice(0, 30) || null,
      String(body?.cref || '').trim().slice(0, 30) || null,
      Number(trial?.limit || 5),
    ],
  )
  return {
    data: {
      token: await createSession(trainer, env),
      user: { id: trainer.id, name: trainer.name, email: trainer.email },
    },
    status: 201,
  }
}

// ---------- assinatura (painel do personal)
export async function billingInfo(env, db, trainerId) {
  await reconcileSaas(env, db, trainerId)
  return {
    data: {
      state: await saasState(db, trainerId),
      plans: await saasPlans(db),
      pending: (
        await db.query(
          `SELECT id, plan_code AS "planCode", cycle, amount_cents AS "amountCents", method, status,
             created_at AS "createdAt" FROM saas_payment_intents
           WHERE trainer_id=$1 AND status IN ('pending','in_process') ORDER BY created_at DESC LIMIT 3`,
          [trainerId],
        )
      ).rows,
    },
  }
}

export async function startSaasCheckout(env, db, trainerId, body) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN)
    return { error: 'Pagamento online ainda não configurado. Fale com o suporte.', status: 503 }
  const plans = await saasPlans(db)
  const plan = plans.find((item) => item.code === body?.planCode && !item.isTrial)
  if (!plan) return { error: 'Escolha um plano.', status: 400 }
  const cycle = SAAS_CYCLES[body?.cycle] ? body.cycle : 'monthly'
  const method = body?.method === 'card' ? 'card' : 'pix'
  const state = await saasState(db, trainerId)
  if (state && state.students > plan.studentLimit)
    return {
      error: `Você tem ${state.students} alunos e o plano ${plan.name} permite até ${plan.studentLimit}. Escolha um plano maior.`,
      status: 400,
    }
  const trainer = (await db.query('SELECT name, email FROM trainers WHERE id=$1', [trainerId])).rows[0]
  const amountCents = saasAmount(plan, cycle)
  const intentId = `saas_${crypto.randomUUID().replace(/-/gu, '')}`
  await db.query(
    `INSERT INTO saas_payment_intents (id,trainer_id,plan_code,cycle,amount_cents,method) VALUES ($1,$2,$3,$4,$5,$6)`,
    [intentId, trainerId, plan.code, cycle, amountCents, method],
  )
  const description = `FARISA ${plan.name} — ${SAAS_CYCLES[cycle].label}`
  try {
    if (method === 'pix') {
      const testMode = String(env.MERCADO_PAGO_ACCESS_TOKEN || '').startsWith('TEST-')
      const payment = await mercadoPago('/v1/payments', env, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': intentId },
        body: JSON.stringify({
          transaction_amount: amountCents / 100,
          description,
          payment_method_id: 'pix',
          payer: testMode
            ? { email: 'test_user_br@testuser.com', first_name: 'APRO' }
            : { email: trainer.email, first_name: trainer.name },
          external_reference: intentId,
          metadata: { intent_id: intentId, trainer_id: trainerId, kind: 'saas' },
        }),
      })
      const transaction = payment.point_of_interaction?.transaction_data || {}
      if (!transaction.qr_code) throw new Error('O Mercado Pago não retornou o QR Code do PIX.')
      await db.query(
        'UPDATE saas_payment_intents SET provider_reference=$2, status=$3 WHERE id=$1',
        [intentId, String(payment.id || ''), String(payment.status || 'pending')],
      )
      return {
        data: {
          method,
          amount: (amountCents / 100).toFixed(2),
          qrCode: String(transaction.qr_code),
          qrCodeBase64: String(transaction.qr_code_base64 || ''),
        },
      }
    }
    const siteUrl = String(env.PUBLIC_SITE_URL || '').replace(/\/$/u, '')
    const preference = await mercadoPago('/checkout/preferences', env, {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: plan.code, title: description, currency_id: 'BRL', quantity: 1, unit_price: amountCents / 100 }],
        payer: { name: trainer.name, email: trainer.email },
        payment_methods: { installments: cycle === 'monthly' ? 1 : 12, excluded_payment_types: [{ id: 'ticket' }] },
        external_reference: intentId,
        back_urls: {
          success: `${siteUrl}/personal/#assinatura`,
          pending: `${siteUrl}/personal/#assinatura`,
          failure: `${siteUrl}/personal/#assinatura`,
        },
        auto_return: 'approved',
        statement_descriptor: 'FARISA',
        metadata: { intent_id: intentId, trainer_id: trainerId, kind: 'saas' },
      }),
    })
    await db.query('UPDATE saas_payment_intents SET provider_reference=$2 WHERE id=$1', [intentId, preference.id])
    return { data: { method, checkoutUrl: preference.init_point } }
  } catch (error) {
    await db.query("UPDATE saas_payment_intents SET status='failed' WHERE id=$1", [intentId])
    return { error: error.message, status: 502 }
  }
}

// Pagamento aprovado: ativa/renova o plano. Renovar antes de vencer soma o
// período ao vencimento atual.
export async function approveSaasPayment(db, intent, payment) {
  if (intent.status === 'approved') return
  if (Math.round(Number(payment.transaction_amount) * 100) !== Number(intent.amount_cents))
    throw new Error('Valor da cobrança não confere.')
  const current = (
    await db.query('SELECT saas_plan_code AS code, saas_expires_at AS exp FROM trainers WHERE id=$1', [
      intent.trainer_id,
    ])
  ).rows[0]
  const base =
    current?.exp && current.code === intent.plan_code && Date.parse(current.exp) > Date.now()
      ? new Date(current.exp)
      : new Date()
  base.setUTCMonth(base.getUTCMonth() + SAAS_CYCLES[intent.cycle].months)
  const plan = (await db.query('SELECT name, student_limit AS "limit" FROM saas_plans WHERE code=$1', [intent.plan_code])).rows[0]
  await db.batch([
    { sql: "UPDATE saas_payment_intents SET status='approved', updated_at=CURRENT_TIMESTAMP WHERE id=$1", values: [intent.id] },
    {
      sql: `UPDATE trainers SET saas_plan_code=$2, saas_cycle=$3, saas_expires_at=$4, plan_name=$5, student_limit=$6 WHERE id=$1`,
      values: [intent.trainer_id, intent.plan_code, intent.cycle, base.toISOString(), plan?.name || intent.plan_code, plan?.limit || 60],
    },
  ])
}

export async function reconcileSaas(env, db, trainerId) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) return
  let intents = []
  try {
    intents = (
      await db.query(
        `SELECT * FROM saas_payment_intents WHERE trainer_id=$1 AND status IN ('pending','in_process','authorized')
         AND created_at >= datetime('now','-3 day') ORDER BY created_at DESC LIMIT 5`,
        [trainerId],
      )
    ).rows
  } catch {
    return
  }
  for (const intent of intents) {
    try {
      const payment = await officialPaymentForIntent(intent, env)
      if (!payment) continue
      if (payment.status === 'approved') await approveSaasPayment(db, intent, payment)
      else if (['rejected', 'cancelled'].includes(payment.status))
        await db.query('UPDATE saas_payment_intents SET status=$2 WHERE id=$1', [intent.id, payment.status])
    } catch (error) {
      console.error('[assinatura] não foi possível conferir', intent.id, error?.message)
    }
  }
}

// Webhook do Mercado Pago para cobranças de assinatura (referência "saas_...").
export async function saasWebhook(db, payment) {
  const intent = (
    await db.query('SELECT * FROM saas_payment_intents WHERE id=$1', [String(payment.external_reference || '')])
  ).rows[0]
  if (!intent) return false
  if (payment.status === 'approved') await approveSaasPayment(db, intent, payment)
  else await db.query('UPDATE saas_payment_intents SET status=$2 WHERE id=$1', [intent.id, String(payment.status || 'pending')])
  return true
}

// ---------- admin: editar planos e dar plano/prazo a um personal
export async function adminSavePlans(db, body) {
  const plans = Array.isArray(body?.plans) ? body.plans : []
  const queries = plans
    .filter((plan) => /^[a-z0-9_-]{2,30}$/u.test(String(plan?.code || '')))
    .map((plan, index) => ({
      sql: `INSERT INTO saas_plans (code,name,price_cents,student_limit,description,position,active,is_trial)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(code) DO UPDATE SET name=excluded.name, price_cents=excluded.price_cents,
              student_limit=excluded.student_limit, description=excluded.description, position=excluded.position,
              active=excluded.active`,
      values: [
        plan.code,
        String(plan.name || plan.code).slice(0, 60),
        plan.code === 'trial' ? 0 : Math.max(0, Math.round(Number(plan.priceCents) || 0)),
        Math.max(1, Math.min(100000, Number(plan.studentLimit) || 1)),
        String(plan.description || '').slice(0, 200) || null,
        index,
        plan.active === false ? 0 : 1,
        plan.code === 'trial' ? 1 : 0,
      ],
    }))
  if (!queries.length) return { error: 'Nenhum plano informado.', status: 400 }
  await db.batch(queries)
  return { data: await saasPlans(db, { includeInactive: true }) }
}

export async function adminSetTrainerPlan(db, trainerId, body) {
  const plan = (
    await db.query('SELECT code, name, student_limit AS "limit" FROM saas_plans WHERE code=$1', [String(body?.planCode || '')])
  ).rows[0]
  if (!plan) return { error: 'Plano inválido.', status: 400 }
  const expiresAt = body?.expiresAt ? new Date(`${body.expiresAt}T23:59:59-03:00`) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { error: 'Data inválida.', status: 400 }
  await db.query(
    `UPDATE trainers SET saas_plan_code=$2, saas_expires_at=$3, plan_name=$4, student_limit=$5 WHERE id=$1`,
    [trainerId, plan.code, expiresAt ? expiresAt.toISOString() : null, plan.name, plan.limit],
  )
  return { data: { planCode: plan.code, expiresAt: expiresAt?.toISOString() || null } }
}
