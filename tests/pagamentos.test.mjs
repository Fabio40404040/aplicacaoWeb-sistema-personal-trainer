// Testes automáticos dos pagamentos (banco SQLite na memória com todas as
// migrações, Mercado Pago simulado — nenhum dinheiro de verdade).
// Rodar: npm test
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { withDb } from '../backend/src/lib/db.js'
import { createCardPayment, mercadoPagoWebhook, trainerRefundStudent } from '../backend/src/routes/payments.js'
import { seal } from '../backend/src/routes/payout.js'
import { approveSaasPayment, saasWebhook } from '../backend/src/routes/saas.js'

const DAY = 86_400_000
const env = { SESSION_SECRET: 'segredo-de-teste-com-32-caracteres!!', MERCADO_PAGO_ACCESS_TOKEN: 'PLATAFORMA', MERCADO_PAGO_PUBLIC_KEY: 'pk' }

// Banco novo para cada teste, montado pelas migrações de verdade.
function newDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  const folder = new URL('../backend/migrations-d1/', import.meta.url)
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(file, folder), 'utf8'))
  const binding = {
    prepare(sql) {
      let values = []
      return {
        bind(...args) {
          values = args
          return this
        },
        all() {
          return { results: sqlite.prepare(sql).all(...values) }
        },
      }
    },
    batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map((statement) => statement.all())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { sqlite, run: (work) => withDb({ DB: binding }, work) }
}

const one = (sqlite, sql, ...values) => sqlite.prepare(sql).get(...values)

// Mercado Pago simulado: responde pagamento e estorno, e anota as chamadas.
function fakeMercadoPago(payment) {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push(`${options.method || 'GET'} ${String(url).replace('https://api.mercadopago.com', '')}`)
    if (String(url).endsWith('/refunds')) {
      payment.status = 'refunded'
      return new Response('{}', { status: 201 })
    }
    if (options.method === 'POST') Object.assign(payment, { id: 777, external_reference: JSON.parse(options.body).external_reference })
    return new Response(JSON.stringify(payment), { status: 200 })
  }
  return calls
}

function seedStudent(sqlite) {
  sqlite.exec(`
    INSERT INTO trainers (id,name,email,password_hash,saas_plan_code,email_verified_at) VALUES ('t1','Personal','p@x.invalid','h','unlimited',CURRENT_TIMESTAMP);
    INSERT INTO trainers (id,name,email,password_hash,email_verified_at) VALUES ('t2','Outro','o@x.invalid','h',CURRENT_TIMESTAMP);
    INSERT INTO trainer_payout (trainer_id,mode) VALUES ('t1','platform') ON CONFLICT(trainer_id) DO UPDATE SET mode='platform';
    INSERT INTO students (id,trainer_id,name,email,goal,plan_code,billing_cycle,access_status,payment_status)
      VALUES ('s1','t1','Aluno','a@x.invalid','Força','basic','monthly','pending','pending');
    INSERT INTO student_accounts (id,name,email,password_hash,trainer_id,student_id) VALUES ('acc1','Aluno','a@x.invalid','h','t1','s1');
    UPDATE students SET account_id='acc1' WHERE id='s1';
  `)
}

const card = { token: 'tok_1234567890', paymentMethodId: 'visa', installments: 1, identificationType: 'CPF', identificationNumber: '12345678909' }

test('aluno: cartão aprovado na hora libera o acesso uma vez só', async () => {
  const { sqlite, run } = newDatabase()
  seedStudent(sqlite)
  fakeMercadoPago({ status: 'approved', currency_id: 'BRL', transaction_amount: 99.9, payment_type_id: 'credit_card' })
  const result = await run((db) => createCardPayment(db, 'acc1', env, card))
  assert.equal(result.data?.status, 'approved', JSON.stringify(result))
  const student = one(sqlite, "SELECT access_status, payment_status, access_expires_at FROM students WHERE id='s1'")
  assert.equal(student.access_status, 'active')
  assert.equal(student.payment_status, 'paid')
  const days = Math.round((Date.parse(student.access_expires_at) - Date.now()) / DAY)
  assert.equal(days, 30)
  assert.equal(one(sqlite, "SELECT status FROM payment_intents").status, 'approved')
  assert.equal(one(sqlite, "SELECT COUNT(*) AS n FROM payments WHERE status='paid'").n, 1)
})

