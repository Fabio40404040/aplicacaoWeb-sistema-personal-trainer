import mercadoPagoLogo from '../assets/mercado-pago-logo.png'

let sdkPromise
let cardForm

function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve()
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.async = true
    script.addEventListener('load', resolve, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('Não foi possível carregar o formulário seguro do Mercado Pago.')),
      { once: true },
    )
    document.head.append(script)
  })
  return sdkPromise
}

function createDialog() {
  let dialog = document.querySelector('[data-card-payment-dialog]')
  if (dialog) return dialog
  dialog = document.createElement('dialog')
  dialog.className = 'modal card-payment-dialog'
  dialog.dataset.cardPaymentDialog = ''
  dialog.innerHTML = `<div class="card-payment-shell"><header><div><span class="eyebrow eyebrow--blue">Checkout seguro</span><h2>Pagamento com cartão</h2></div><button class="icon-button" type="button" data-card-close aria-label="Fechar">×</button></header><div class="modal-body"><div class="mercado-pago-brand"><img src="${mercadoPagoLogo}" alt="Mercado Pago"><span>Pagamento processado com segurança</span></div><section class="card-order-summary" aria-label="Resumo da compra"><div><span>Plano selecionado</span><strong data-card-description></strong></div><strong data-card-amount></strong></section><div data-card-loading>Carregando campos seguros do Mercado Pago…</div><form id="mp-card-form" class="secure-card-form"><label class="field card-number-field"><span>Número do cartão</span><div id="mp-card-number" class="mp-secure-field"></div></label><div class="field-grid card-meta-grid"><label class="field"><span>Validade</span><div id="mp-expiration-date" class="mp-secure-field"></div></label><label class="field"><span>CVV</span><div id="mp-security-code" class="mp-secure-field"></div></label></div><div class="field-grid card-payment-options"><label class="field installments-field"><span>Como deseja parcelar?</span><select id="mp-installments" required><option value="">Informe o cartão primeiro</option></select><small>As opções são calculadas pelo Mercado Pago.</small></label><div class="card-brand-field"><span>Bandeira identificada</span><div class="card-brand-result" aria-live="polite"><img data-card-brand-image alt="" hidden><strong data-card-brand-name>Digite o número do cartão</strong></div></div><select id="mp-issuer" hidden aria-hidden="true" tabindex="-1"></select></div><label class="field"><span>Nome impresso no cartão</span><input id="mp-cardholder-name" autocomplete="cc-name" required></label><label class="field"><span>E-mail do titular</span><input id="mp-cardholder-email" type="email" autocomplete="email" required></label><div class="field-grid card-document-grid"><label class="field"><span>Tipo</span><select id="mp-identification-type" required></select></label><label class="field"><span>CPF do titular</span><input id="mp-identification-number" inputmode="numeric" autocomplete="off" required></label></div><button id="mp-card-submit" class="button button--primary card-pay-button" type="submit">Pagar com segurança</button><progress class="card-payment-progress" value="0">Processando…</progress><p role="status" aria-live="polite"></p></form><small class="card-security-note"><strong>Seus dados estão protegidos.</strong> Número, validade e CVV são tokenizados diretamente pelo Mercado Pago e não ficam armazenados na FARISA Personal.</small></div></div>`
  document.body.append(dialog)
  return dialog
}

function paymentMessage(result) {
  if (result.status === 'approved') return 'Pagamento aprovado. Seu acesso foi liberado.'
  if (['pending', 'in_process', 'authorized'].includes(result.status))
    return 'Pagamento recebido e em análise. O acesso será liberado após a aprovação.'
  return 'Pagamento não aprovado. Confira os dados ou tente outro cartão.'
}

