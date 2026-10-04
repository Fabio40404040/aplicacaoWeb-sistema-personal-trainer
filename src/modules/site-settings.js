// Painel → "Meu site": o personal personaliza a própria página (marca, cor,
// banner, contato, redes e preços dos planos). A estrutura do site é fixa.
import { fetchSiteSettings, saveSiteHero, saveSiteSettings } from './api-client.js'
import { ACCENTS } from './site-brand.js'
import { showToast } from './utils.js'

const HERO_WIDTH = 1600
const HERO_HEIGHT = 900
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

let site = null
let presets = null
const draft = { accent: 'blue', heroKind: 'default', heroPreset: null }

const pageUrl = (slug = site?.slug) => `${location.origin}/p/${slug}`

// Banners prontos: arquivos public/banners/banner-1 … banner-12 (.webp ou .jpg).
function findPresets() {
  if (presets) return Promise.resolve(presets)
  const probe = (file) =>
    new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve(image.naturalWidth > 200 ? file : null)
      image.onerror = () => resolve(null)
      image.src = `/banners/${file}`
    })
  const files = []
  for (let index = 1; index <= 12; index += 1) files.push(`banner-${index}.webp`, `banner-${index}.jpg`)
  return Promise.all(files.map(probe)).then((found) => {
    presets = found.filter(Boolean)
    return presets
  })
}

// Recorta no centro e reduz para 1600 × 900 (o navegador faz o ajuste).
async function prepareHero(file) {
  if (!/^image\/(jpeg|png|webp)$/u.test(file.type)) throw new Error('Escolha uma foto JPG, PNG ou WebP.')
  if (file.size > 25 * 1024 * 1024) throw new Error('Esta foto é muito pesada. Escolha uma de até 25 MB.')
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('Não foi possível abrir esta foto. Tente outra.')
  if (bitmap.width < 800) throw new Error('Esta foto é pequena demais. Use uma com pelo menos 800 px de largura.')
  const canvas = document.createElement('canvas')
  canvas.width = HERO_WIDTH
  canvas.height = HERO_HEIGHT
  const scale = Math.max(HERO_WIDTH / bitmap.width, HERO_HEIGHT / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  const context = canvas.getContext('2d')
  // Fotos em pé: privilegia a parte de cima (rosto).
  const top = bitmap.height > bitmap.width ? (HERO_HEIGHT - height) * 0.25 : (HERO_HEIGHT - height) / 2
  context.drawImage(bitmap, (HERO_WIDTH - width) / 2, top, width, height)
  for (const quality of [0.82, 0.72, 0.6, 0.5]) {
    const data = canvas.toDataURL('image/jpeg', quality)
    if (data.length < 900_000) return data
  }
  throw new Error('Não foi possível reduzir esta foto. Tente outra imagem.')
}

function field(label, name, value, extra = {}) {
  const wrap = el('label', 'field')
  const input = el('input')
  Object.assign(input, { name, value: value ?? '', ...extra })
  wrap.append(el('span', '', label), input)
  return wrap
}
function section(title, hint) {
  const card = el('section', 'panel site-card')
  card.append(el('h2', '', title))
  if (hint) card.append(el('p', 'support-muted', hint))
  return card
}

function linkCard() {
  const card = el('section', 'panel site-card site-link-card')
  card.append(
    el('h2', '', 'Sua página'),
    el('p', 'support-muted', 'Divulgue este link. Quem se cadastra por ele já entra como seu aluno.'),
  )
  const row = el('div', 'site-link-row')
  const url = el('code', 'site-link', pageUrl())
  const copy = el('button', 'button button--secondary', 'Copiar link')
  const open = el('a', 'button button--secondary', 'Ver página')
  copy.type = 'button'
  open.href = pageUrl()
  open.target = '_blank'
  open.rel = 'noopener'
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pageUrl())
      copy.textContent = 'Link copiado'
    } catch {
      copy.textContent = 'Copie o link ao lado'
    }
    window.setTimeout(() => (copy.textContent = 'Copiar link'), 2000)
  })
  row.append(url, copy, open)
  card.append(row)
  return card
}

