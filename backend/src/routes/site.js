// Página de cada personal (migração 030). A estrutura do site é uma só; o
// personal personaliza marca, cor, banner, contato, redes e preços dos planos.
// Endereço: /p/<slug>. O site principal (/) mostra a página do dono.
const ACCENTS = ['blue', 'green', 'red', 'orange', 'purple', 'pink', 'teal', 'gold']
const RESERVED = new Set(['admin', 'personal', 'api', 'p', 'assets', 'icons', 'banners', 'docs', 'farisa', 'suporte', 'site', 'app', 'login', 'demo'])
const HERO_PATTERN = /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/u
const MAX_HERO_CHARS = 950_000
const CUTOUT_PATTERN = /^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/u
const MAX_CUTOUT_CHARS = 1_400_000
const ICON_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/u
const PRESET_PATTERN = /^banner-[1-9]\d?\.(jpg|webp)$/u

const clean = (value, max) => {
  const text = String(value ?? '').replace(/[\u0000-\u001f<>]/gu, '').trim()
  return text ? text.slice(0, max) : null
}
const slugify = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 30)
// @usuario ou link → só o nome de usuário.
const handle = (value) => {
  const text = String(value ?? '').trim()
  const match = text.match(/(?:instagram\.com|facebook\.com|tiktok\.com)\/@?([A-Za-z0-9._-]{1,60})/iu)
  // Facebook também tem perfis no formato profile.php?id=123.
  const byId = text.match(/facebook\.com\/profile\.php\?id=(\d{5,20})/iu) || text.match(/^profile\.php\?id=(\d{5,20})$/iu)
  if (byId) return `profile.php?id=${byId[1]}`
  const user = (match ? match[1] : text.replace(/^@/u, '').replace(/^(https?:\/\/)?(www\.|m\.)?(fb\.com|fb\.me)\//iu, '').replace(/\/+$/u, '')).trim()
  return /^[A-Za-z0-9._-]{1,60}$/u.test(user) ? user : null
}
// WhatsApp: só dígitos, com 55 na frente.
const phone = (value) => {
  const digits = String(value ?? '').replace(/\D/gu, '')
  if (!digits) return null
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  return /^\d{10,11}$/u.test(local) ? `55${local}` : undefined
}

// Indicações para o aluno: nutricionista e app de alimentação.
const webLink = (value) => {
  const text = clean(value, 200)
  if (!text) return null
  const url = /^https?:\/\//iu.test(text) ? text.replace(/^http:/iu, 'https:') : `https://${text}`
  return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s"'<>]*)?$/iu.test(url) ? url : undefined
}
function cleanReferrals(body) {
  const nutritionist = body?.nutritionist || {}
  const app = body?.app || {}
  const whatsapp = phone(nutritionist.whatsapp)
  if (whatsapp === undefined) return { error: 'Confira o WhatsApp do nutricionista: informe DDD + número.' }
  const link = webLink(nutritionist.link)
  const appLink = webLink(app.link)
  const appLinkIos = webLink(app.linkIos)
  if (link === undefined || appLink === undefined || appLinkIos === undefined) return { error: 'Confira os links das indicações (ex.: instagram.com/perfil).' }
  const value = {
    nutritionist: {
      name: clean(nutritionist.name, 80),
      registration: clean(nutritionist.registration, 30),
      whatsapp,
      link,
      note: clean(nutritionist.note, 240),
    },
    app: { name: clean(app.name, 60), link: appLink, linkIos: appLinkIos, note: clean(app.note, 240) },
  }
  if (!value.nutritionist.name) value.nutritionist = null
  if (!value.app.name) value.app = null
  return { value: value.nutritionist || value.app ? value : null }
}
export function referralsOf(row) {
  try {
    const value = JSON.parse(row?.referrals || 'null')
    return value && (value.nutritionist || value.app) ? value : null
  } catch {
    return null
  }
}
// Para a área do aluno: o que o personal dele indica.
export async function trainerReferrals(db, trainerId) {
  if (!trainerId) return null
  try {
    const row = (await db.query('SELECT referrals, instagram FROM trainer_site WHERE trainer_id=$1', [trainerId])).rows[0]
    const value = referralsOf(row)
    // Instagram do personal: para o aluno tirar dúvidas com ele.
    return value ? { ...value, instagram: row.instagram || null } : null
  } catch {
    return null // sem a migração 039
  }
}

async function ownerId(db) {
  return (await db.query('SELECT id FROM trainers ORDER BY created_at, id LIMIT 1')).rows[0]?.id || null
}

async function freeSlug(db, base, trainerId) {
  let root = slugify(base)
  if (root.length < 3 || RESERVED.has(root)) root = `personal-${root || 'fit'}`.slice(0, 30)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt ? `${root.slice(0, 26)}-${attempt + 1}` : root
    const taken = (await db.query('SELECT trainer_id FROM trainer_site WHERE slug=$1', [slug])).rows[0]
    if (!taken || taken.trainer_id === trainerId) return slug
  }
  return `${root.slice(0, 20)}-${crypto.randomUUID().slice(0, 6)}`
}

// Linha do site do personal; cria com um endereço automático na primeira vez.
async function siteRow(db, trainerId) {
  let row = (await db.query('SELECT * FROM trainer_site WHERE trainer_id=$1', [trainerId])).rows[0]
  if (row) return row
  const trainer = (await db.query('SELECT name FROM trainers WHERE id=$1', [trainerId])).rows[0]
  if (!trainer) return null
  await db.query('INSERT INTO trainer_site (trainer_id, slug) VALUES ($1,$2) ON CONFLICT DO NOTHING', [
    trainerId,
    await freeSlug(db, trainer.name, trainerId),
  ])
  row = (await db.query('SELECT * FROM trainer_site WHERE trainer_id=$1', [trainerId])).rows[0]
  return row
}

// Preços do personal por plano. Sem a migração 030 → mapa vazio (preço padrão).
export async function trainerPrices(db, trainerId) {
  try {
    return new Map(
      (
        await db.query('SELECT plan_code AS code, price_cents AS "priceCents", active FROM trainer_plan_prices WHERE trainer_id=$1', [
          trainerId,
        ])
      ).rows.map((row) => [row.code, { priceCents: Number(row.priceCents), active: Boolean(row.active) }]),
    )
  } catch {
    return new Map()
  }
}
// Aplica o preço do personal a um plano (objeto com code e priceCents).
export async function withTrainerPrice(db, trainerId, plan) {
  if (!plan || !trainerId) return plan
  const own = (await trainerPrices(db, trainerId)).get(plan.code || plan.planCode)
  if (own) plan.priceCents = own.priceCents
  return plan
}
// Lista de planos com o preço do personal; por padrão só os que ele vende.
export async function trainerPlans(db, trainerId, { includeInactive = false } = {}) {
  const prices = await trainerPrices(db, trainerId)
  const plans = (
    await db.query(
      `SELECT code, name, price_cents AS "priceCents", access_type AS "accessType", duration_days AS "durationDays"
       FROM plans WHERE active=1 ORDER BY price_cents`,
    )
  ).rows
  return plans
    .map((plan) => {
      const own = prices.get(plan.code)
      return { ...plan, defaultPriceCents: Number(plan.priceCents), priceCents: own ? own.priceCents : Number(plan.priceCents), active: own ? own.active : true }
    })
    .filter((plan) => includeInactive || plan.active)
}
export async function trainerSellsPlan(db, trainerId, planCode) {
  const own = (await trainerPrices(db, trainerId)).get(planCode)
  return own ? own.active : true
}

// Personal dono de um endereço (/p/<slug>); sem slug, o dono do site.
export async function trainerIdForSlug(db, slug) {
  const text = String(slug || '').toLowerCase()
  if (text) {
    try {
      const row = (
        await db.query(
          `SELECT s.trainer_id AS id FROM trainer_site s JOIN trainers t ON t.id=s.trainer_id WHERE s.slug=$1`,
          [text],
        )
      ).rows[0]
      if (row) return row.id
    } catch {
      /* sem a migração 030 */
    }
    return null
  }
  return ownerId(db)
}

function publicShape(row, trainer, isOwner) {
  return {
    slug: row?.slug || null,
    isOwner,
    trainerName: trainer?.name || '',
    brandMark: row?.brand_mark || null,
    brandName: row?.brand_name || null,
    accent: row?.accent || 'blue',
    hero: {
      ...(row?.hero_kind === 'upload' && row.hero_image
        ? { kind: 'upload', url: `/api/public/site-hero/${row.slug}?v=${row.hero_version}` }
        : row?.hero_kind === 'preset' && row.hero_preset
          ? { kind: 'preset', url: `/banners/${row.hero_preset}` }
          : { kind: 'default', url: null }),
      // Foto do personal com fundo transparente, por cima do fundo.
      cutoutUrl: row?.hero_cutout
        ? `/api/public/site-hero/${row.slug}?kind=cutout&v=${row.hero_cutout_version || 0}`
        : null,
    },
    contact: {
      whatsapp: row?.whatsapp || null,
      email: row?.contact_email || null,
      address: row?.address || null,
      instagram: row?.instagram || null,
      facebook: row?.facebook || null,
      tiktok: row?.tiktok || null,
    },
  }
}

async function isFreePlan(db, trainerId) {
  try {
    const row = (
      await db.query(
        `SELECT p.price_cents AS price FROM trainers t LEFT JOIN saas_plans p ON p.code=t.saas_plan_code WHERE t.id=$1`,
        [trainerId],
      )
    ).rows[0]
    return !Number(row?.price)
  } catch {
    return false
  }
}

const brandOf = (row, trainer) => {
  const mark = row?.brand_mark || String(trainer?.name || 'Personal').split(/\s+/u)[0].slice(0, 14)
  return { mark, full: `${mark} ${row?.brand_name || 'Personal'}`.trim() }
}

// Manifesto do app do aluno com a marca do personal (instalado a partir de /p/<slug>).
export async function siteManifest(db, slug) {
  const clean = String(slug || '').toLowerCase()
  let row = null
  let trainer = null
  try {
    row = (await db.query('SELECT * FROM trainer_site WHERE slug=$1', [clean])).rows[0] || null
    if (row) trainer = (await db.query('SELECT name FROM trainers WHERE id=$1', [row.trainer_id])).rows[0]
  } catch {
    row = null
  }
  if (!row) return new Response('Not found', { status: 404 })
  const brand = brandOf(row, trainer)
  const version = Number(row.icon_version || 0)
  const icon = (size) =>
    row.icon_192 && row.icon_512 ? `/api/public/site-icon/${clean}/${size}?v=${version}` : `/icons/icon-${size}.png`
  const manifest = {
    id: `/p/${clean}`,
    name: brand.full.slice(0, 45),
    short_name: brand.mark.slice(0, 12),
    description: `App de treinos de ${trainer?.name || brand.full}.`,
    lang: 'pt-BR',
    start_url: `/p/${clean}#entrar-aluno`,
    scope: `/p/${clean}`,
    display: 'standalone',
    background_color: '#18212d',
    theme_color: '#18212d',
    icons: [
      { src: icon(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon(512), sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  })
}

export async function siteIcon(db, slug, size) {
  let row
  try {
    row = (
      await db.query('SELECT icon_192 AS small, icon_512 AS large FROM trainer_site WHERE slug=$1', [String(slug || '').toLowerCase()])
    ).rows[0]
  } catch {
    row = null
  }
  const data = String(size) === '512' ? row?.large : row?.small
  const match = String(data || '').match(/^data:image\/png;base64,(.+)$/u)
  if (!match)
    return new Response(null, { status: 302, headers: { Location: `/icons/icon-${String(size) === '512' ? 512 : 192}.png` } })
  return new Response(Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0)), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  })
}

