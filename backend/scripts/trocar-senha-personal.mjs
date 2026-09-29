// Troca a senha de entrada do painel do personal.
//
// Uso (dentro da pasta backend):
//   npm run senha            (na pasta principal)
//   node scripts/trocar-senha-personal.mjs   (na pasta backend)
//
// O script pergunta o e-mail, a nova senha (digitada sem aparecer na tela, duas
// vezes) e onde trocar: no computador (npm run dev), no site publicado ou nos
// dois. A senha nunca fica salva em arquivo — só o hash vai para o banco, no
// mesmo formato que o login do painel confere (PBKDF2-SHA256, 100.000 voltas;
// o Cloudflare não aceita mais que isso).
// Depois da troca, quem estava logado com a senha antiga é desconectado.
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import readline from 'node:readline'

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const WRANGLER = path.join(BACKEND_DIR, 'node_modules', '.bin', 'wrangler')

export function isStrongPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[a-z]/u.test(password) &&
    /[A-Z]/u.test(password) &&
    /[0-9]/u.test(password) &&
    /[^A-Za-z0-9\s]/u.test(password) &&
    !/\s/u.test(password)
  )
}

export function hashPassword(password) {
  const iterations = 100000
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  return `pbkdf2$${iterations}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

// Uma só interface de leitura para o script todo (várias interfaces seguidas
// perdem o que já foi digitado). No modo "oculto" nada do que é digitado
// aparece na tela.
let rl = null
let hideTyping = false
const lines = []
const waiting = []
export function startInput() {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl._writeToOutput = (text) => {
    if (!hideTyping) rl.output.write(text)
  }
  rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)))
  rl.on('close', () => waiting.splice(0).forEach((resolve) => resolve(null)))
}
export function closeInput() {
  rl?.close()
}
function nextLine() {
  return lines.length ? Promise.resolve(lines.shift()) : new Promise((r) => waiting.push(r))
}

export async function ask(question) {
  process.stdout.write(question)
  const answer = await nextLine()
  if (answer === null) throw new Error('Entrada encerrada antes de terminar.')
  return answer.trim()
}

export async function askHidden(question) {
  process.stdout.write(question)
  hideTyping = true
  const answer = await nextLine()
  hideTyping = false
  process.stdout.write('\n')
  if (answer === null) throw new Error('Entrada encerrada antes de terminar.')
  return answer
}

export function runUpdate(target, sql) {
  const flag = target === 'site' ? '--remote' : '--local'
  const output = execFileSync(
    WRANGLER,
    ['d1', 'execute', 'DB', flag, '--json', '--command', sql],
    { cwd: BACKEND_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const start = output.indexOf('[')
  const result = JSON.parse(output.slice(start))
  // Conta as linhas devolvidas pelo RETURNING: o banco local não informa
  // "changes", e por isso antes dizia "não existe conta" mesmo trocando.
  return Array.isArray(result?.[0]?.results) ? result[0].results.length : 0
}

function updatePassword(target, email, hash) {
  const safeEmail = email.replaceAll("'", "''")
  const where = `WHERE lower(email)=lower('${safeEmail}')`
  try {
    // auth_version+1 desconecta quem estava logado com a senha antiga.
    return runUpdate(
      target,
      `UPDATE trainers SET password_hash='${hash}', auth_version=auth_version+1 ${where} RETURNING id`,
    )
  } catch (error) {
    const text = `${error.stdout || ''}${error.stderr || ''}${error.message}`
    if (!/no such column: auth_version/u.test(text)) throw error
    return runUpdate(target, `UPDATE trainers SET password_hash='${hash}' ${where} RETURNING id`)
  }
}

async function main() {
  if (!existsSync(WRANGLER)) {
    console.error('Não encontrei o wrangler. Rode "npm install" dentro da pasta backend.')
    process.exit(1)
  }
  startInput()
  console.log('\nTrocar a senha do painel do personal\n')
  const email = (await ask('E-mail da conta [admin@farisa.example]: ')) || 'admin@farisa.example'
  let password = ''
  for (;;) {
    password = await askHidden('Nova senha: ')
    if (!isStrongPassword(password)) {
      console.log(
        'A senha precisa ter de 8 a 128 caracteres, com letra minúscula, maiúscula, número e símbolo, sem espaços. Tente de novo.\n',
      )
      continue
    }
    const again = await askHidden('Repita a nova senha: ')
    if (again !== password) {
      console.log('As duas senhas não são iguais. Tente de novo.\n')
      continue
    }
    break
  }

  console.log('\nOnde trocar?')
  console.log('  1) No computador (npm run dev)')
  console.log('  2) No site publicado')
  console.log('  3) Nos dois')
  const choice = await ask('Escolha 1, 2 ou 3 [3]: ')
  const targets =
    choice === '1' ? ['computador'] : choice === '2' ? ['site'] : ['computador', 'site']

  const hash = hashPassword(password)
  let ok = true
  for (const target of targets) {
    try {
      const changes = updatePassword(target, email, hash)
      if (changes > 0) console.log(`✔ Senha trocada no ${target}.`)
      else {
        ok = false
        console.log(`✘ No ${target} não existe conta com o e-mail ${email}. Nada foi alterado lá.`)
      }
    } catch (error) {
      ok = false
      const detail = String(error.stderr || error.message || error)
        .split('\n')
        .filter((line) => /ERROR|error|✘/u.test(line))
        .slice(0, 3)
        .join('\n')
      console.log(`✘ Não consegui trocar no ${target}.\n${detail || error.message}`)
      if (/7403|not authorized/u.test(String(error.stderr || error.message)))
        console.log('  Dica: o login do wrangler expirou. Rode "npx wrangler login" na pasta backend e tente de novo.')
    }
  }
  console.log(
    ok
      ? '\nPronto. Use a nova senha para entrar no painel.'
      : '\nAlguma troca não deu certo — veja as mensagens acima.',
  )
  rl.close()
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
