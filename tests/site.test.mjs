// Testes das páginas montadas (dist/): confere que a publicação saiu inteira.
// Rodar depois do build: npm test
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const has = existsSync('dist/index.html')

test('site montado: páginas e arquivos essenciais existem', { skip: !has && 'rode "npm run build" antes' }, () => {
  for (const file of ['index.html', 'admin/index.html', '_headers', 'sw.js', 'termos.html', 'privacidade.html', 'app.webmanifest', 'robots.txt'])
    assert.ok(existsSync(`dist/${file}`), `faltou dist/${file}`)
})

test('site montado: cabeçalhos de proteção presentes', { skip: !has && 'rode "npm run build" antes' }, () => {
  const headers = readFileSync('dist/_headers', 'utf8')
  for (const name of ['X-Content-Type-Options', 'Strict-Transport-Security', 'Content-Security-Policy', 'Referrer-Policy'])
    assert.ok(headers.includes(name), `faltou ${name}`)
})

test('site montado: sem preços de teste nem chaves no HTML', { skip: !has && 'rode "npm run build" antes' }, () => {
  const html = readFileSync('dist/index.html', 'utf8')
  assert.equal(/R\$ [2468]<\//u.test(html), false)
  assert.equal(/APP_USR-|TEST-[0-9a-f]{8}/u.test(html), false)
  assert.ok(html.includes('og:title'))
})

test('migrações: numeradas em sequência, sem buraco nem repetição', () => {
  const dir = 'backend/migrations-d1'
  if (!existsSync(dir)) return
  const numbers = []
  for (const name of readdirSync(dir)) numbers.push(Number(name.slice(0, 3)))
  numbers.sort((a, b) => a - b)
  numbers.forEach((number, index) => assert.equal(number, index + 1, `migração fora de sequência perto de ${number}`))
})