// ---------- público
export async function publicSite(db, slug) {
  let trainerId
  try {
    trainerId = await trainerIdForSlug(db, slug)
  } catch {
    trainerId = null
  }
  if (!trainerId) return { error: 'Página não encontrada.', status: 404 }
  const trainer = (await db.query('SELECT id, name, status FROM trainers WHERE id=$1', [trainerId]).catch(() =>
    db.query('SELECT id, name FROM trainers WHERE id=$1', [trainerId]),
  )).rows[0]
  if (!trainer || trainer.status === 'blocked') return { error: 'Página não encontrada.', status: 404 }
  let row = null
  try {
    row = (await db.query('SELECT * FROM trainer_site WHERE trainer_id=$1', [trainerId])).rows[0] || null
  } catch {
    /* sem a migração 030: site padrão */
  }
  const isOwner = trainerId === (await ownerId(db))
  return {
    data: {
      ...publicShape(row, trainer, isOwner),
      // Selo "Feito com FARISA" nas páginas do plano Grátis.
      badge: !isOwner && (await isFreePlan(db, trainerId)),
      plans: (await trainerPlans(db, trainerId)).map(({ code, name, priceCents, accessType }) => ({ code, name, priceCents, accessType })),
    },
  }
}

export async function publicSiteHero(db, slug, kind) {
  let row
  try {
    row = (
      await db.query(
        kind === 'cutout'
          ? 'SELECT hero_cutout AS image FROM trainer_site WHERE slug=$1'
          : "SELECT hero_image AS image FROM trainer_site WHERE slug=$1 AND hero_kind='upload'",
        [String(slug || '')],
      )
    ).rows[0]
  } catch {
    row = null
  }
  const match = String(row?.image || '').match(/^data:(image\/(?:jpeg|webp|png));base64,(.+)$/u)
  if (!match) return new Response('Not found', { status: 404 })
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
  return new Response(bytes, {
    headers: {
      'Content-Type': match[1],
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// ---------- painel do personal ("Meu site")
export async function siteSettings(db, trainerId) {
  let row
  try {
    row = await siteRow(db, trainerId)
  } catch {
    return { data: { ready: false } }
  }
  const trainer = (await db.query('SELECT id, name FROM trainers WHERE id=$1', [trainerId])).rows[0]
  const isOwner = trainerId === (await ownerId(db))
  return {
    data: {
      ready: true,
      ...publicShape(row, trainer, isOwner),
      heroPreset: row.hero_preset || null,
      referrals: referralsOf(row),
      referralsReady: 'referrals' in row,
      accents: ACCENTS,
      plans: await trainerPlans(db, trainerId, { includeInactive: true }),
    },
  }
}

export async function saveSite(db, trainerId, body) {
  const row = await siteRow(db, trainerId)
  if (!row) return { error: 'Conta não encontrada.', status: 404 }
  const slug = slugify(body?.slug || row.slug)
  if (slug.length < 3) return { error: 'O endereço da página precisa ter pelo menos 3 letras ou números.', status: 400 }
  if (RESERVED.has(slug)) return { error: 'Este endereço é reservado. Escolha outro.', status: 400 }
  const taken = (await db.query('SELECT trainer_id FROM trainer_site WHERE slug=$1 AND trainer_id<>$2', [slug, trainerId])).rows[0]
  if (taken) return { error: 'Este endereço já está em uso por outro personal. Escolha outro.', status: 409 }
  const whatsapp = phone(body?.whatsapp)
  if (whatsapp === undefined) return { error: 'Confira o WhatsApp: informe DDD + número.', status: 400 }
  const email = clean(body?.email, 120)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return { error: 'Confira o e-mail de contato.', status: 400 }
  const referrals = body?.referrals && 'referrals' in row ? cleanReferrals(body.referrals) : null
  if (referrals?.error) return { error: referrals.error, status: 400 }
  const accent = ACCENTS.includes(body?.accent) ? body.accent : row.accent
  let heroKind = row.hero_kind
  let heroPreset = row.hero_preset
  if (body?.heroKind === 'default') heroKind = 'default'
  else if (body?.heroKind === 'preset' && PRESET_PATTERN.test(String(body?.heroPreset || ''))) {
    heroKind = 'preset'
    heroPreset = String(body.heroPreset)
  } else if (body?.heroKind === 'upload' && row.hero_image) heroKind = 'upload'

  const queries = [
    {
      sql: `UPDATE trainer_site SET slug=$2, brand_mark=$3, brand_name=$4, accent=$5, hero_kind=$6, hero_preset=$7,
              whatsapp=$8, contact_email=$9, address=$10, instagram=$11, facebook=$12, tiktok=$13,
              updated_at=CURRENT_TIMESTAMP WHERE trainer_id=$1`,
      values: [
        trainerId,
        slug,
        clean(body?.brandMark, 14),
        clean(body?.brandName, 24),
        accent,
        heroKind,
        heroPreset,
        whatsapp,
        email ? email.toLowerCase() : null,
        clean(body?.address, 160),
        handle(body?.instagram),
        handle(body?.facebook),
        handle(body?.tiktok),
      ],
    },
  ]
  // Preços dos planos (mínimo R$ 1,00; o personal precisa vender pelo menos um).
  if (Array.isArray(body?.plans)) {
    const valid = new Set((await db.query('SELECT code FROM plans WHERE active=1')).rows.map((plan) => plan.code))
    const plans = body.plans.filter((plan) => valid.has(plan?.code))
    if (plans.length && !plans.some((plan) => plan.active !== false))
      return { error: 'Deixe pelo menos um plano à venda.', status: 400 }
    for (const plan of plans) {
      const cents = Math.round(Number(plan.priceCents))
      if (!(cents >= 100 && cents <= 10_000_000))
        return { error: 'Cada plano precisa de um preço de pelo menos R$ 1,00.', status: 400 }
      queries.push({
        sql: `INSERT INTO trainer_plan_prices (trainer_id, plan_code, price_cents, active) VALUES ($1,$2,$3,$4)
              ON CONFLICT(trainer_id, plan_code) DO UPDATE SET price_cents=excluded.price_cents, active=excluded.active`,
        values: [trainerId, plan.code, cents, plan.active === false ? 0 : 1],
      })
    }
  }
  // Ícones do app do aluno (gerados no navegador com a marca e a cor).
  const icon192 = String(body?.icon192 || '')
  const icon512 = String(body?.icon512 || '')
  if (ICON_PATTERN.test(icon192) && ICON_PATTERN.test(icon512) && icon192.length < 200_000 && icon512.length < 600_000)
    queries.push({
      sql: 'UPDATE trainer_site SET icon_192=$2, icon_512=$3, icon_version=icon_version+1 WHERE trainer_id=$1',
      values: [trainerId, icon192, icon512],
    })
  try {
    await db.batch(queries)
  } catch (error) {
    // Sem a migração 031 (ícones): salva o resto.
    if (!/icon_/u.test(String(error?.message))) throw error
    await db.batch(queries.slice(0, -1))
  }
  if (referrals)
    await db.query('UPDATE trainer_site SET referrals=$2 WHERE trainer_id=$1', [
      trainerId,
      referrals.value ? JSON.stringify(referrals.value) : null,
    ])
  return siteSettings(db, trainerId)
}

// Foto do banner: chega já recortada e reduzida pelo navegador (1600 × 900).
export async function saveSiteHero(db, trainerId, body) {
  const row = await siteRow(db, trainerId)
  if (!row) return { error: 'Conta não encontrada.', status: 404 }
  // Remover a foto do personal (volta a aparecer só o fundo).
  if (body?.removeCutout) {
    await db.query('UPDATE trainer_site SET hero_cutout=NULL, updated_at=CURRENT_TIMESTAMP WHERE trainer_id=$1', [trainerId])
    return siteSettings(db, trainerId)
  }
  const image = String(body?.image || '')
  // Foto com fundo transparente: fica por cima do fundo escolhido.
  if (body?.cutout) {
    if (!CUTOUT_PATTERN.test(image) || image.length > MAX_CUTOUT_CHARS)
      return { error: 'Não foi possível usar esta foto. Envie um PNG com fundo transparente.', status: 400 }
    await db.query(
      `UPDATE trainer_site SET hero_cutout=$2, hero_cutout_version=hero_cutout_version+1,
         hero_kind=CASE WHEN hero_kind='upload' THEN 'default' ELSE hero_kind END, updated_at=CURRENT_TIMESTAMP
       WHERE trainer_id=$1`,
      [trainerId, image],
    )
    return siteSettings(db, trainerId)
  }
  if (!HERO_PATTERN.test(image) || image.length > MAX_HERO_CHARS)
    return { error: 'Não foi possível usar esta foto. Tente outra imagem (JPG ou PNG).', status: 400 }
  await db.query(
    `UPDATE trainer_site SET hero_image=$2, hero_kind='upload', hero_version=hero_version+1, updated_at=CURRENT_TIMESTAMP WHERE trainer_id=$1`,
    [trainerId, image],
  )
  return siteSettings(db, trainerId)
}
