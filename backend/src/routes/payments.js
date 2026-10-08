import { trainerLocked } from './plan-access.js'
const PAY_LOCKED = 'O pagamento pelo site não está disponível no momento. Combine o pagamento com o seu personal.'
import { notifyPixToCheck, notifyStudentPayment } from './account-emails.js'
import { NOT_CONFIGURED, pixBrCode, resolvePay } from './payout.js'
import { withTrainerPrice } from './site.js'

export const BILLING_CYCLES = {
  monthly: { days: 30, months: 1, discount: 1 },
  quarterly: { days: 90, months: 3, discount: 0.95 },
  semiannual: { days: 180, months: 6, discount: 0.9 },
  annual: { days: 365, months: 12, discount: 0.85 },
}

export function amountFor(plan, billingCycle) {
  if (plan.accessType === 'permanent') return Number(plan.priceCents)
  const cycle = BILLING_CYCLES[billingCycle] || BILLING_CYCLES.quarterly
  return Math.round(Number(plan.priceCents) * cycle.months * cycle.discount)
}

function expiryFor(plan, billingCycle) {
  if (plan.accessType === 'permanent') return null
  const result = new Date()
  result.setUTCDate(result.getUTCDate() + (BILLING_CYCLES[billingCycle]?.days || 30))
  return result.toISOString()
}

function mercadoPagoErrorDetail(data) {
  const causeDetail = Array.isArray(data?.cause)
    ? data.cause
        .map((item) => item?.description || item?.code)
        .filter(Boolean)
        .join('; ')
    : ''
  return causeDetail || data?.message || data?.error || ''
}

export async function mercadoPago(path, env, options = {}) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN)
    throw new Error('O Mercado Pago ainda não foi configurado pelo personal.')
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('Mercado Pago:', response.status, data)
    // O motivo técnico fica só no registro do servidor; quem paga vê um texto simples.
    console.error('Mercado Pago (detalhe):', mercadoPagoErrorDetail(data))
    throw new Error(
      'Não foi possível iniciar o pagamento. Confira os dados e tente de novo, ou use outra forma de pagamento.',
    )
  }
  return data
}

