import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = new Set()
let stopping = false

function run(args) {
  const child = spawn(npmCommand, args, {
    cwd: projectDirectory,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}

function waitFor(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`Processo encerrado (${signal || `código ${code}`}).`))
    })
  })
}

function isPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', (error) =>
      error.code === 'EADDRINUSE' ? resolve(false) : reject(error),
    )
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

// Quem está escutando na porta. No Linux lê direto do /proc (não depende de
// lsof/fuser instalados); nos outros sistemas tenta o lsof.
function listeningPids(port) {
  if (existsSync('/proc/net/tcp')) {
    const inodes = new Set()
    for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
      if (!existsSync(file)) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .slice(1)
        .forEach((line) => {
          const parts = line.trim().split(/\s+/u)
          if (parts.length < 10) return
          const localPort = parseInt(parts[1].split(':')[1], 16)
          if (localPort === port && parts[3] === '0A') inodes.add(parts[9])
        })
    }
    const pids = new Set()
    for (const pid of readdirSync('/proc').filter((name) => /^\d+$/u.test(name))) {
      let fds = []
      try {
        fds = readdirSync(`/proc/${pid}/fd`)
      } catch {
        continue
      }
      for (const fd of fds) {
        try {
          const target = readlinkSync(`/proc/${pid}/fd/${fd}`)
          const inode = /^socket:\[(\d+)\]$/u.exec(target)?.[1]
          if (inode && inodes.has(inode)) pids.add(Number(pid))
        } catch {
          /* processo sumiu no meio da leitura */
        }
      }
    }
    return [...pids]
  }
  try {
    return execFileSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map(Number)
  } catch {
    return []
  }
}

function describe(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ').trim()
  } catch {
    try {
      return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim()
    } catch {
      return ''
    }
  }
}

function processGroup(pid) {
  try {
    // Campo 5 do /proc/<pid>/stat (depois do nome entre parênteses).
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]) || 0
  } catch {
    return 0
  }
}

// Só encerra o que é claramente deste projeto (site do Vite ou API do
// wrangler). Qualquer outro programa na porta é deixado em paz, com aviso.
function isProjectProcess(pid) {
  const command = describe(pid)
  let cwd = ''
  try {
    cwd = readlinkSync(`/proc/${pid}/cwd`)
  } catch {
    /* sem acesso ao diretório: decide só pelo comando */
  }
  return (
    cwd.startsWith(projectDirectory.replace(/\/$/u, '')) ||
    command.includes(projectDirectory.replace(/\/$/u, '')) ||
    /\b(vite|wrangler|workerd)\b/u.test(command)
  )
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Antes: "A porta já está em uso. Encerre a execução anterior...". Agora, se
// quem ocupa a porta é uma execução antiga deste projeto (por exemplo, um
// terminal fechado sem Ctrl+C), ela é encerrada sozinha e tudo sobe de novo.
async function ensurePortAvailable(port, service) {
  if (await isPortFree(port)) return
  const pids = listeningPids(port).filter((pid) => pid !== process.pid)
  const strangers = pids.filter((pid) => !isProjectProcess(pid))
  if (!pids.length || strangers.length)
    throw new Error(
      `A porta ${port} (${service}) está sendo usada por outro programa${strangers.length ? ` (${describe(strangers[0]) || `processo ${strangers[0]}`})` : ''}. Feche esse programa e rode npm run dev de novo.`,
    )
  console.log(`A porta ${port} (${service}) estava presa numa execução anterior. Encerrando…`)
  const signal = (sig) => {
    for (const pid of pids) {
      // O processo e o grupo dele (npm → wrangler → workerd), para não sobrar nada.
      const group = processGroup(pid)
      const ownGroup = group === process.pid || group === processGroup(process.pid)
      for (const target of group > 1 && !ownGroup ? [-group, pid] : [pid]) {
        try {
          process.kill(target, sig)
        } catch {
          /* já tinha terminado */
        }
      }
    }
  }
  signal('SIGTERM')
  for (let i = 0; i < 30; i += 1) {
    await sleep(100)
    if (await isPortFree(port)) return
  }
  signal('SIGKILL')
  for (let i = 0; i < 20; i += 1) {
    await sleep(100)
    if (await isPortFree(port)) return
  }
  throw new Error(
    `Não consegui liberar a porta ${port} (${service}). Rode: kill ${pids.join(' ')} e tente de novo.`,
  )
}

function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    try {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else process.kill(-child.pid, 'SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(error.message)
    }
  }
  setTimeout(() => process.exit(exitCode), 250)
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())

try {
  await ensurePortAvailable(5173, 'site')
  await ensurePortAvailable(8787, 'API')
  console.log('\nPreparando o banco de dados local...\n')
  await waitFor(run(['run', 'db:migrate:local']))

  const siteUrl = 'http://localhost:5173'
  console.log(`\nIniciando API e site em ${siteUrl}...\n`)
  const backend = run([
    '--prefix',
    'backend',
    'run',
    'dev',
    '--',
    '--var',
    `PUBLIC_SITE_URL:${siteUrl}`,
    '--var',
    `ALLOWED_ORIGIN:${siteUrl}`,
  ])
  const frontend = run(['run', 'dev:frontend'])

  for (const child of [backend, frontend]) {
    child.once('error', (error) => {
      console.error(error.message)
      stop(1)
    })
    child.once('exit', (code, signal) => {
      if (!stopping) {
        const expectedStop = code === 0 || ['SIGINT', 'SIGTERM'].includes(signal)
        if (!expectedStop)
          console.error(`\nUm serviço foi encerrado (${signal || `código ${code}`}).`)
        stop(expectedStop ? 0 : code || 1)
      }
    })
  }
} catch (error) {
  console.error(`\nNão foi possível iniciar o projeto: ${error.message}`)
  stop(1)
}