test('aluno: personal estorna pelo painel e o acesso é pausado', async () => {
  const { sqlite, run } = newDatabase()
  seedStudent(sqlite)
  const payment = { status: 'approved', currency_id: 'BRL', transaction_amount: 99.9, payment_type_id: 'credit_card' }
  fakeMercadoPago(payment)
  await run((db) => createCardPayment(db, 'acc1', env, card))
  // Agora o personal recebe na conta Mercado Pago dele (como quem tem o botão Estornar).
  sqlite.exec("UPDATE trainer_payout SET mode='mercadopago' WHERE trainer_id='t1'")
  sqlite.prepare("UPDATE trainer_payout SET mp_access_token=? WHERE trainer_id='t1'").run(await seal(env, 'TOKEN-DO-PERSONAL'))
  const paymentId = one(sqlite, 'SELECT id FROM payments').id

  assert.equal((await run((db) => trainerRefundStudent(db, env, 't2', paymentId))).status, 404, 'outro personal não pode')
  const calls = fakeMercadoPago(payment)
  assert.deepEqual((await run((db) => trainerRefundStudent(db, env, 't1', paymentId))).data, { ok: true })
  assert.ok(calls.includes('POST /v1/payments/777/refunds'))
  assert.equal(one(sqlite, "SELECT access_status FROM students WHERE id='s1'").access_status, 'paused')
  assert.equal(one(sqlite, 'SELECT status FROM payments').status, 'refunded')
  assert.equal((await run((db) => trainerRefundStudent(db, env, 't1', paymentId))).status, 400, 'não estorna duas vezes')
})

test('aluno: aviso de estorno do Mercado Pago não desfaz duas vezes', async () => {
  const { sqlite, run } = newDatabase()
  seedStudent(sqlite)
  const payment = { status: 'approved', currency_id: 'BRL', transaction_amount: 99.9, payment_type_id: 'credit_card' }
  fakeMercadoPago(payment)
  await run((db) => createCardPayment(db, 'acc1', env, card))
  const secret = 'segredo-webhook'
  const hook = async () => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('id:777;request-id:r1;ts:1;'))).toString('hex')
    const request = new Request('https://x/api/payments/mercadopago/webhook?data.id=777', {
      method: 'POST',
      body: '{}',
      headers: { 'x-signature': `ts=1,v1=${signature}`, 'x-request-id': 'r1' },
    })
    return run((db) => mercadoPagoWebhook(request, { ...env, MERCADO_PAGO_WEBHOOK_SECRET: secret }, db))
  }
  payment.status = 'refunded'
  assert.deepEqual((await hook()).data, { accepted: true })
  assert.deepEqual((await hook()).data, { accepted: true })
  assert.equal(one(sqlite, "SELECT access_status FROM students WHERE id='s1'").access_status, 'paused')
  assert.equal(one(sqlite, "SELECT COUNT(*) AS n FROM access_history WHERE action='payment_reversed'").n, 1)
  assert.equal(one(sqlite, 'SELECT status FROM payments').status, 'refunded')
})

// ---------- assinatura do personal
function seedSaas(sqlite, count) {
  sqlite.exec("INSERT INTO trainers (id,name,email,password_hash,saas_plan_code) VALUES ('t1','Personal','p@x.invalid','h','free')")
  for (let index = 1; index <= count; index += 1)
    sqlite.exec(`INSERT INTO saas_payment_intents (id,trainer_id,plan_code,cycle,amount_cents,method) VALUES ('saas_${index}','t1','unlimited','monthly',4990,'pix')`)
}
const intentOf = (sqlite, id) => one(sqlite, 'SELECT * FROM saas_payment_intents WHERE id=?', id)
const monthsLeft = (sqlite) => Math.round((Date.parse(one(sqlite, "SELECT saas_expires_at AS e FROM trainers WHERE id='t1'").e) - Date.now()) / (30.4 * DAY))

test('assinatura: aprovação repetida soma o mês uma vez só', async () => {
  const { sqlite, run } = newDatabase()
  seedSaas(sqlite, 1)
  const payment = { status: 'approved', transaction_amount: 49.9, external_reference: 'saas_1' }
  await run((db) => approveSaasPayment(db, intentOf(sqlite, 'saas_1'), payment))
  await run((db) => approveSaasPayment(db, { ...intentOf(sqlite, 'saas_1'), status: 'pending' }, payment))
  assert.equal(one(sqlite, "SELECT saas_plan_code AS c FROM trainers WHERE id='t1'").c, 'unlimited')
  assert.equal(monthsLeft(sqlite), 1)
})

test('assinatura: estorno tira só o mês estornado', async () => {
  const { sqlite, run } = newDatabase()
  seedSaas(sqlite, 3)
  for (const id of ['saas_1', 'saas_2', 'saas_3'])
    await run((db) => approveSaasPayment(db, intentOf(sqlite, id), { status: 'approved', transaction_amount: 49.9 }))
  assert.equal(monthsLeft(sqlite), 3)
  await run((db) => saasWebhook(db, { status: 'refunded', external_reference: 'saas_2' }))
  await run((db) => saasWebhook(db, { status: 'refunded', external_reference: 'saas_2' })) // aviso repetido
  assert.equal(monthsLeft(sqlite), 2)
  assert.equal(one(sqlite, "SELECT saas_plan_code AS c FROM trainers WHERE id='t1'").c, 'unlimited')
  await run((db) => saasWebhook(db, { status: 'refunded', external_reference: 'saas_1' }))
  await run((db) => saasWebhook(db, { status: 'refunded', external_reference: 'saas_3' }))
  assert.equal(one(sqlite, "SELECT saas_plan_code AS c FROM trainers WHERE id='t1'").c, 'free', 'sem prazo pago volta para o Grátis')
})

