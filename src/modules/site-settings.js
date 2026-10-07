// Painel → "Meu site": o personal personaliza a própria página (marca, cor,
// banner, contato, redes e preços dos planos). A estrutura do site é fixa.
import { fetchSiteSettings, saveSiteHero, saveSiteSettings } from './api-client.js'
import { ACCENTS } from './site-brand.js'
import { createQrCodeImage } from './pix.js'
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

// Ícone do app do aluno: quadrado na cor da marca, halter e o nome da logo.
function drawIcon(size, mark, accent) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  const unit = size / 512
  context.fillStyle = accent.dark
  context.fillRect(0, 0, size, size)
  context.fillStyle = accent.main
  context.beginPath()
  context.roundRect(28 * unit, 28 * unit, 456 * unit, 456 * unit, 112 * unit)
  context.fill()
  context.fillStyle = '#ffffff'
  const bar = (x, y, width, height, radius) => {
    context.beginPath()
    context.roundRect(x * unit, y * unit, width * unit, height * unit, radius * unit)
    context.fill()
  }
  bar(115, 150, 47, 98, 12)
  bar(350, 150, 47, 98, 12)
  bar(150, 185, 212, 28, 4)
  const text = String(mark || 'APP').toUpperCase().slice(0, 14)
  let font = 86
  do {
    context.font = `800 ${font * unit}px "Ubuntu Sans", system-ui, -apple-system, "Segoe UI", sans-serif`
    font -= 4
  } while (context.measureText(text).width > 360 * unit && font > 26)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 256 * unit, 340 * unit)
  return canvas.toDataURL('image/png')
}
const markOf = (value) => String(value || site?.brandMark || (site?.trainerName || 'Personal').split(/\s+/u)[0]).slice(0, 14)

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
  // QR Code para divulgar e o ícone que o aluno vê ao instalar o app.
  const share = el('div', 'site-share')
  const qrBox = el('div', 'site-share-item')
  const qr = el('img', 'site-qr')
  qr.alt = 'QR Code da sua página'
  const download = el('a', 'button button--secondary', 'Baixar QR Code')
  download.download = `qrcode-${site.slug}.png`
  void createQrCodeImage(pageUrl()).then((image) => {
    qr.src = image
    download.href = image
  })
  qrBox.append(qr, download)
  const iconBox = el('div', 'site-share-item')
  const icon = el('img', 'site-app-icon')
  icon.alt = 'Ícone do app do aluno'
  icon.src = drawIcon(192, markOf(), ACCENTS[site.accent] || ACCENTS.blue)
  iconBox.append(
    icon,
    el('small', 'support-muted', 'Assim o seu app aparece no celular do aluno. O nome e a cor vêm da sua marca.'),
  )
  share.append(qrBox, iconBox)
  card.append(share)
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

// Foto do personal para o banner: precisa ter fundo transparente para ficar
// "em pé" na frente do fundo. Devolve { cutout: dataURL } ou { opaque: true }.
const CUTOUT_HEIGHT = 1400
async function prepareCutout(file) {
  if (/heic|heif/iu.test(file.type) || /\.hei[cf]$/iu.test(file.name))
    throw new Error('Foto HEIC (iPhone) não funciona aqui. Veja abaixo como resolver pelo Canva.')
  if (!/^image\/(jpeg|png|webp)$/u.test(file.type)) throw new Error('Escolha uma foto PNG, JPG ou WebP.')
  if (file.size > 25 * 1024 * 1024) throw new Error('Esta foto é muito pesada. Escolha uma de até 25 MB.')
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('Não foi possível abrir esta foto. Tente outra.')
  // Primeiro, uma cópia pequena só para medir a transparência e as margens.
  const probe = document.createElement('canvas')
  const probeScale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height))
  probe.width = Math.max(1, Math.round(bitmap.width * probeScale))
  probe.height = Math.max(1, Math.round(bitmap.height * probeScale))
  const probeContext = probe.getContext('2d', { willReadFrequently: true })
  probeContext.drawImage(bitmap, 0, 0, probe.width, probe.height)
  const { data } = probeContext.getImageData(0, 0, probe.width, probe.height)
  let clear = 0
  let left = probe.width
  let right = -1
  let top = probe.height
  let bottom = -1
  for (let y = 0; y < probe.height; y += 1)
    for (let x = 0; x < probe.width; x += 1) {
      if (data[(y * probe.width + x) * 4 + 3] < 24) clear += 1
      else {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  // Menos de 8% de transparência = foto comum, com fundo.
  if (right < 0 || clear / (probe.width * probe.height) < 0.08) return { opaque: true }
  // Corta as sobras transparentes para a pessoa ocupar a imagem toda.
  const box = {
    x: Math.max(0, (left - 2) / probeScale),
    y: Math.max(0, (top - 2) / probeScale),
    width: Math.min(bitmap.width, (right - left + 5) / probeScale),
    height: Math.min(bitmap.height, (bottom - top + 5) / probeScale),
  }
  for (const height of [CUTOUT_HEIGHT, 1100, 900, 700]) {
    const scale = Math.min(1, height / box.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(box.width * scale))
    canvas.height = Math.max(1, Math.round(box.height * scale))
    canvas.getContext('2d').drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height)
    const webp = canvas.toDataURL('image/webp', 0.9)
    const image = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png')
    if (image.length < 1_350_000) return { cutout: image }
  }
  throw new Error('Não foi possível reduzir esta foto. Tente uma imagem menor.')
}

