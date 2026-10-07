// Testes automáticos do servidor (sem banco nem internet): node --test tests/
// Rodar: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from '../backend/src/lib/http.js'
import { isDemoEmail } from '../backend/src/lib/demo.js'
import { attemptKeys } from '../backend/src/lib/rate-limit.js'
import { createSession, hashPassword, isStrongPassword, readSession, sessionSignature, verifyPassword } from '../backend/src/lib/session.js'
import { useEnv } from '../backend/src/lib/notify.js'
import { antifraud } from '../backend/src/routes/payments.js'
import { runBillingNotices, sendSaasReceipt } from '../backend/src/routes/billing-notices.js'
import { notifyPixToCheck, runStudentNotices } from '../backend/src/routes/account-emails.js'

const env = { SESSION_SECRET: 'segredo-de-teste-com-32-caracteres!!', BREVO_API_KEY: 'k', EMAIL_FROM: 'f@x.com', PUBLIC_SITE_URL: 'https://site.example/' }
const json = (body) => new Request('http://x/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('senha: regra de força, hash e conferência', async () => {
  assert.equal(isStrongPassword('Senha@12345'), true)
  assert.equal(isStrongPassword('fraca'), false)
  const hash = await hashPassword('Senha@12345')
  assert.equal(await verifyPassword('Senha@12345', hash), true)
  assert.equal(await verifyPassword('Outra@12345', hash), false)
})

test('sessão: token válido é lido, adulterado é recusado', async () => {
  const token = await createSession({ id: 't1', email: 'a@b.com', auth_version: 2 }, env)
  const request = (value) => new Request('http://x', { headers: { Authorization: `Bearer ${value}` } })
  const session = await readSession(request(token), env)
  assert.equal(session.sub, 't1')
  assert.equal(session.version, 2)
  assert.ok(sessionSignature(request(token)).length > 20)
  assert.equal(await readSession(request(`${token}x`), env), null)
  assert.equal(await readSession(request(token), { SESSION_SECRET: 'outro-segredo-diferente-123456789' }), null)
})

test('entrada: textos gigantes são cortados, imagens em data: não', async () => {
  const body = await readJson(json({ nome: 'a'.repeat(50_000), foto: `data:image/png;base64,${'b'.repeat(50_000)}`, lista: [{ nota: 'c'.repeat(20_000) }] }))
  assert.equal(body.nome.length, 10_000)
  assert.equal(body.lista[0].nota.length, 10_000)
  assert.ok(body.foto.length > 50_000)
  await assert.rejects(readJson(new Request('http://x', { method: 'POST', body: 'x' })))
})

test('tentativas: chaves por conta e por aparelho', () => {
  const request = new Request('http://x', { headers: { 'CF-Connecting-IP': '1.2.3.4' } })
  const keys = attemptKeys(request, 'auth/login', ' Ana@X.com ')
  assert.equal(keys.account, 'auth/login:ana@x.com')
  assert.equal(keys.ip, 'auth/login:ip:1.2.3.4')
})

test('demonstração: reconhece os e-mails demo', () => {
  assert.equal(isDemoEmail('DEMO@farisa.example'), true)
  assert.equal(isDemoEmail('alguem@gmail.com'), false)
})

test('antifraude: separa nome, limpa símbolos e valida o aparelho', () => {
  const extra = antifraud({ cardholderName: ' FABIO  R. dos Santos <x>1', deviceId: 'armor.abc123:xyz-99' }, { id: 'unlimited', title: 'FARISA Ilimitado', amountCents: 4990 })
  assert.deepEqual(extra.person, { first_name: 'FABIO', last_name: 'R. dos Santos x' })
  assert.equal(extra.headers['X-meli-session-id'], 'armor.abc123:xyz-99')
  assert.equal(extra.additionalInfo.items[0].unit_price, 49.9)
  assert.deepEqual(antifraud({ deviceId: '<script>' }, { id: 'a', title: 'b', amountCents: 100 }).headers, {})
})

