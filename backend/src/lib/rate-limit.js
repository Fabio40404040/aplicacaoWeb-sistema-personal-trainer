// Limite simples de tentativas (D1, migração 024). Se a tabela não existir,
// não bloqueia nada — o login continua funcionando.
const WINDOW_MIN = 15

async function current(db, key) {
  try {
    const row = (
      await db.query(
        `SELECT count, (julianday('now') - julianday(window_start)) * 1440 AS age FROM login_attempts WHERE key=$1`,
        [key],
      )
    ).rows[0]
    if (!row || row.age > WINDOW_MIN) return 0
    return Number(row.count) || 0
  } catch {
    return 0
  }
}

export async function isBlocked(db, keys, limit) {
  for (const key of keys) if ((await current(db, key)) >= limit) return true
  return false
}

export async function addAttempt(db, keys) {
  try {
    await db.batch(
      keys.map((key) => ({
        sql: `INSERT INTO login_attempts (key,count,window_start) VALUES ($1,1,CURRENT_TIMESTAMP)
              ON CONFLICT(key) DO UPDATE SET
                count = CASE WHEN (julianday('now') - julianday(window_start)) * 1440 > ${WINDOW_MIN} THEN 1 ELSE count + 1 END,
                window_start = CASE WHEN (julianday('now') - julianday(window_start)) * 1440 > ${WINDOW_MIN} THEN CURRENT_TIMESTAMP ELSE window_start END`,
        values: [key],
      })),
    )
  } catch {
    // sem a migração 024: ignora
  }
}

export async function clearAttempts(db, keys) {
  try {
    await db.batch(keys.map((key) => ({ sql: 'DELETE FROM login_attempts WHERE key=$1', values: [key] })))
  } catch {
    // ignora
  }
}

export function attemptKeys(request, route, email) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local'
  const who = String(email || '').trim().toLowerCase().slice(0, 180)
  return { account: `${route}:${who}`, ip: `${route}:ip:${ip}` }
}
