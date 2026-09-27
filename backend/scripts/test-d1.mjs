import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { withDb } from '../src/lib/db.js'
import { createResource, updateResource, deleteResource } from '../src/routes/resources.js'
import { dashboard } from '../src/routes/dashboard.js'
import { studentRecovery } from '../src/routes/student-recovery.js'
import { personalRecovery } from '../src/routes/personal-recovery.js'

// SQLite contract check; the live Wrangler registration test covers D1 itself.
const sqlite = new DatabaseSync(':memory:')
const migrationsDirectory = new URL('../migrations-d1/', import.meta.url)
for (const file of readdirSync(migrationsDirectory).filter((name) => name.endsWith('.sql')).sort()) {
  sqlite.exec(readFileSync(new URL(`../migrations-d1/${file}`, import.meta.url), 'utf8'))
}
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
      const results = statements.map((s) => s.all())
      sqlite.exec('COMMIT')
      return results
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  },
}
await withDb({ DB: binding }, async (db) => {
  const trainer = (
    await db.query(
      'INSERT INTO trainers (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id',
      ['Personal', 'coach@example.invalid', 'hash'],
    )
  ).rows[0]
  const other = (
    await db.query(
      'INSERT INTO trainers (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id',
      ['Outro', 'other@example.invalid', 'hash'],
    )
  ).rows[0]
  const student = await createResource(db, 'students', trainer.id, {
    name: 'Aluno',
    email: 'student@example.invalid',
    goal: 'Força',
  })
  await createResource(db, 'exercises', trainer.id, {
    name: 'Agachamento',
    group: 'Pernas',
    equipment: 'Barra',
  })
  const workout = await createResource(db, 'workouts', trainer.id, {
    student: 'Aluno',
    name: 'Treino A',
    goal: 'Força',
    duration: '4 semanas',
  })
  await createResource(db, 'assessments', trainer.id, {
    student: 'Aluno',
    weight: 80,
    fat: 18,
    waist: 85,
  })
  const appointment = await createResource(db, 'appointments', trainer.id, {
    student: 'Aluno',
    startsAt: '2026-09-20T13:00:00.000Z',
    endsAt: '2026-09-20T14:00:00.000Z',
    service: 'Avaliação física',
    status: 'scheduled',
  })
  const data = await dashboard(db, trainer.id)
  assert.equal(data.students[0].workout, 'Treino A')
  assert.equal(data.assessments.length, 1)
  assert.equal(data.exercises.length, 1)
  assert.equal(data.appointments.length, 1)
  assert.equal((await dashboard(db, other.id)).students.length, 0)
  assert.equal(
    await updateResource(db, 'students', other.id, student.id, {
      name: 'Bad',
      email: 'bad@example.invalid',
      goal: 'Força',
    }),
    null,
  )
  await updateResource(db, 'workouts', trainer.id, workout.id, {
    student: 'Aluno',
    name: 'Treino B',
    goal: 'Força',
    duration: '8 semanas',
  })
  assert.equal((await dashboard(db, trainer.id)).workouts[0].name, 'Treino B')
  await deleteResource(db, 'workouts', trainer.id, workout.id)
  assert.equal((await dashboard(db, trainer.id)).workouts.length, 0)
  await updateResource(db, 'appointments', trainer.id, appointment.id, {
    student: 'Aluno',
    startsAt: '2026-09-20T13:00:00.000Z',
    endsAt: '2026-09-20T14:30:00.000Z',
    service: 'Atendimento presencial',
    status: 'completed',
  })
  assert.equal((await dashboard(db, trainer.id)).appointments[0].status, 'completed')
  const account = (
    await db.query(
      'INSERT INTO student_accounts (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id',
      ['Conta', 'account@example.invalid', 'hash'],
    )
  ).rows[0]
  let mail
  const env = {
    PUBLIC_SITE_URL: 'https://example.invalid',
    SESSION_SECRET: 'test-session-secret',
    PASSWORD_MAILER: {
      fetch: async (_url, options) => {
        mail = JSON.parse(options.body)
        return new Response(null, { status: 202 })
      },
    },
  }
  const req = (body) =>
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  await studentRecovery(req({ email: 'account@example.invalid' }), env, db, 'forgot')
  assert.ok(mail)
  const token = mail.text.match(/token=([a-f0-9]{64})/u)[1]
  const reset = await studentRecovery(req({ token, password: 'Nova@Senha2026' }), env, db, 'reset')
  assert.match(reset.data.message, /Senha alterada/u)
  assert.equal(
    (await db.query('SELECT auth_version FROM student_accounts WHERE id=$1', [account.id])).rows[0]
      .auth_version,
    1,
  )
  assert.equal(
    (await studentRecovery(req({ token, password: 'Nova@Senha2026' }), env, db, 'reset')).status,
    400,
  )
  assert.equal((await db.query('SELECT * FROM student_password_resets')).rows.length, 0)

  mail = null
  await personalRecovery(req({ email: 'coach@example.invalid' }), env, db, 'forgot')
  assert.ok(mail)
  const personalToken = mail.text.match(/token=([a-f0-9]{64})/u)[1]
  const personalReset = await personalRecovery(
    req({ token: personalToken, password: 'Personal@2026' }),
    env,
    db,
    'reset',
  )
  assert.match(personalReset.data.message, /Senha alterada/u)
  assert.ok(personalReset.data.token)
  assert.equal(
    (await db.query('SELECT auth_version FROM trainers WHERE id=$1', [trainer.id])).rows[0]
      .auth_version,
    1,
  )
  assert.equal((await db.query('SELECT * FROM trainer_password_resets')).rows.length, 0)

  await db.query('INSERT INTO student_accounts (name,email,password_hash) VALUES ($1,$2,$3)', [
    'Conta Brevo',
    'brevo@example.invalid',
    'hash',
  ])
  let brevoRequest
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    brevoRequest = { url, options }
    return new Response(JSON.stringify({ messageId: 'email-id' }), {
      status: 201,
    })
  }
  try {
    await studentRecovery(
      req({ email: 'brevo@example.invalid' }),
      {
        PUBLIC_SITE_URL: 'https://example.invalid',
        BREVO_API_KEY: 'xkeysib-test',
        EMAIL_FROM: 'coach@example.invalid',
        BREVO_FROM_NAME: 'FARISA Personal Trainer',
      },
      db,
      'forgot',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(brevoRequest.url, 'https://api.brevo.com/v3/smtp/email')
  assert.equal(brevoRequest.options.headers['api-key'], 'xkeysib-test')
  assert.equal(JSON.parse(brevoRequest.options.body).to[0].email, 'brevo@example.invalid')
})
sqlite.close()
console.log('D1 SQL: migrations, CRUD, ownership, dashboard and password reset batch passed.')