// Dados extras que o antifraude do Mercado Pago usa para aprovar mais
// pagamentos legítimos: nome do titular, item comprado e aparelho.
export function antifraud(body, item) {
  const name = String(body?.cardholderName || '')
    .replace(/[^\p{L}\s.'-]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80)
  const [first, ...rest] = name.split(' ')
  const person = first ? { first_name: first, ...(rest.length ? { last_name: rest.join(' ') } : {}) } : {}
  const deviceId = String(body?.deviceId || '')
  return {
    person,
    headers: /^[A-Za-z0-9:_.-]{8,150}$/u.test(deviceId) ? { 'X-meli-session-id': deviceId } : {},
    additionalInfo: {
      items: [
        {
          id: String(item.id),
          title: String(item.title).slice(0, 120),
          description: String(item.title).slice(0, 120),
          category_id: 'services',
          quantity: 1,
          unit_price: item.amountCents / 100,
        },
      ],
      ...(first ? { payer: person } : {}),
    },
  }
}

// Plano e valor a cobrar do aluno, já com o preço do personal dele.
async function paymentAccount(db, accountId) {
  const row = await basePaymentAccount(db, accountId)
  return withTrainerPrice(db, row?.trainerId, row)
}
async function basePaymentAccount(db, accountId) {
  // Mudança de plano pedida pelo aluno (migração 025): cobra o plano novo.
  try {
    return (
      await db.query(
        `SELECT s.id AS "studentId", s.trainer_id AS "trainerId", p.code AS "planCode",
         COALESCE(a.change_billing_cycle, s.billing_cycle) AS "billingCycle", a.name, a.email, p.name AS "planName",
         p.price_cents AS "priceCents", p.access_type AS "accessType"
         FROM student_accounts a JOIN students s ON s.id=a.student_id
         JOIN plans p ON p.code=COALESCE(a.change_plan_code, s.plan_code) WHERE a.id=$1 AND p.active=1 LIMIT 1`,
        [accountId],
      )
    ).rows[0]
  } catch {
    return (
      await db.query(
      `SELECT s.id AS "studentId", s.trainer_id AS "trainerId", s.plan_code AS "planCode",
         s.billing_cycle AS "billingCycle", a.name, a.email, p.name AS "planName",
         p.price_cents AS "priceCents", p.access_type AS "accessType"
         FROM student_accounts a JOIN students s ON s.id=a.student_id
         JOIN plans p ON p.code=s.plan_code WHERE a.id=$1 AND p.active=1 LIMIT 1`,
        [accountId],
    )
  ).rows[0]
  }
}

// Formas de pagamento que o personal deste aluno aceita.
export async function paymentOptions(db, accountId, platformEnv) {
  const row = await paymentAccount(db, accountId)
  if (!row) return { error: 'Plano ou cadastro não encontrado.', status: 404 }
  const pay = await resolvePay(db, platformEnv, row.trainerId, { charge: true })
  // Mercado Pago automático só nos planos pagos (o Pix na chave do personal continua).
  const online = Boolean(pay.env?.MERCADO_PAGO_ACCESS_TOKEN) && !(await trainerLocked(db, row.trainerId))
  return {
    data: {
      pix: online || pay.mode === 'pix',
      card: online && Boolean(pay.env?.MERCADO_PAGO_PUBLIC_KEY),
      manual: pay.mode === 'pix',
    },
  }
}

export async function cardPaymentConfig(db, accountId, platformEnv) {
  const row = await paymentAccount(db, accountId)
  if (!row) return { error: 'Plano ou cadastro não encontrado.', status: 404 }
  const pay = await resolvePay(db, platformEnv, row.trainerId, { charge: true })
  const env = pay.env
  if (!env?.MERCADO_PAGO_PUBLIC_KEY || !env?.MERCADO_PAGO_ACCESS_TOKEN)
    return {
      error: pay.mode === 'pix' ? 'Seu personal recebe apenas por Pix.' : NOT_CONFIGURED,
      status: 503,
    }
  if (row.accessType !== 'permanent' && !BILLING_CYCLES[row.billingCycle])
    row.billingCycle = 'quarterly'
  return {
    data: {
      publicKey: String(env.MERCADO_PAGO_PUBLIC_KEY),
      amount: (amountFor(row, row.billingCycle) / 100).toFixed(2),
      description: `${row.planName} — FARISA Personal`,
      payerEmail: row.email,
    },
  }
}

export async function createPixPayment(db, accountId, platformEnv) {
  const row = await paymentAccount(db, accountId)
  if (!row) return { error: 'Plano ou pré-cadastro não encontrado.', status: 404 }
  if (row.accessType !== 'permanent' && !BILLING_CYCLES[row.billingCycle])
    row.billingCycle = 'quarterly'
  const amountCents = amountFor(row, row.billingCycle)
  const intentId = crypto.randomUUID().replaceAll('-', '')
  const pay = await resolvePay(db, platformEnv, row.trainerId, { charge: true })
  if (pay.mode === 'pix') return manualPix(db, row, pay.pix, amountCents, intentId)
  if (await trainerLocked(db, row.trainerId)) return { error: PAY_LOCKED, status: 403 }
  const env = pay.env
  if (!env?.MERCADO_PAGO_ACCESS_TOKEN) return { error: NOT_CONFIGURED, status: 503 }
  await db.query(
    `INSERT INTO payment_intents (id,trainer_id,student_id,plan_code,billing_cycle,amount_cents,method)
     VALUES ($1,$2,$3,$4,$5,$6,'pix')`,
    [intentId, row.trainerId, row.studentId, row.planCode, row.billingCycle, amountCents],
  )
  const apiUrl = String(
    env.PUBLIC_API_URL || 'https://farisa-coach-api.SEU-SUBDOMINIO.workers.dev',
  ).replace(/\/$/u, '')
  const testMode =
    String(env.MERCADO_PAGO_PUBLIC_KEY || '').startsWith('TEST-') ||
    String(env.MERCADO_PAGO_ACCESS_TOKEN || '').startsWith('TEST-')
  try {
    const payment = await mercadoPago('/v1/payments', env, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': intentId },
      body: JSON.stringify({
        transaction_amount: amountCents / 100,
        description: `${row.planName} — FARISA Personal`,
        payment_method_id: 'pix',
        payer: testMode
          ? { email: 'test_user_br@testuser.com', first_name: 'APRO' }
          : { email: row.email, first_name: row.name },
        external_reference: intentId,
        ...(env.MERCADO_PAGO_WEBHOOK_SECRET
          ? { notification_url: `${apiUrl}/api/payments/mercadopago/webhook${pay.trainerId ? `?trainer=${pay.trainerId}` : ''}` }
          : {}),
        metadata: { intent_id: intentId, student_id: row.studentId, plan_code: row.planCode },
      }),
    })
    const transaction = payment.point_of_interaction?.transaction_data || {}
    if (!transaction.qr_code)
      throw new Error('O Mercado Pago não retornou o QR Code do PIX.')
    await db.query(
      `UPDATE payment_intents SET provider_reference=$2,status=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [intentId, String(payment.id || ''), String(payment.status || 'pending')],
    )
    return {
      data: {
        status: String(payment.status || 'pending'),
        paymentId: String(payment.id || ''),
        amount: (amountCents / 100).toFixed(2),
        qrCode: String(transaction.qr_code),
        qrCodeBase64: String(transaction.qr_code_base64 || ''),
        ticketUrl: String(transaction.ticket_url || ''),
      },
    }
  } catch (error) {
    await db.query(
      `UPDATE payment_intents SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [intentId],
    )
    return { error: error.message, status: 502 }
  }
}

// Pix direto na chave do personal (qualquer banco): gera o "copia e cola" com
// o valor; o aluno paga, avisa, e o personal confere e confirma.
async function manualPix(db, row, pix, amountCents, intentId) {
  await db.batch([
    {
      sql: `UPDATE payment_intents SET status='cancelled', updated_at=CURRENT_TIMESTAMP
            WHERE student_id=$1 AND provider='manual' AND status='pending'`,
      values: [row.studentId],
    },
    {
      sql: `INSERT INTO payment_intents (id,trainer_id,student_id,plan_code,billing_cycle,amount_cents,method,provider,provider_reference)
            VALUES ($1,$2,$3,$4,$5,$6,'pix','manual',$7)`,
      values: [intentId, row.trainerId, row.studentId, row.planCode, row.billingCycle, amountCents, `manual:${intentId}`],
    },
  ])
  return {
    data: {
      manual: true,
      intentId,
      status: 'pending',
      amount: (amountCents / 100).toFixed(2),
      holder: pix.pix_holder,
      qrCode: pixBrCode({
        key: pix.pix_key,
        holder: pix.pix_holder,
        city: pix.pix_city,
        amountCents,
        txid: `FARISA${intentId.slice(0, 19)}`,
      }),
      qrCodeBase64: '',
    },
  }
}

// Aluno avisa que pagou o Pix direto: vai para a conferência do personal.
export async function manualPixPaid(db, accountId, body) {
  const result = await db.query(
    `UPDATE payment_intents SET status='in_review', updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND provider='manual' AND status IN ('pending','in_review')
       AND student_id=(SELECT student_id FROM student_accounts WHERE id=$2) RETURNING id`,
    [String(body?.intentId || ''), accountId],
  )
  if (!result.rows[0]) return { error: 'Cobrança não encontrada. Gere o Pix de novo.', status: 404 }
  await notifyPixToCheck(db, result.rows[0].id)
  return { data: { status: 'in_review' } }
}

// Personal confere o extrato e confirma (libera o aluno) ou recusa.
export async function manualPixDecision(db, trainerId, intentId, action) {
  const intent = (
    await db.query(
      `SELECT i.*, p.access_type AS "accessType" FROM payment_intents i JOIN plans p ON p.code=i.plan_code
       WHERE i.id=$1 AND i.trainer_id=$2 AND i.provider='manual' LIMIT 1`,
      [intentId, trainerId],
    )
  ).rows[0]
  if (!intent || !['pending', 'in_review'].includes(intent.status))
    return { error: 'Este aviso de pagamento já foi resolvido.', status: 404 }
  if (action === 'reject') {
    await db.query(`UPDATE payment_intents SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [intent.id])
    return { data: { status: 'rejected' } }
  }
  await approvePayment(
    db,
    intent,
    { currency_id: 'BRL', transaction_amount: Number(intent.amount_cents) / 100, payment_type_id: 'bank_transfer' },
    `manual:${intent.id}`,
    'pix_manual',
  )
  return { data: { status: 'approved' } }
}

export async function createCardPayment(db, accountId, platformEnv, body) {
  const token = String(body?.token || '')
  const paymentMethodId = String(body?.paymentMethodId || '')
  const issuerId = String(body?.issuerId || '')
  const identificationType = String(body?.identificationType || '').toUpperCase()
  const identificationNumber = String(body?.identificationNumber || '').replace(/\D/gu, '')
  const installments = Number(body?.installments)
  if (
    !/^[A-Za-z0-9_-]{10,200}$/u.test(token) ||
    !/^[a-z0-9_-]{1,40}$/u.test(paymentMethodId) ||
    !Number.isInteger(installments) ||
    installments < 1 ||
    installments > 12 ||
    !/^[A-Z]{2,10}$/u.test(identificationType) ||
    !/^\d{5,20}$/u.test(identificationNumber) ||
    (issuerId && !/^\d{1,20}$/u.test(issuerId))
  )
    return { error: 'Confira os dados do cartão e do titular.', status: 400 }

  const row = await paymentAccount(db, accountId)
  if (!row) return { error: 'Plano ou cadastro não encontrado.', status: 404 }
  if (await trainerLocked(db, row.trainerId)) return { error: PAY_LOCKED, status: 403 }
  const pay = await resolvePay(db, platformEnv, row.trainerId, { charge: true })
  const env = pay.env
  if (!env?.MERCADO_PAGO_ACCESS_TOKEN)
    return { error: pay.mode === 'pix' ? 'Seu personal recebe apenas por Pix.' : NOT_CONFIGURED, status: 503 }
  if (row.accessType !== 'permanent' && !BILLING_CYCLES[row.billingCycle])
    row.billingCycle = 'quarterly'
  const amountCents = amountFor(row, row.billingCycle)
  const intentId = crypto.randomUUID().replaceAll('-', '')
  await db.query(
    `INSERT INTO payment_intents (id,trainer_id,student_id,plan_code,billing_cycle,amount_cents,method)
     VALUES ($1,$2,$3,$4,$5,$6,'credit_card')`,
    [intentId, row.trainerId, row.studentId, row.planCode, row.billingCycle, amountCents],
  )
  const apiUrl = String(
    env.PUBLIC_API_URL || 'https://farisa-coach-api.SEU-SUBDOMINIO.workers.dev',
  ).replace(/\/$/u, '')
  const extra = antifraud(body, { id: row.planCode, title: `${row.planName} — FARISA Personal`, amountCents })
  try {
    const payment = await mercadoPago('/v1/payments', env, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': intentId, ...extra.headers },
      body: JSON.stringify({
        transaction_amount: amountCents / 100,
        token,
        additional_info: extra.additionalInfo,
        description: `${row.planName} — FARISA Personal`,
        installments,
        payment_method_id: paymentMethodId,
        ...(issuerId ? { issuer_id: issuerId } : {}),
        payer: {
          email: row.email,
          ...extra.person,
          identification: { type: identificationType, number: identificationNumber },
        },
        external_reference: intentId,
        ...(env.MERCADO_PAGO_WEBHOOK_SECRET
          ? { notification_url: `${apiUrl}/api/payments/mercadopago/webhook${pay.trainerId ? `?trainer=${pay.trainerId}` : ''}` }
          : {}),
        statement_descriptor: 'FARISA PERSONAL',
        metadata: { intent_id: intentId, student_id: row.studentId, plan_code: row.planCode },
      }),
    })
    await db.query(
      `UPDATE payment_intents SET provider_reference=$2,status=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [intentId, String(payment.id || ''), String(payment.status || 'pending')],
    )
    const intent = {
      id: intentId,
      trainer_id: row.trainerId,
      student_id: row.studentId,
      plan_code: row.planCode,
      billing_cycle: row.billingCycle,
      amount_cents: amountCents,
      accessType: row.accessType,
      status: 'pending',
    }
    if (payment.status === 'approved')
      await approvePayment(db, intent, payment, String(payment.id || ''))
    return {
      data: {
        status: String(payment.status || 'pending'),
        statusDetail: String(payment.status_detail || ''),
        paymentId: String(payment.id || ''),
      },
    }
  } catch (error) {
    await db.query(
      `UPDATE payment_intents SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [intentId],
    )
    return { error: error.message, status: 502 }
  }
}

function signatureParts(value) {
  return Object.fromEntries(
    String(value || '')
      .split(',')
      .map((part) => part.trim().split('=', 2))
      .filter(([key, item]) => key && item),
  )
}

async function validSignature(request, env, dataId) {
  if (!env.MERCADO_PAGO_WEBHOOK_SECRET) return false
  const parts = signatureParts(request.headers.get('x-signature'))
  const requestId = request.headers.get('x-request-id') || ''
  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.MERCADO_PAGO_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const expected = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  if (expected.length !== parts.v1.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1)
    difference |= expected.charCodeAt(index) ^ parts.v1.charCodeAt(index)
  return difference === 0
}

async function approvePayment(db, intent, payment, paymentId, provider = 'mercadopago') {
  if (intent.status === 'approved') return
  const method = payment.payment_type_id === 'credit_card' ? 'credit_card' : 'pix'
  if (
    payment.currency_id !== 'BRL' ||
    Math.round(Number(payment.transaction_amount) * 100) !== Number(intent.amount_cents)
  )
    throw new Error('Valor da cobrança não confere.')
  const expiresAt = expiryFor(intent, intent.billing_cycle)
  await db.batch([
    {
      sql: `UPDATE payment_intents SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      values: [intent.id],
    },
    {
      sql: `UPDATE students SET plan_code=$2,access_type=$3,billing_cycle=$4,access_status='active',access_expires_at=$5,
       payment_status='paid',payment_method=$6,authorized_at=CURRENT_TIMESTAMP,status='Ativo',updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      values: [
        intent.student_id,
        intent.plan_code,
        intent.accessType,
        intent.billing_cycle,
        expiresAt,
        method,
      ],
    },
    {
      sql: `INSERT INTO payments (trainer_id,student_id,plan_code,amount_cents,status,method,provider,provider_reference,paid_at,billing_cycle)
       VALUES ($1,$2,$3,$4,'paid',$5,$8,$6,CURRENT_TIMESTAMP,$7)
       ON CONFLICT(provider_reference) WHERE provider_reference IS NOT NULL DO NOTHING`,
      values: [
        intent.trainer_id,
        intent.student_id,
        intent.plan_code,
        intent.amount_cents,
        method,
        paymentId,
        intent.billing_cycle,
        provider,
      ],
    },
    {
      sql: `INSERT INTO access_history (trainer_id,student_id,action,plan_code,details)
       VALUES ($1,$2,'payment_confirmed',$3,$4)`,
      values: [intent.trainer_id, intent.student_id, intent.plan_code, `${provider}:${paymentId}`],
    },
  ])
  // Pagou: a mudança de plano foi concluída.
  try {
    await db.query(
      `UPDATE student_accounts SET change_plan_code=NULL, change_billing_cycle=NULL WHERE student_id=$1`,
      [intent.student_id],
    )
  } catch {
    // sem a migração 025
  }
  // Recibo para o aluno e aviso para o personal.
  await notifyStudentPayment(db, intent)
}

export async function officialPaymentForIntent(intent, env) {
  const reference = String(intent.provider_reference || '')
  if (/^\d{1,30}$/u.test(reference)) {
    const payment = await mercadoPago(`/v1/payments/${reference}`, env)
    return String(payment.external_reference || '') === String(intent.id) ? payment : null
  }
  const query = new URLSearchParams({
    external_reference: String(intent.id),
    sort: 'date_created',
    criteria: 'desc',
  })
  const search = await mercadoPago(`/v1/payments/search?${query}`, env)
  return (search.results || []).find(
    (payment) => String(payment.external_reference || '') === String(intent.id),
  )
}

export async function reconcileStudentPayments(db, accountId, platformEnv) {
  const intents = (
    await db.query(
      `SELECT i.*, p.access_type AS "accessType" FROM payment_intents i
       JOIN student_accounts a ON a.student_id=i.student_id
       JOIN plans p ON p.code=i.plan_code
       WHERE a.id=$1 AND i.status IN ('pending','in_process','authorized') AND i.provider<>'manual'
       ORDER BY i.created_at DESC LIMIT 5`,
      [accountId],
    )
  ).rows
  if (!intents.length) return { checked: true, updated: false }
  const env = (await resolvePay(db, platformEnv, intents[0].trainer_id)).env
  if (!env?.MERCADO_PAGO_ACCESS_TOKEN) return { checked: false, updated: false }
  let updated = false
  for (const intent of intents) {
    try {
      const payment = await officialPaymentForIntent(intent, env)
      if (!payment) continue
      if (payment.status === 'approved') {
        await approvePayment(db, intent, payment, String(payment.id || ''))
        updated = true
        continue
      }
      const status = ['pending', 'in_process', 'authorized', 'rejected', 'cancelled'].includes(
        payment.status,
      )
        ? payment.status
        : 'pending'
      await db.query(
        `UPDATE payment_intents SET status=$2,provider_reference=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [intent.id, status, String(payment.id || intent.provider_reference || '')],
      )
    } catch (error) {
      console.error('Não foi possível reconciliar o pagamento.', intent.id, error)
    }
  }
  return { checked: true, updated }
}

