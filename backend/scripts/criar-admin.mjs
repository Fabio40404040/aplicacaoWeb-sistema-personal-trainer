// Cria (ou atualiza a senha de) um administrador da plataforma — o dono do
// SaaS, que entra em /admin. Essa conta é separada das contas de personal.
//
// Uso (na pasta principal):  npm run admin
//
// Pede nome, e-mail e senha (digitada sem aparecer, duas vezes) e onde gravar:
// no computador (npm run dev), no site publicado ou nos dois. Só o hash da
// senha vai para o banco. Se o e-mail já existir, troca o nome e a senha e
// desconecta quem estava logado com a senha antiga.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WRANGLER,
  ask,
  askHidden,
  closeInput,
  hashPassword,
  isStrongPassword,
  runUpdate,
  startInput,
} from './trocar-senha-personal.mjs'

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`

async function main() {
  if (!existsSync(WRANGLER)) {
    console.error('Não encontrei o wrangler. Rode "npm install" dentro da pasta backend.')
    process.exit(1)
  }
  startInput()
  console.log('\nAdministrador da plataforma FARISA (área /admin)\n')
  const name = (await ask('Seu nome [Fábio Santos]: ')) || 'Fábio Santos'
  let email = ''
  while (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    email = (await ask('E-mail de entrada no /admin: ')).toLowerCase()
  let password = ''
  for (;;) {
    password = await askHidden('Senha: ')
    if (!isStrongPassword(password)) {
      console.log(
        'A senha precisa ter de 8 a 128 caracteres, com letra minúscula, maiúscula, número e símbolo, sem espaços. Tente de novo.\n',
      )
      continue
    }
    if ((await askHidden('Repita a senha: ')) !== password) {
      console.log('As duas senhas não são iguais. Tente de novo.\n')
      continue
    }
    break
  }
  console.log('\nOnde gravar?')
  console.log('  1) No computador (npm run dev)')
  console.log('  2) No site publicado')
  console.log('  3) Nos dois')
  const choice = await ask('Escolha 1, 2 ou 3 [3]: ')
  const targets =
    choice === '1' ? ['computador'] : choice === '2' ? ['site'] : ['computador', 'site']

  const hash = hashPassword(password)
  const sql = `INSERT INTO platform_admins (name,email,password_hash) VALUES (${quote(name)},${quote(email)},'${hash}')
    ON CONFLICT(email) DO UPDATE SET name=excluded.name, password_hash=excluded.password_hash,
    auth_version=platform_admins.auth_version+1 RETURNING id`
  let ok = true
  for (const target of targets) {
    try {
      runUpdate(target, sql.replace(/\s+/gu, ' '))
      console.log(`✔ Administrador gravado no ${target}.`)
    } catch (error) {
      ok = false
      const text = String(`${error.stdout || ''}${error.stderr || ''}${error.message}`)
      if (/no such table: platform_admins/u.test(text))
        console.log(
          `✘ O banco do ${target} ainda não tem a tabela de administradores. Rode "npm run db:migrate:${target === 'site' ? 'remote' : 'local'}" e tente de novo.`,
        )
      else if (/7403|not authorized/u.test(text))
        console.log('✘ O login do wrangler expirou. Rode "npm run wrangler:login" e tente de novo.')
      else console.log(`✘ Não consegui gravar no ${target}: ${text.split('\n').find((line) => /error/iu.test(line)) || error.message}`)
    }
  }
  console.log(
    ok
      ? '\nPronto. Entre em /admin com esse e-mail e senha.'
      : '\nAlguma gravação não deu certo — veja as mensagens acima.',
  )
  closeInput()
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
