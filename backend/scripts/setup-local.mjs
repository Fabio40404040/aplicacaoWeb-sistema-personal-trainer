import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

// Local-only configuration; never replaces existing secrets.
try {
  writeFileSync(
    new URL('../.dev.vars', import.meta.url),
    `SESSION_SECRET=${randomBytes(32).toString('hex')}\n`,
    { flag: 'wx', mode: 0o600 },
  )
  console.log('Chave de sessão local criada em .dev.vars (não publicar).')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
}
