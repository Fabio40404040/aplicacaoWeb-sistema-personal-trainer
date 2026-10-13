// Cópia do banco de produção (D1) para a pasta backups/, com a data no nome:
// backups/farisa-2026-10-13.sql. Uma cópia nova não apaga as anteriores.
// Rodar com: npm run backup   (a pasta backups/ não vai para o GitHub)
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const day = new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD
const hour = new Date().toTimeString().slice(0, 5).replace(':', 'h')
const file = `farisa-${day}-${hour}.sql`
mkdirSync(`${root}backups`, { recursive: true })
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(npx, ['wrangler', 'd1', 'export', 'DB', '--remote', `--output=../backups/${file}`], {
  cwd: `${root}backend`,
  stdio: 'inherit',
})
if (result.status === 0) console.log(`\nCópia salva em backups/${file}`)
process.exit(result.status ?? 1)
