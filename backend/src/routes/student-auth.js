import { activateTrainer } from './student-links.js'
import { notifyNewStudent, sendStudentWelcome, trainerEmailVerified } from './account-emails.js'
import { seatProblem } from './saas.js'
import { trainerIdForSlug, trainerSellsPlan } from './site.js'
import { readJson } from '../lib/http.js'
import { createSession, hashPassword, isStrongPassword, verifyPassword } from '../lib/session.js'

const PLAN_CODES = new Set(['ready', 'basic', 'premium', 'athlete'])
const BILLING_CYCLES = new Set(['monthly', 'quarterly', 'semiannual', 'annual'])

export async function studentAuth(request, env, db, action) {
  const body = await readJson(request)
  const { email, password, name } = body || {}
  if (
    typeof email !== 'string' ||
    email.length > 180 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length > 128 ||
    password.length < 8
  ) {
    return { error: 'Informe um e-mail válido e uma senha de 8 a 128 caracteres.', status: 400 }
  }
  let account
  if (action === 'register') {
    if (!isStrongPassword(password))
      return {
        error:
          'A senha deve ter no mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial.',
        status: 400,
      }
    if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 140)
      return { error: 'Informe seu nome completo.', status: 400 }
    // LGPD: dados de saúde exigem consentimento explícito.
    if (body.acceptPrivacy !== true && body.acceptPrivacy !== 'on' && body.acceptPrivacy !== 'true')
      return {
        error: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.',
        status: 400,
      }
    // Cadastro feito na página de um personal (/p/<slug>) cai para ele; pelo
    // site principal, para o dono.
    const siteSlug = typeof body.site === 'string' ? body.site.trim().toLowerCase() : ''
    if (siteSlug && !/^[a-z0-9-]{3,30}$/u.test(siteSlug))
      return { error: 'Página do personal não encontrada. Abra de novo o link que ele enviou.', status: 404 }
    // Pela página principal (vitrine) ninguém vira aluno: o cadastro é sempre
    // na página de um personal, para o aluno cair com o personal certo.
    if (!siteSlug)
      return {
        error: 'O cadastro de aluno é feito pela página do seu personal. Abra o link que ele enviou para você.',
        status: 400,
      }
    const trainerId = await trainerIdForSlug(db, siteSlug)
    const trainer = trainerId ? { id: trainerId } : null
    if (!trainer)
      return {
        error: siteSlug
          ? 'Página do personal não encontrada. Abra de novo o link que ele enviou.'
          : 'O cadastro ainda não foi habilitado pelo personal.',
        status: siteSlug ? 404 : 503,
      }
    // A página de demonstração é aberta a todos: ninguém se cadastra nela de
    // verdade (os dados ficariam visíveis a qualquer visitante).
    if (trainer.id === 'demo-trainer' || siteSlug === 'demo')
      return {
        error:
          'Esta é uma página de demonstração: o cadastro fica desativado aqui. Para ver a área do aluno, volte à página inicial e toque em "Ver como o aluno usa".',
        status: 403,
      }
    // Personal ainda não confirmou o e-mail: a página está em preparação.
    if (!(await trainerEmailVerified(db, trainer.id)))
      return {
        error: 'Esta página ainda está em preparação: os cadastros abrem assim que o personal concluir a ativação. Tente de novo mais tarde.',
        status: 403,
      }
    const noSeat = await seatProblem(db, { trainerId: trainer.id })
    if (noSeat) return { error: noSeat, status: 403 }
    const planCode = PLAN_CODES.has(body.planCode) ? body.planCode : 'basic'
    if (!(await trainerSellsPlan(db, trainer.id, planCode)))
      return { error: 'Este plano não está disponível com este personal. Escolha outro plano.', status: 400 }
    const paymentChannel = ['webapp', 'whatsapp', 'pix', 'credit_card'].includes(
      body.paymentChannel,
    )
      ? body.paymentChannel
      : 'whatsapp'
    const accessType = planCode === 'ready' ? 'permanent' : 'subscription'
    const billingCycle =
      planCode === 'ready'
        ? 'permanent'
        : BILLING_CYCLES.has(body.billingCycle)
          ? body.billingCycle
          : 'quarterly'
    const result = await db.query(
      `INSERT INTO student_accounts (name, email, password_hash, trainer_id, requested_plan_code, requested_payment_channel, requested_billing_cycle)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING
       RETURNING id, name, email, auth_version AS "authVersion"`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        await hashPassword(password),
        trainer.id,
        planCode,
        paymentChannel,
        billingCycle,
      ],
    )
    account = result.rows[0]
    try {
      // Só a conta criada agora recebe o aceite (nunca a de outra pessoa com o mesmo e-mail).
      if (account)
        await db.query(
          `UPDATE student_accounts SET privacy_accepted_at=CURRENT_TIMESTAMP, privacy_version='2026-10'
           WHERE id=$1`,
          [account.id],
        )
    } catch {
      /* sem a migração 026 */
    }
    let resumedPendingRegistration = false
    // Aluno que já tem conta (com outro personal) se cadastra com mais um.
    let linkingExisting = false
    if (!account) {
      const found = (
        await db.query(
          `SELECT a.id,a.name,a.email,a.password_hash,a.auth_version AS "authVersion"
           FROM student_accounts a WHERE lower(a.email)=lower($1) LIMIT 1`,
          [email.trim()],
        )
      ).rows[0]
      if (!found || !(await verifyPassword(password, found.password_hash)))
        return {
          error: 'Este e-mail já tem conta de aluno na FARISA. Use a mesma senha que você já usa (ou “Esqueci minha senha”).',
          status: 409,
        }
      // Cadastro com ESTE personal (se já existir).
      const here = (
        await db.query(
          `SELECT plan_code AS "planCode", billing_cycle AS "billingCycle", payment_status AS "paymentStatus"
           FROM students WHERE account_id=$1 AND trainer_id=$2 LIMIT 1`,
          [found.id, trainer.id],
        )
      ).rows[0]
      const existing = { ...found, ...(here || {}) }
      if (!here) {
        account = found
        linkingExisting = true
      } else if (['paid', 'waived'].includes(existing.paymentStatus))
        return { error: 'Este e-mail já possui cadastro. Entre na sua conta.', status: 409 }
      if (here && (existing.planCode !== planCode || existing.billingCycle !== billingCycle))
        return {
          error: 'Existe um pagamento pendente para outro plano. Conclua essa contratação ou fale com o personal.',
          status: 409,
        }
      if (here) {
        await db.batch([
          {
            sql: `UPDATE student_accounts SET requested_payment_channel=$2 WHERE id=$1`,
            values: [existing.id, paymentChannel],
          },
          {
            sql: `UPDATE students SET payment_method=$2,updated_at=CURRENT_TIMESTAMP WHERE account_id=$1 AND trainer_id=$3 AND payment_status='pending'`,
            values: [existing.id, paymentChannel, trainer.id],
          },
        ])
        await activateTrainer(db, existing.id, trainer.id)
        account = existing
        resumedPendingRegistration = true
      }
    }
    if (!resumedPendingRegistration) {
      try {
        const student = (
          await db.query(
            `INSERT INTO students (trainer_id, name, email, goal, status, account_id, access_status, plan_code,
               access_type, payment_status, payment_method, billing_cycle)
             VALUES ($1,$2,$3,'A definir','Pausado',$4,'pending',$5,$6,'pending',$7,$8)
             RETURNING id`,
            [
              trainer.id,
              account.name,
              account.email,
              account.id,
              planCode,
              accessType,
              paymentChannel,
              billingCycle,
            ],
          )
        ).rows[0]
        // Este personal passa a ser o ativo na área do aluno.
        await db.query('UPDATE student_accounts SET student_id=$2, trainer_id=$3 WHERE id=$1', [
          account.id,
          student.id,
          trainer.id,
        ])
        if (!linkingExisting) {
          // Conta nova: e-mail ainda não confirmado; boas-vindas ao aluno.
          try {
            await db.query('UPDATE student_accounts SET email_verified_at=NULL WHERE id=$1', [account.id])
          } catch {
            // sem a migração 036
          }
          await sendStudentWelcome(db, account, trainer.id)
        }
        const planName = (await db.query('SELECT name FROM plans WHERE code=$1', [planCode])).rows[0]?.name
        await notifyNewStudent(db, trainer.id, account, planName).catch(() => {})
      } catch (error) {
        // Só apaga a conta se ela acabou de ser criada (nunca a que já existia).
        if (!linkingExisting) await db.query('DELETE FROM student_accounts WHERE id=$1', [account.id])
        throw error
      }
    }
  } else {
    const result = await db.query(
      `SELECT a.id,a.name,a.email,a.password_hash,a.auth_version AS "authVersion",
         s.payment_status AS "paymentStatus"
       FROM student_accounts a LEFT JOIN students s ON s.id=a.student_id
       WHERE lower(a.email)=lower($1) LIMIT 1`,
      [email.trim()],
    )
    account = result.rows[0]
    if (!account || !(await verifyPassword(password, account.password_hash)))
      return { error: 'E-mail ou senha incorretos.', status: 401 }
    // Entrou pela página de um dos personais dele: esse fica ativo.
    const site = typeof body.site === 'string' ? body.site.trim().toLowerCase() : ''
    if (/^[a-z0-9-]{3,30}$/u.test(site)) {
      const siteTrainer = await trainerIdForSlug(db, site).catch(() => null)
      if (siteTrainer) await activateTrainer(db, account.id, siteTrainer).catch(() => false)
    }
  }
  return {
    data: {
      token: await createSession(
        { ...account, auth_version: account.authVersion || 0 },
        env,
        'student',
      ),
      user: { id: account.id, name: account.name, email: account.email },
      registrationStatus: ['paid', 'waived'].includes(account.paymentStatus) ? 'complete' : 'awaiting_payment',
    },
    status: action === 'register' ? 201 : 200,
  }
}