function updateCardBrand(dialog, response) {
  const brandName = dialog.querySelector('[data-card-brand-name]')
  const brandImage = dialog.querySelector('[data-card-brand-image]')
  const methods = Array.isArray(response) ? response : response?.results
  const method = methods?.find((item) => item.payment_type_id === 'credit_card') || methods?.[0]

  if (!method) {
    brandName.textContent = 'Digite o número do cartão'
    brandImage.hidden = true
    brandImage.removeAttribute('src')
    brandImage.alt = ''
    return
  }

  brandName.textContent = method.name || method.id.toUpperCase()
  const imageUrl = method.secure_thumbnail || method.thumbnail
  if (imageUrl) {
    brandImage.src = imageUrl
    brandImage.alt = `Bandeira ${brandName.textContent}`
    brandImage.hidden = false
  } else {
    brandImage.hidden = true
    brandImage.removeAttribute('src')
  }
}

export async function openSecureCardForm(request, { onApproved } = {}) {
  const config = await request('payments/card-config')
  await loadMercadoPagoSdk()
  if (!window.MercadoPago)
    throw new Error('O formulário seguro do Mercado Pago está indisponível neste momento.')

  const dialog = createDialog()
  const form = dialog.querySelector('#mp-card-form')
  const status = form.querySelector('[role="status"]')
  const submit = form.querySelector('#mp-card-submit')
  const progress = form.querySelector('.card-payment-progress')
  const formattedAmount = Number(config.amount).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  dialog.querySelector('[data-card-description]').textContent = config.description
  dialog.querySelector('[data-card-amount]').textContent = formattedAmount
  form.querySelector('#mp-cardholder-email').value = config.payerEmail
  updateCardBrand(dialog)
  status.textContent = ''
  submit.disabled = false
  dialog.querySelector('[data-card-loading]').hidden = false
  form.hidden = true

  if (cardForm && typeof cardForm.unmount === 'function') cardForm.unmount()
  const mercadoPago = new window.MercadoPago(config.publicKey, { locale: 'pt-BR' })
  cardForm = mercadoPago.cardForm({
    amount: config.amount,
    iframe: true,
    form: {
      id: 'mp-card-form',
      cardNumber: { id: 'mp-card-number', placeholder: 'Número do cartão' },
      expirationDate: { id: 'mp-expiration-date', placeholder: 'MM/AA' },
      securityCode: { id: 'mp-security-code', placeholder: 'CVV' },
      cardholderName: { id: 'mp-cardholder-name', placeholder: 'Como aparece no cartão' },
      cardholderEmail: { id: 'mp-cardholder-email', placeholder: 'E-mail' },
      issuer: { id: 'mp-issuer', placeholder: 'Banco emissor' },
      installments: { id: 'mp-installments', placeholder: 'Parcelas' },
      identificationType: { id: 'mp-identification-type', placeholder: 'Documento' },
      identificationNumber: { id: 'mp-identification-number', placeholder: 'CPF' },
    },
    callbacks: {
      onFormMounted(error) {
        if (error) {
          status.textContent = 'Não foi possível preparar os campos seguros do cartão.'
          return
        }
        dialog.querySelector('[data-card-loading]').hidden = true
        form.hidden = false
      },
      onPaymentMethodsReceived(error, paymentMethods) {
        updateCardBrand(dialog, error ? undefined : paymentMethods)
      },
      async onSubmit(event) {
        event.preventDefault()
        submit.disabled = true
        status.textContent = 'Processando o pagamento com segurança…'
        try {
          const data = cardForm.getCardFormData()
          const result = await request('payments/card', {
            token: data.token,
            issuerId: data.issuerId,
            paymentMethodId: data.paymentMethodId,
            installments: Number(data.installments),
            identificationType: data.identificationType,
            identificationNumber: data.identificationNumber,
          })
          status.textContent = paymentMessage(result)
          if (result.status === 'approved') {
            onApproved?.()
            window.setTimeout(() => dialog.close(), 1200)
          } else submit.disabled = false
        } catch (error) {
          status.textContent = error.message
          submit.disabled = false
        }
      },
      onFetching() {
        progress.removeAttribute('value')
        return () => progress.setAttribute('value', '0')
      },
    },
  })

  const close = () => dialog.close()
  dialog.querySelector('[data-card-close]').onclick = close
  if (!dialog.open) dialog.showModal()
}
