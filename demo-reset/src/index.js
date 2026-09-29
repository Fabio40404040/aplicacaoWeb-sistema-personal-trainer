// Restaura a conta de demonstração do portfólio (ver backend/demo/demo-seed.sql).
// Roda sozinho pelo cron do wrangler.jsonc. Não tem rota pública: ninguém
// consegue disparar a restauração pela internet.
import seedSql from '../../backend/demo/demo-seed.sql'

// Separa o arquivo em comandos: ignora as linhas de comentário (--) e corta
// em cada ";" que termina uma linha. Os textos do seed não têm ";" no fim
// de linha, então o corte é seguro.
export function splitStatements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/u)
    .map((statement) => statement.trim())
    .filter(Boolean)
}

// Apaga do R2 os arquivos enviados pela conta demo. Todos ficam em
// "trainers/demo-trainer/..."; os arquivos das outras contas não são tocados.
export async function clearDemoFiles(env) {
  if (!env.MEDIA) return 0
  let removed = 0
  let cursor
  do {
    const page = await env.MEDIA.list({ prefix: 'trainers/demo-trainer/', cursor })
    const keys = page.objects.map((object) => object.key)
    if (keys.length) {
      await env.MEDIA.delete(keys)
      removed += keys.length
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return removed
}

export async function resetDemo(env) {
  await clearDemoFiles(env)
  const statements = splitStatements(seedSql).map((sql) => env.DB.prepare(sql))
  // batch roda tudo numa transação: ou restaura por completo, ou não muda nada.
  await env.DB.batch(statements)
  return statements.length
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      resetDemo(env).then(
        (count) => console.log(`Demo restaurada (${count} comandos).`),
        (error) => console.error('Falha ao restaurar a demo.', error),
      ),
    )
  },
  async fetch() {
    return new Response('Not found', { status: 404 })
  },
}
