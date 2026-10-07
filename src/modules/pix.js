// QR Code do Pix: transforma o código "copia e cola" em imagem.
import QRCode from 'qrcode'

export function createQrCodeImage(payload) {
  return QRCode.toDataURL(payload, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0e1b32', light: '#ffffff' },
  })
}