function brandCard(form) {
  const card = section('Marca', 'O nome que aparece na logo, no topo do site.')
  const grid = el('div', 'field-grid')
  grid.append(
    field('Nome da logo (destaque)', 'brandMark', site.brandMark, { maxLength: 14, placeholder: 'Ex.: CARLA' }),
    field('Complemento', 'brandName', site.brandName, { maxLength: 24, placeholder: 'Ex.: Personal' }),
  )
  card.append(grid)
  {
    const slug = field('Endereço da sua página', 'slug', site.slug, { maxLength: 30, required: true, pattern: '[a-zA-Z0-9-]{3,30}' })
    slug.append(el('small', 'support-muted', `${location.origin}/p/…  ·  só letras, números e hífen. Mudar o endereço invalida o link antigo.`))
    card.append(slug)
  }
  card.append(el('strong', 'site-sub', 'Cor da marca'))
  const swatches = el('div', 'site-swatches')
  Object.entries(ACCENTS).forEach(([name, accent]) => {
    const swatch = el('button', `site-swatch${draft.accent === name ? ' is-active' : ''}`)
    swatch.type = 'button'
    swatch.style.setProperty('--swatch', accent.main)
    swatch.title = accent.label
    swatch.setAttribute('aria-label', `Cor ${accent.label}`)
    swatch.setAttribute('aria-pressed', String(draft.accent === name))
    swatch.addEventListener('click', () => {
      draft.accent = name
      swatches.querySelectorAll('.site-swatch').forEach((node) => {
        node.classList.toggle('is-active', node === swatch)
        node.setAttribute('aria-pressed', String(node === swatch))
      })
    })
    swatches.append(swatch)
  })
  card.append(swatches)
  form.append(card)
}

function heroCard(form) {
  const card = section('Banner principal', 'A foto grande do topo da página.')
  const preview = el('div', 'site-hero-preview')
  const paintPreview = () => {
    const url =
      draft.heroKind === 'upload' && site.hero?.kind === 'upload'
        ? site.hero.url
        : draft.heroKind === 'preset' && draft.heroPreset
          ? `/banners/${draft.heroPreset}`
          : null
    preview.style.backgroundImage = url ? `url("${url}")` : ''
    preview.classList.toggle('is-empty', !url)
    preview.textContent = url ? '' : site.isOwner ? 'Banner padrão do site' : 'Banner padrão'
  }
  const upload = el('label', 'button button--primary site-upload')
  const input = el('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png,image/webp'
  input.hidden = true
  const uploadText = el('span', '', 'Enviar minha foto')
  upload.append(input, uploadText)
  const status = el('small', 'site-status')
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    uploadText.textContent = 'Ajustando a foto…'
    status.textContent = ''
    try {
      site = { ...site, ...(await saveSiteHero(await prepareHero(file))) }
      draft.heroKind = 'upload'
      paintPreview()
      paintChoices()
      showToast('Foto do banner atualizada.')
    } catch (error) {
      status.textContent = error.message
    } finally {
      uploadText.textContent = 'Enviar minha foto'
    }
  })
  const choices = el('div', 'site-presets')
  const choice = (label, active, onClick, image) => {
    const button = el('button', `site-preset${active ? ' is-active' : ''}`)
    button.type = 'button'
    if (image) button.style.backgroundImage = `url("${image}")`
    button.append(el('span', '', label))
    button.addEventListener('click', () => {
      onClick()
      paintPreview()
      paintChoices()
    })
    return button
  }
  function paintChoices() {
    const items = [
      choice('Padrão', draft.heroKind === 'default', () => {
        draft.heroKind = 'default'
      }),
    ]
    if (site.hero?.kind === 'upload' || draft.heroKind === 'upload')
      items.push(
        choice('Minha foto', draft.heroKind === 'upload', () => {
          draft.heroKind = 'upload'
        }, site.hero?.kind === 'upload' ? site.hero.url : ''),
      )
    ;(presets || []).forEach((file, index) =>
      items.push(
        choice(`Banner ${index + 1}`, draft.heroKind === 'preset' && draft.heroPreset === file, () => {
          draft.heroKind = 'preset'
          draft.heroPreset = file
        }, `/banners/${file}`),
      ),
    )
    choices.replaceChildren(...items)
  }
  paintPreview()
  paintChoices()
  void findPresets().then(paintChoices)
  card.append(
    preview,
    upload,
    el('small', 'support-muted', `Tamanho recomendado: ${HERO_WIDTH} × ${HERO_HEIGHT} px, foto deitada (paisagem). Qualquer foto serve: o recorte e o ajuste são automáticos.`),
    status,
    el('strong', 'site-sub', 'Ou escolha um banner pronto'),
    choices,
  )
  form.append(card)
}

