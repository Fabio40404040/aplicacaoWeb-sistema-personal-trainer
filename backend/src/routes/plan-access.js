// Regras do plano Grátis (migração 041):
//  - 30 dias com todas as ferramentas (teste completo);
//  - depois, ferramentas básicas. Ficam só nos planos pagos: pagamento
//    automático pelo Mercado Pago, marca e cor próprias, relatório de
//    avaliação em PDF, agendamento pelo aluno, check-in semanal e vídeos próprios;
//  - a vaga de um aluno apagado fica em espera por 30 dias.
// Sem a migração, nada é bloqueado.
const DAY = 86_400_000
const FULL = { full: true, inTrial: false, trialEndsAt: null, trialDaysLeft: null, ready: false }

export const LOCKED_TOOLS = [
  'Pagamento automático pelo site (cartão e Pix do Mercado Pago)',
  'Sua marca e sua cor na página',
  'Relatório de avaliação em PDF',
  'Agendamento feito pelo aluno',
  'Check-in semanal',
  'Envio de vídeos próprios',
]
export const lockedMessage = (tool) =>
  `${tool} faz parte do plano Ilimitado. Assine em Minha assinatura para liberar.`
export const STUDENT_LOCKED = 'Este recurso não está disponível no momento. Fale com o seu personal.'

export async function planAccess(db, trainerId) {
  if (!trainerId) return FULL
  try {
    const row = (
      await db.query(
        `SELECT t.saas_trial_ends_at AS "trialEndsAt", t.saas_expires_at AS "expiresAt",
           p.price_cents AS "priceCents",
           (SELECT id FROM trainers ORDER BY created_at, id LIMIT 1) AS "ownerId"
         FROM trainers t LEFT JOIN saas_plans p ON p.code=t.saas_plan_code WHERE t.id=$1`,
        [trainerId],
      )
    ).rows[0]
    if (!row) return FULL
    const paid = Number(row.priceCents) > 0 && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now())
    const trialEnd = row.trialEndsAt ? Date.parse(row.trialEndsAt) : null
    const inTrial = !paid && Boolean(trialEnd && trialEnd > Date.now())
    return {
      ready: true,
      // O dono da plataforma nunca é limitado.
      full: paid || inTrial || row.ownerId === trainerId,
      inTrial,
      trialEndsAt: paid ? null : row.trialEndsAt || null,
      trialDaysLeft: inTrial ? Math.ceil((trialEnd - Date.now()) / DAY) : null,
    }
  } catch {
    return FULL
  }
}

export const trainerLocked = async (db, trainerId) => !(await planAccess(db, trainerId)).full

// O personal do aluno está no Grátis básico?
export async function lockedForAccount(db, accountId) {
  try {
    const row = (
      await db.query(
        `SELECT COALESCE(s.trainer_id, a.trainer_id) AS "trainerId"
         FROM student_accounts a LEFT JOIN students s ON s.id=a.student_id WHERE a.id=$1 LIMIT 1`,
        [accountId],
      )
    ).rows[0]
    return row?.trainerId ? trainerLocked(db, row.trainerId) : false
  } catch {
    return false
  }
}

// Vagas em espera: alunos apagados no Grátis nos últimos 30 dias.
export async function heldSeats(db, trainerId) {
  try {
    return Number(
      (
        await db.query(`SELECT COUNT(*) AS total FROM saas_seat_holds WHERE trainer_id=$1 AND until > $2`, [
          trainerId,
          new Date().toISOString(),
        ])
      ).rows[0]?.total || 0,
    )
  } catch {
    return 0
  }
}

// Chamada antes de apagar um aluno. Só segura a vaga se o aluno foi usado de
// verdade (tem ficha ou avaliação): cadastro feito por engano libera na hora.
export async function holdSeatIfUsed(db, trainerId, studentId) {
  try {
    const row = (
      await db.query(
        `SELECT p.price_cents AS "priceCents",
           (SELECT id FROM trainers ORDER BY created_at, id LIMIT 1) AS "ownerId",
           (SELECT COUNT(*) FROM workouts w WHERE w.student_id=$2) AS workouts,
           (SELECT COUNT(*) FROM assessments a WHERE a.student_id=$2) AS assessments,
           (SELECT COUNT(*) FROM students s WHERE s.id=$2 AND s.trainer_id=$1) AS mine
         FROM trainers t LEFT JOIN saas_plans p ON p.code=t.saas_plan_code WHERE t.id=$1`,
        [trainerId, studentId],
      )
    ).rows[0]
    if (!row || !Number(row.mine) || Number(row.priceCents) > 0 || row.ownerId === trainerId) return
    if (!Number(row.workouts) && !Number(row.assessments)) return
    await db.query(`INSERT INTO saas_seat_holds (trainer_id, until) VALUES ($1,$2)`, [
      trainerId,
      new Date(Date.now() + 30 * DAY).toISOString(),
    ])
  } catch {
    /* sem a migração 041: sem espera */
  }
}