// ---------- e-mails: banco e envio simulados
function fakeDb(trainers) {
  const notices = new Set()
  const log = []
  return {
    log,
    async batch() {
      return []
    },
    async query(sql, values = []) {
      if (sql.includes('INSERT INTO job_runs')) return { rows: [{ name: 'x' }] }
      if (sql.includes('FROM trainers t JOIN saas_plans')) return { rows: trainers }
      if (sql.includes('FROM saas_plans WHERE price_cents=0')) return { rows: [{ code: 'free', limit: 5 }] }
      if (sql.includes('INSERT INTO saas_notices')) {
        const key = values.join('|')
        if (notices.has(key)) return { rows: [] }
        notices.add(key)
        return { rows: [{ trainer_id: values[0] }] }
      }
      if (sql.includes('SELECT 1 AS x FROM saas_notices')) return { rows: notices.has([values[0], 'expired', values[1]].join('|')) ? [{ x: 1 }] : [] }
      if (sql.includes('UPDATE trainers')) log.push(`rebaixou ${values[0]}`)
      if (sql.includes('FROM saas_payment_intents')) return { rows: [{ id: 'saas_1', amountCents: 4990, method: 'pix', trainerId: 'a', name: 'Carla', email: 'a@x.com', expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(), planName: 'Ilimitado' }] }
      if (sql.includes('FROM trainers t LEFT JOIN trainer_site')) return { rows: [{ id: 't1', name: 'Carla Souza', email: 'carla@x.com', slug: 'carla-fit', brand: 'Carla Fit' }] }
      if (sql.includes('FROM payment_intents i')) return { rows: [{ trainerId: 't1', amountCents: 9990, name: 'João <b>Silva</b>' }] }
      if (sql.includes("s.access_status='active'")) return { rows: [{ id: 's1', name: 'João', trainerId: 't1', expiresAt: new Date(Date.now() + 3 * 864e5).toISOString(), email: 'joao@x.com', planName: 'Básica' }] }
      return { rows: [] }
    },
  }
}
const iso = (days) => new Date(Date.now() + days * 864e5).toISOString()

test('assinatura: avisos de 7 dias, 24 h e vencido saem uma vez só', async (t) => {
  const mails = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    mails.push(JSON.parse(options.body))
    return { ok: true }
  })
  useEnv(env)
  const db = fakeDb([
    { id: 'a', name: 'Carla', email: 'a@x.com', expiresAt: iso(5), planName: 'Ilimitado', priceCents: 4990 },
    { id: 'b', name: 'Bruno', email: 'b@x.com', expiresAt: iso(0.4), planName: 'Ilimitado', priceCents: 4990 },
    { id: 'c', name: 'Ana', email: 'c@x.com', expiresAt: iso(-0.1), planName: 'Ilimitado', priceCents: 4990 },
    { id: 'd', name: 'Longe', email: 'd@x.com', expiresAt: iso(20), planName: 'Ilimitado', priceCents: 4990 },
    { id: 'e', name: 'Demo', email: 'demo@farisa.example', expiresAt: iso(-1), planName: 'Ilimitado', priceCents: 4990 },
  ])
  const first = await runBillingNotices(env, db)
  assert.deepEqual(first.sent, { week: 1, tomorrow: 1, expired: 1 })
  assert.deepEqual(db.log, ['rebaixou c'])
  const before = mails.length
  const second = await runBillingNotices(env, db, { force: true })
  assert.deepEqual(second.sent, { week: 0, tomorrow: 0, expired: 0 })
  // Só o aviso do aluno (que usa outra tabela simulada) pode sair de novo aqui.
  assert.ok(mails.length - before <= 1)
  assert.ok(mails.every((mail) => mail.to[0].email !== 'demo@farisa.example'))
})

test('assinatura: recibo não duplica', async (t) => {
  const mails = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    mails.push(JSON.parse(options.body))
    return { ok: true }
  })
  const db = fakeDb([])
  await sendSaasReceipt(env, db, 'saas_1')
  await sendSaasReceipt(env, db, 'saas_1')
  assert.equal(mails.length, 1)
  assert.match(mails[0].subject, /Pagamento confirmado/u)
})

test('e-mails: nome do aluno não vira HTML e aviso de vencimento sai', async (t) => {
  const mails = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    mails.push(JSON.parse(options.body))
    return { ok: true }
  })
  useEnv(env)
  const db = fakeDb([])
  await notifyPixToCheck(db, 'i1')
  assert.equal(mails[0].htmlContent.includes('<b>Silva'), false)
  assert.deepEqual(await runStudentNotices(db), { week: 1, tomorrow: 0 })
  assert.match(mails[1].subject, /vence em 3 dias/u)
})
