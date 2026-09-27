// Bind each occurrence of a numbered route parameter, including repeats.
function prepare(binding, sql, values = []) {
  const parameters = []
  const statement = sql.replace(/\$(\d+)/gu, (_, index) => {
    parameters.push(values[Number(index) - 1] ?? null)
    return '?'
  })
  const prepared = binding.prepare(statement)
  return parameters.length ? prepared.bind(...parameters) : prepared
}

export async function withDb(env, callback) {
  if (!env.DB) throw new Error('Cloudflare D1 binding DB is missing')
  return callback({
    async query(sql, values) {
      const result = await prepare(env.DB, sql, values).all()
      return { rows: result.results || [] }
    },
    async batch(queries) {
      const results = await env.DB.batch(
        queries.map(({ sql, values }) => prepare(env.DB, sql, values)),
      )
      return results.map((result) => ({ rows: result.results || [] }))
    },
  })
}
