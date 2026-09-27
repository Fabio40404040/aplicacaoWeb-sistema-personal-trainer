const BILLING_CYCLES = {
  monthly: { days: 30, months: 1, discount: 1 },
  quarterly: { days: 90, months: 3, discount: 0.95 },
  semiannual: { days: 180, months: 6, discount: 0.9 },
  annual: { days: 365, months: 12, discount: 0.85 },
}

function normalizeBillingCycle(plan, requested) {
  if (plan.accessType === 'permanent') return 'permanent'
  return BILLING_CYCLES[requested] ? requested : 'quarterly'
}

function amountFor(plan, billingCycle) {
  if (plan.accessType === 'permanent') return Number(plan.priceCents)
  const cycle = BILLING_CYCLES[billingCycle] || BILLING_CYCLES.quarterly
  return Math.round(Number(plan.priceCents) * cycle.months * cycle.discount)
}

function expiryFor(plan, requested, billingCycle) {
  if (plan.accessType === 'permanent') return null
  if (requested) {
    const parsed = new Date(requested)
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now())
      return parsed.toISOString()
  }
  const result = new Date()
  result.setUTCDate(
    result.getUTCDate() + (BILLING_CYCLES[billingCycle]?.days || Number(plan.durationDays || 30)),
  )
  return result.toISOString()
}

export async function updateStudentAccess(db, trainerId, studentId, body) {
  const currentStudent = (
    await db.query(
      `SELECT account_id AS "accountId", payment_status AS "paymentStatus"
       FROM students WHERE id=$2 AND trainer_id=$1`,
      [trainerId, studentId],
    )
  ).rows[0]
  if (!currentStudent) return { error: 'Aluno não encontrado.', status: 404 }
  const planCode = String(body?.planCode || 'basic')
  const plan = (
    await db.query(
      `SELECT code, name, price_cents AS "priceCents", access_type AS "accessType", duration_days AS "durationDays"
       FROM plans WHERE code=$1 AND active=1`,
      [planCode],
    )
  ).rows[0]
  if (!plan) return { error: 'Plano inválido.', status: 400 }
  const billingCycle = normalizeBillingCycle(plan, body?.billingCycle)
  const accessStatus = ['active', 'pending', 'paused', 'cancelled'].includes(body?.accessStatus)
    ? body.accessStatus
    : 'active'
  const paymentStatus = ['paid', 'pending', 'refunded'].includes(body?.paymentStatus)
    ? body.paymentStatus
    : 'paid'
  const paymentMethod = String(body?.paymentMethod || 'manual')
  const active = accessStatus === 'active' && paymentStatus === 'paid'
  const expiresAt = active ? expiryFor(plan, body?.expiresAt, billingCycle) : null
  const updated = (
    await db.query(
      `UPDATE students SET plan_code=$3, access_type=$4, billing_cycle=$5, access_status=$6, access_expires_at=$7,
       payment_status=$8, payment_method=$9, authorized_at=CASE WHEN $6='active' THEN CURRENT_TIMESTAMP ELSE authorized_at END,
       status=CASE WHEN $6='active' THEN 'Ativo' ELSE 'Pausado' END, updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND trainer_id=$1
       RETURNING id, name, email, plan_code AS "planCode", access_type AS "accessType",
         billing_cycle AS "billingCycle", access_status AS "accessStatus", access_expires_at AS "accessExpiresAt",
         payment_status AS "paymentStatus", payment_method AS "paymentMethod"`,
      [
        trainerId,
        studentId,
        plan.code,
        plan.accessType,
        billingCycle,
        accessStatus,
        expiresAt,
        paymentStatus,
        paymentMethod,
      ],
    )
  ).rows[0]
  if (!updated) return { error: 'Aluno não encontrado.', status: 404 }
  const queries = [
    {
      sql: `INSERT INTO access_history (trainer_id, student_id, action, plan_code, details) VALUES ($1,$2,$3,$4,$5)`,
      values: [
        trainerId,
        studentId,
        active ? 'access_activated' : `access_${accessStatus}`,
        plan.code,
        `${paymentMethod}:${billingCycle}`,
      ],
    },
  ]
  if (paymentStatus === 'paid') {
    queries.push({
      sql: `INSERT INTO payments (trainer_id, student_id, plan_code, amount_cents, status, method, provider, paid_at, billing_cycle)
            VALUES ($1,$2,$3,$4,'paid',$5,'manual',CURRENT_TIMESTAMP,$6)`,
      values: [
        trainerId,
        studentId,
        plan.code,
        amountFor(plan, billingCycle),
        paymentMethod,
        billingCycle,
      ],
    })
  }
  await db.batch(queries)
  return { data: updated }
}

export async function paymentWebhook(request, env, db) {
  if (!env.PAYMENT_WEBHOOK_SECRET)
    return { error: 'Pagamento online ainda não foi configurado.', status: 503 }
  if (request.headers.get('X-Payment-Secret') !== env.PAYMENT_WEBHOOK_SECRET)
    return { error: 'Assinatura de pagamento inválida.', status: 401 }
  const body = await request.json()
  if (body?.status !== 'paid') return { data: { accepted: true } }
  const plan = (
    await db.query(
      `SELECT code, price_cents AS "priceCents", access_type AS "accessType", duration_days AS "durationDays"
       FROM plans WHERE code=$1 AND active=1`,
      [body.planCode],
    )
  ).rows[0]
  const student = (
    await db.query(
      `SELECT s.id, s.trainer_id AS "trainerId" FROM student_accounts a JOIN students s ON s.id=a.student_id
       WHERE lower(a.email)=lower($1) LIMIT 1`,
      [body.email || ''],
    )
  ).rows[0]
  const billingCycle = normalizeBillingCycle(plan || {}, body.billingCycle)
  if (!plan || !student || Number(body.amountCents) !== amountFor(plan, billingCycle))
    return { error: 'Pagamento não corresponde ao aluno e plano informados.', status: 400 }
  const expiresAt = expiryFor(plan, null, billingCycle)
  await db.batch([
    {
      sql: `UPDATE students SET plan_code=$3, access_type=$4, billing_cycle=$5, access_status='active', access_expires_at=$6,
            payment_status='paid', payment_method='webapp', authorized_at=CURRENT_TIMESTAMP,
            status='Ativo', updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND trainer_id=$1`,
      values: [student.trainerId, student.id, plan.code, plan.accessType, billingCycle, expiresAt],
    },
    {
      sql: `INSERT INTO payments (trainer_id, student_id, plan_code, amount_cents, status, method, provider,
            provider_reference, paid_at, billing_cycle) VALUES ($1,$2,$3,$4,'paid','webapp',$5,$6,CURRENT_TIMESTAMP,$7)
            ON CONFLICT(provider_reference) DO NOTHING`,
      values: [
        student.trainerId,
        student.id,
        plan.code,
        amountFor(plan, billingCycle),
        body.provider || 'provider',
        body.providerReference,
        billingCycle,
      ],
    },
    {
      sql: `INSERT INTO access_history (trainer_id, student_id, action, plan_code, details)
            VALUES ($1,$2,'payment_confirmed',$3,$4)`,
      values: [student.trainerId, student.id, plan.code, body.provider || 'provider'],
    },
  ])
  return { data: { accepted: true } }
}