function plansCard(form) {
  const card = section('Preços dos planos', 'Defina quanto você cobra por mês em cada plano e desligue os que não vende. O que cada plano libera no app é igual para todos.')
  const list = el('div', 'site-plans')
  site.plans.forEach((plan) => {
    const row = el('div', 'site-plan')
    row.dataset.code = plan.code
    const toggle = el('label', 'site-plan-toggle')
    const check = el('input')
    check.type = 'checkbox'
    check.name = 'active'
    check.checked = plan.active
    toggle.append(check, el('span', '', plan.name))
    const price = el('label', 'site-plan-price')
    const input = el('input')
    Object.assign(input, { type: 'number', name: 'price', min: '1', step: '0.01', required: true, inputMode: 'decimal' })
    input.value = (plan.priceCents / 100).toFixed(2)
    price.append(el('span', '', 'R$'), input, el('small', '', plan.accessType === 'permanent' ? 'pagamento único' : 'por mês'))
    const sync = () => {
      row.classList.toggle('is-off', !check.checked)
      input.disabled = !check.checked
    }
    check.addEventListener('change', sync)
    sync()
    row.append(toggle, price)
    list.append(row)
  })
  card.append(list, el('small', 'support-muted', 'Trimestral, semestral e anual são calculados a partir do valor mensal, com 5%, 10% e 15% de desconto.'))
  form.append(card)
}

function contactCard(form) {
  const card = section('Contato e redes sociais', 'Aparecem no fim da página. O que ficar vazio não é mostrado.')
  const contact = site.contact || {}
  const grid = el('div', 'field-grid')
  grid.append(
    field('WhatsApp (com DDD)', 'whatsapp', contact.whatsapp ? contact.whatsapp.replace(/^55/u, '') : '', { maxLength: 20, inputMode: 'tel', placeholder: '81 99999-0000' }),
    field('E-mail de contato', 'email', contact.email, { type: 'email', maxLength: 120 }),
  )
  const social = el('div', 'field-grid')
  social.append(
    field('Instagram', 'instagram', contact.instagram, { maxLength: 80, placeholder: '@seuperfil' }),
    field('Facebook', 'facebook', contact.facebook, { maxLength: 80, placeholder: 'seuperfil' }),
    field('TikTok', 'tiktok', contact.tiktok, { maxLength: 80, placeholder: '@seuperfil' }),
  )
  card.append(grid, field('Endereço de atendimento', 'address', contact.address, { maxLength: 160, placeholder: 'Rua, número · bairro · cidade' }), social)
  form.append(card)
}

function render() {
  const root = document.querySelector('[data-site-root]')
  if (!root || !site) return
  if (!site.ready) {
    root.replaceChildren(el('p', 'support-muted', 'Esta área será liberada na próxima atualização da plataforma.'))
    return
  }
  const form = el('form', 'site-form')
  form.noValidate = false
  brandCard(form)
  heroCard(form)
  plansCard(form)
  contactCard(form)
  const bar = el('div', 'site-save')
  const status = el('p', 'site-status')
  status.setAttribute('role', 'status')
  const save = el('button', 'button button--primary', 'Salvar meu site')
  save.type = 'submit'
  bar.append(status, save)
  form.append(bar)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    save.disabled = true
    status.textContent = 'Salvando…'
    const values = Object.fromEntries(new FormData(form))
    try {
      site = {
        ...site,
        ...(await saveSiteSettings({
          slug: values.slug || site.slug,
          brandMark: values.brandMark,
          brandName: values.brandName,
          accent: draft.accent,
          heroKind: draft.heroKind,
          heroPreset: draft.heroPreset,
          whatsapp: values.whatsapp,
          email: values.email,
          address: values.address,
          instagram: values.instagram,
          facebook: values.facebook,
          tiktok: values.tiktok,
          plans: [...form.querySelectorAll('.site-plan')].map((row) => ({
            code: row.dataset.code,
            active: row.querySelector('[name="active"]').checked,
            priceCents: Math.round(Number(row.querySelector('[name="price"]').value) * 100),
          })),
        })),
      }
      syncDraft()
      render()
      showToast('Site atualizado. As mudanças já estão no ar.')
    } catch (error) {
      status.textContent = error.message
      save.disabled = false
    }
  })
  root.replaceChildren(linkCard(), form)
}

function syncDraft() {
  draft.accent = site.accent || 'blue'
  draft.heroKind = site.hero?.kind || 'default'
  draft.heroPreset = site.heroPreset || null
}

async function load() {
  if (!sessionStorage.getItem('farisa-coach-api-token')) return
  const root = document.querySelector('[data-site-root]')
  try {
    site = await fetchSiteSettings()
    syncDraft()
    render()
  } catch (error) {
    if (root && !site) root.replaceChildren(el('p', 'support-muted', error.message))
  }
}

export function initSiteSettings() {
  window.addEventListener('hashchange', () => {
    if (location.hash === '#meu-site') void load()
  })
  if (location.hash === '#meu-site') void load()
}
