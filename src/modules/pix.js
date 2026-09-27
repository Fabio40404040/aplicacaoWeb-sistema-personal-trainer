import QRCode from 'qrcode'

const pixConfig = {
  key: String(import.meta.env.VITE_PIX_KEY || 'contato@farisa.example').trim(),
  merchantName: String(import.meta.env.VITE_PIX_NAME || 'FARISA PERSONAL').trim(),
  merchantCity: String(import.meta.env.VITE_PIX_CITY || 'FORTALEZA').trim(),
}

function field(id, value) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

function safePixText(value, maxLength) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9 ]/gu, '')
    .toUpperCase()
    .slice(0, maxLength)
}

function crc16(payload) {
  let result = 0xffff
  for (const character of payload) {
    result ^= character.charCodeAt(0) << 8
    for (let bit = 0; bit < 8; bit += 1)
      result = (result & 0x8000) !== 0 ? (result << 1) ^ 0x1021 : result << 1
  }
  return (result & 0xffff).toString(16).toUpperCase().padStart(4, '0')
}

export function hasPixConfiguration() {
  return Boolean(pixConfig.key)
}

export function createPixPayload(amount = 99) {
  if (!pixConfig.key) return ''
  const merchantAccount = field('00', 'BR.GOV.BCB.PIX') + field('01', pixConfig.key)
  const additionalData = field('05', '***')
  const value = [
    field('00', '01'),
    field('26', merchantAccount),
    field('52', '0000'),
    field('53', '986'),
    field('54', Number(amount).toFixed(2)),
    field('58', 'BR'),
    field('59', safePixText(pixConfig.merchantName, 25)),
    field('60', safePixText(pixConfig.merchantCity, 15)),
    field('62', additionalData),
    '6304',
  ].join('')
  return `${value}${crc16(value)}`
}

export async function createPixQrCode(amount = 99) {
  const payload = createPixPayload(amount)
  if (!payload) return { payload: '', imageUrl: '' }
  return {
    payload,
    imageUrl: await createQrCodeImage(payload),
  }
}

export function createQrCodeImage(payload) {
  return QRCode.toDataURL(payload, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0e1b32', light: '#ffffff' },
  })
}