// Disputa no cartão (in_mediation): o acesso segue até o resultado. Ganhou →
// continua com o mesmo prazo (não soma de novo); perdeu (charged_back) → sai.
async function studentWebhook(run, paymentId = '777') {
  const secret = 'segredo-webhook'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`id:${paymentId};request-id:r1;ts:1;`))).toString('hex')
  const request = new Request(`https://x/api/payments/mercadopago/webhook?data.id=${paymentId}`, {
    method: 'POST',
    body: '{}',
    headers: { 'x-signature': `ts=1,v1=${signature}`, 'x-request-id': 'r1' },
  })
  return run((db) => mercadoPagoWebhook(request, { ...env, MERCADO_PAGO_WEBHOOK_SECRET: secret }, db))
}
const daysLeft = (sqlite) =>
  Math.round((Date.parse(one(sqlite, "SELECT access_expires_at AS e FROM students WHERE id='s1'").e) - Date.now()) / DAY)

test('aluno: disputa no cartão ganha não soma o prazo de novo', async () => {
  const { sqlite, run } = newDatabase()
  seedStudent(sqlite)
  const payment = { status: 'approved', currency_id: 'BRL', transaction_amount: 99.9, payment_type_id: 'credit_card' }
  fakeMercadoPago(payment)
  await run((db) => createCardPayment(db, 'acc1', env, card))
  payment.status = 'in_mediation'
  await studentWebhook(run)
  assert.equal(one(sqlite, "SELECT access_status FROM students WHERE id='s1'").access_status, 'active', 'segue com acesso na disputa')
  assert.equal(one(sqlite, 'SELECT status FROM payment_intents').status, 'approved')
  payment.status = 'approved'
  await studentWebhook(run)
  assert.equal(daysLeft(sqlite), 30, 'não somou outro mês')
  assert.equal(one(sqlite, "SELECT COUNT(*) AS n FROM payments WHERE status='paid'").n, 1)
})

test('aluno: disputa no cartão perdida tira o acesso', async () => {
  const { sqlite, run } = newDatabase()
  seedStudent(sqlite)
  const payment = { status: 'approved', currency_id: 'BRL', transaction_amount: 99.9, payment_type_id: 'credit_card' }
  fakeMercadoPago(payment)
  await run((db) => createCardPayment(db, 'acc1', env, card))
  payment.status = 'in_mediation'
  await studentWebhook(run)
  payment.status = 'charged_back'
  await studentWebhook(run)
  assert.equal(one(sqlite, "SELECT access_status FROM students WHERE id='s1'").access_status, 'paused')
  assert.equal(one(sqlite, 'SELECT status FROM payments').status, 'refunded')
  // Registro antigo que ficou como "in_mediation" (antes da correção) também se resolve.
  sqlite.exec("UPDATE payment_intents SET status='in_mediation'")
  payment.status = 'approved'
  await studentWebhook(run)
  assert.equal(one(sqlite, 'SELECT status FROM payment_intents').status, 'approved')
  assert.equal(one(sqlite, "SELECT COUNT(*) AS n FROM payments WHERE status='paid'").n, 0, 'não aprovou de novo')
})

test('assinatura: disputa no cartão ganha mantém o prazo; perdida volta para o Grátis', async () => {
  const { sqlite, run } = newDatabase()
  seedSaas(sqlite, 1)
  await run((db) => approveSaasPayment(db, intentOf(sqlite, 'saas_1'), { status: 'approved', transaction_amount: 49.9 }))
  await run((db) => saasWebhook(db, { status: 'in_mediation', external_reference: 'saas_1' }))
  assert.equal(intentOf(sqlite, 'saas_1').status, 'approved')
  assert.equal(one(sqlite, "SELECT saas_plan_code AS c FROM trainers WHERE id='t1'").c, 'unlimited')
  await run((db) => saasWebhook(db, { status: 'approved', transaction_amount: 49.9, external_reference: 'saas_1' }))
  assert.equal(monthsLeft(sqlite), 1, 'não somou outro mês')
  await run((db) => saasWebhook(db, { status: 'in_mediation', external_reference: 'saas_1' }))
  await run((db) => saasWebhook(db, { status: 'charged_back', external_reference: 'saas_1' }))
  assert.equal(one(sqlite, "SELECT saas_plan_code AS c FROM trainers WHERE id='t1'").c, 'free')
})