export async function mercadoPagoWebhook(request, env, db) {
  const url = new URL(request.url)
  const body = await request.json().catch(() => ({}))
  const paymentId = String(url.searchParams.get('data.id') || body?.data?.id || '')
  if (!/^\d{1,30}$/u.test(paymentId)) return { error: 'Notificação inválida.', status: 400 }
  if (!(await validSignature(request, env, paymentId)))
    return { error: 'Assinatura do pagamento inválida.', status: 401 }
  // Cobrança feita na conta conectada de um personal: consulta com a conta dele.
  const trainerId = String(url.searchParams.get('trainer') || '')
  const payEnv = /^[\w-]{1,64}$/u.test(trainerId) ? (await resolvePay(db, env, trainerId)).env || env : env
  const payment = await mercadoPago(`/v1/payments/${paymentId}`, payEnv)
  const intent = (
    await db.query(
      `SELECT i.*, p.access_type AS "accessType" FROM payment_intents i
       JOIN plans p ON p.code=i.plan_code WHERE i.id=$1 LIMIT 1`,
      [String(payment.external_reference || '')],
    )
  ).rows[0]
  if (!intent) {
    // Cobrança da assinatura de um personal (planos da plataforma).
    const { saasWebhook } = await import('./saas.js')
    if (await saasWebhook(db, payment, env)) return { data: { accepted: true } }
    return { error: 'Cobrança não encontrada.', status: 404 }
  }
  if (payment.status !== 'approved') {
    // Dinheiro devolvido ou contestado depois de aprovado: o acesso sai junto.
    const reversed = ['refunded', 'charged_back'].includes(payment.status) && intent.status === 'approved'
    const queries = [
      {
        sql: `UPDATE payment_intents SET status=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        values: [intent.id, String(payment.status || 'pending')],
      },
    ]
    if (reversed)
      queries.push(
        {
          sql: `UPDATE students SET access_status='paused', payment_status='refunded', status='Pausado',
                  access_expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND trainer_id=$2`,
          values: [intent.student_id, intent.trainer_id],
        },
        {
          sql: `INSERT INTO access_history (trainer_id,student_id,action,plan_code,details) VALUES ($1,$2,$3,$4,$5)`,
          values: [
            intent.trainer_id,
            intent.student_id,
            'payment_reversed',
            intent.plan_code,
            payment.status === 'charged_back' ? 'Pagamento contestado no cartão' : 'Pagamento estornado',
          ],
        },
      )
    await db.batch(queries)
    return { data: { accepted: true } }
  }
  try {
    await approvePayment(db, intent, payment, paymentId)
  } catch (error) {
    return { error: error.message, status: 400 }
  }
  return { data: { accepted: true } }
}