// Como tirar o fundo da foto, de graça (usado na dica e abaixo do botão).
function removeBackgroundHelp() {
  const sites = el('p', '')
  const link = el('a', '', 'remove.bg')
  link.href = 'https://www.remove.bg/pt-br'
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  sites.append('Remova o fundo grátis em ', link, ' ou IA e baixe em PNG.')
  return [
    sites,
    el('p', '', 'iPhone (foto HEIC): no Canva, arraste a foto ou faça upload e remova o fundo e baixe em PNG.'),
    el('p', '', 'Depois, peça a uma IA para ajustar o tamanho:'),
    el('p', 'site-photo-prompt', '“Ajuste esta imagem para 600 × 1800 px, corpo inteiro em pé, fundo transparente, em PNG.”'),
  ]
}

function heroCard(form) {
  const card = section('Banner principal', 'O topo da sua página: a sua foto na frente de um fundo de academia.')
  const preview = el('div', 'site-hero-preview')
  const person = el('div', 'site-hero-person')
  preview.append(person)
  const backgroundUrl = () =>
    draft.heroKind === 'upload' && site.hero?.kind === 'upload'
      ? site.hero.url
      : draft.heroKind === 'preset' && draft.heroPreset
        ? `/banners/${draft.heroPreset}`
        : '/banners/banner-1.webp'
  const paintPreview = () => {
    preview.style.backgroundImage = `url("${backgroundUrl()}")`
    person.style.backgroundImage = site.hero?.cutoutUrl ? `url("${site.hero.cutoutUrl}")` : ''
  }

  // ---- 1) Sua foto
  const upload = el('label', 'button button--primary site-upload')
  const input = el('input')
  input.type = 'file'
  input.accept = 'image/png,image/webp,image/jpeg,image/heic,image/heif,.heic,.heif'
  input.hidden = true
  const uploadText = el('span', '', 'Enviar minha foto')
  upload.append(input, uploadText)
  const remove = el('button', 'button button--secondary', 'Remover foto')
  remove.type = 'button'
  const status = el('div', 'site-photo-status')
  const photoActions = el('div', 'site-link-row')
  photoActions.append(upload, remove)
  const paintPhotoActions = () => {
    remove.hidden = !site.hero?.cutoutUrl
    uploadText.textContent = site.hero?.cutoutUrl ? 'Trocar minha foto' : 'Enviar minha foto'
  }
  remove.addEventListener('click', async () => {
    remove.disabled = true
    try {
      site = { ...site, ...(await saveSiteHero('', { removeCutout: true })) }
      paintPreview()
      paintPhotoActions()
      showToast('Foto removida do banner.')
    } catch (error) {
      status.replaceChildren(el('small', 'site-status', error.message))
    } finally {
      remove.disabled = false
    }
  })
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    uploadText.textContent = 'Ajustando a foto…'
    status.replaceChildren()
    try {
      const result = await prepareCutout(file)
      if (result.cutout) {
        site = { ...site, ...(await saveSiteHero(result.cutout, { cutout: true })) }
        if (draft.heroKind === 'upload') draft.heroKind = site.hero?.kind || 'default'
        paintPreview()
        paintChoices()
        showToast('Foto do banner atualizada.')
        return
      }
      // Foto comum (com fundo): explica como preparar e oferece usar como fundo.
      const useAnyway = el('button', 'button button--secondary', 'Usar assim mesmo, como fundo inteiro')
      useAnyway.type = 'button'
      useAnyway.addEventListener('click', async () => {
        useAnyway.disabled = true
        try {
          site = { ...site, ...(await saveSiteHero(await prepareHero(file))) }
          draft.heroKind = 'upload'
          status.replaceChildren()
          paintPreview()
          paintChoices()
          showToast('Foto aplicada como fundo do banner.')
        } catch (error) {
          status.replaceChildren(el('small', 'site-status', error.message))
        }
      })
      const tip = el('div', 'site-photo-tip')
      tip.append(
        el('strong', '', 'Esta foto tem fundo. Ela precisa ter fundo transparente.'),
        ...removeBackgroundHelp(),
        useAnyway,
      )
      status.replaceChildren(tip)
    } catch (error) {
      status.replaceChildren(el('small', 'site-status', error.message))
      if (/HEIC/u.test(error.message)) help.open = true
    } finally {
      paintPhotoActions()
    }
  })

  // ---- 2) Fundo
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
    const items = []
    if (site.hero?.kind === 'upload')
      items.push(
        choice('Minha foto de fundo', draft.heroKind === 'upload', () => {
          draft.heroKind = 'upload'
        }, site.hero.url),
      )
    ;(presets || []).forEach((file, index) =>
      items.push(
        choice(
          `Fundo ${index + 1}`,
          (draft.heroKind === 'preset' && draft.heroPreset === file) || (draft.heroKind === 'default' && index === 0),
          () => {
            draft.heroKind = 'preset'
            draft.heroPreset = file
          },
          `/banners/${file}`,
        ),
      ),
    )
    choices.replaceChildren(...items)
  }
  // Ajuda sempre à mão: como tirar o fundo da foto.
  const help = el('details', 'site-photo-help')
  const helpTitle = el('summary', '', 'Não tem a foto sem fundo? Veja como fazer, grátis')
  const helpBody = el('div', 'site-photo-tip')
  helpBody.append(...removeBackgroundHelp())
  help.append(helpTitle, helpBody)
  paintPreview()
  paintPhotoActions()
  paintChoices()
  void findPresets().then(paintChoices)
  card.append(
    preview,
    el('strong', 'site-sub', '1. Sua foto'),
    el(
      'small',
      'support-muted',
      'Envie uma foto sua de corpo inteiro, em pé, em PNG com fundo transparente (recomendado: 600 × 1800 px). O ajuste de tamanho é automático.',
    ),
    photoActions,
    status,
    help,
    el('strong', 'site-sub', '2. Fundo'),
    el('small', 'support-muted', 'Escolha o fundo que fica atrás da sua foto. Clique em “Salvar meu site” para aplicar.'),
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

function referralsCard(form) {
  if (!site.referralsReady) return
  const card = section(
    'Indicações para o aluno',
    'Aparecem na área do aluno, no cartão "Nutrição". Indique um nutricionista de confiança e, se quiser, um app para montar refeições e contar calorias. O que ficar vazio não é mostrado.',
  )
  const nutritionist = site.referrals?.nutritionist || {}
  const app = site.referrals?.app || {}
  const who = el('div', 'field-grid')
  who.append(
    field('Nutricionista (nome)', 'refNutriName', nutritionist.name, { maxLength: 80, placeholder: 'Ex.: Dra. Ana Lima' }),
    field('Registro (CRN)', 'refNutriRegistration', nutritionist.registration, { maxLength: 30, placeholder: 'Ex.: CRN-6 12345' }),
  )
  const reach = el('div', 'field-grid')
  reach.append(
    field('WhatsApp do nutricionista (com DDD)', 'refNutriWhatsapp', nutritionist.whatsapp ? nutritionist.whatsapp.replace(/^55/u, '') : '', { maxLength: 20, inputMode: 'tel', placeholder: '81 99999-0000' }),
    field('Instagram ou site', 'refNutriLink', nutritionist.link, { maxLength: 200, placeholder: 'instagram.com/perfil' }),
  )
  const appGrid = el('div', 'field-grid')
  appGrid.append(
    field('App de alimentação (nome)', 'refAppName', app.name, { maxLength: 60, placeholder: 'Ex.: nome do app que você recomenda' }),
    field('Link do app', 'refAppLink', app.link, { maxLength: 200, placeholder: 'Link da loja ou do site' }),
  )
  card.append(
    who,
    reach,
    field('Recado sobre o nutricionista', 'refNutriNote', nutritionist.note, { maxLength: 240, placeholder: 'Ex.: meus alunos têm desconto na primeira consulta' }),
    appGrid,
    field('Recado sobre o app', 'refAppNote', app.note, { maxLength: 240, placeholder: 'Ex.: use para anotar as refeições e me mostre no check-in' }),
  )
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
  referralsCard(form)
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
          icon192: drawIcon(192, markOf(values.brandMark), ACCENTS[draft.accent] || ACCENTS.blue),
          icon512: drawIcon(512, markOf(values.brandMark), ACCENTS[draft.accent] || ACCENTS.blue),
          heroKind: draft.heroKind,
          heroPreset: draft.heroPreset,
          whatsapp: values.whatsapp,
          email: values.email,
          address: values.address,
          instagram: values.instagram,
          facebook: values.facebook,
          tiktok: values.tiktok,
          ...(site.referralsReady
            ? {
                referrals: {
                  nutritionist: {
                    name: values.refNutriName,
                    registration: values.refNutriRegistration,
                    whatsapp: values.refNutriWhatsapp,
                    link: values.refNutriLink,
                    note: values.refNutriNote,
                  },
                  app: { name: values.refAppName, link: values.refAppLink, note: values.refAppNote },
                },
              }
            : {}),
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
