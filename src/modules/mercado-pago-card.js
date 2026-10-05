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
  dialog.innerHTML = `<div class="card-payment-shell"><header><div><span class="eyebrow eyebrow--blue">Checkout seguro</span><h2>Pagamento com cartão</h2></div><button class="icon-button" type="button" data-card-close aria-label="Fechar">×</button></header><div class="modal-body"><div class="mercado-pago-brand"><img src="${mercadoPagoLogo}" alt="Mercado Pago"><span>Pagamento processado com segurança</span></div><section class="card-order-summary" aria-label="Resumo da compra"><div><span>Plano selecionado</span><strong data-card-description></strong></div><strong data-card-amount></strong></section><div data-card-loading>Carregando campos seguros do Mercado Pago…</div><form id="mp-card-form" class="secure-card-form"><p class="card-holder-tip"><strong>Use um cartão no seu nome.</strong> O nome e o CPF precisam ser do titular do cartão. Cartão de outra pessoa pode ser recusado pelo Mercado Pago.</p><label class="field card-number-field"><span>Número do cartão</span><div id="mp-card-number" class="mp-secure-field"></div></label><div class="field-grid card-meta-grid"><label class="field"><span>Validade</span><div id="mp-expiration-date" class="mp-secure-field"></div></label><label class="field"><span>CVV</span><div id="mp-security-code" class="mp-secure-field"></div></label></div><div class="field-grid card-payment-options"><label class="field installments-field"><span>Como deseja parcelar?</span><select id="mp-installments" required><option value="">Informe o cartão primeiro</option></select><small>As opções são calculadas pelo Mercado Pago.</small></label><div class="card-brand-field"><span>Bandeira identificada</span><div class="card-brand-result" aria-live="polite"><img data-card-brand-image alt="" hidden><strong data-card-brand-name>Digite o número do cartão</strong></div></div><select id="mp-issuer" hidden aria-hidden="true" tabindex="-1"></select></div><label class="field"><span>Nome impresso no cartão</span><input id="mp-cardholder-name" autocomplete="cc-name" required></label><label class="field"><span>E-mail do titular</span><input id="mp-cardholder-email" type="email" autocomplete="email" required></label><div class="field-grid card-document-grid"><label class="field"><span>Tipo</span><select id="mp-identification-type" required></select></label><label class="field"><span>CPF do titular</span><input id="mp-identification-number" inputmode="numeric" autocomplete="off" required></label></div><button id="mp-card-submit" class="button button--primary card-pay-button" type="submit">Pagar com segurança</button><progress class="card-payment-progress" value="0">Processando…</progress><p role="status" aria-live="polite"></p></form><small class="card-security-note"><strong>Seus dados estão protegidos.</strong> Número, validade e CVV são tokenizados diretamente pelo Mercado Pago e não ficam armazenados na FARISA Personal.</small></div></div>`
  document.body.append(dialog)
  return dialog
}

const REJECTIONS = {
  cc_rejected_bad_filled_card_number: 'Número do cartão incorreto. Confira e tente de novo.',
  cc_rejected_bad_filled_date: 'Validade do cartão incorreta. Confira e tente de novo.',
  cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) incorreto. Confira e tente de novo.',
  cc_rejected_bad_filled_other: 'Os dados do titular não conferem com o cartão. Confira o nome e o CPF do dono do cartão.',
  cc_rejected_insufficient_amount: 'Cartão sem limite suficiente. Tente outro cartão ou pague com Pix.',
  cc_rejected_call_for_authorize: 'O banco pediu autorização. Ligue para o banco do cartão e tente de novo.',
  cc_rejected_card_disabled: 'Cartão desativado. Ligue para o banco para ativar ou use outro cartão.',
  cc_rejected_duplicated_payment: 'Este pagamento já foi feito. Se precisar pagar de novo, use outro cartão ou o Pix.',
  cc_rejected_high_risk: 'Pagamento recusado por segurança. Use o cartão e o CPF do próprio titular ou pague com Pix.',
  cc_rejected_blacklist: 'Pagamento recusado por segurança. Tente outro cartão ou pague com Pix.',
  cc_rejected_max_attempts: 'Muitas tentativas com este cartão. Use outro cartão ou pague com Pix.',
  cc_rejected_invalid_installments: 'Este cartão não aceita esse número de parcelas. Escolha outra opção.',
  cc_rejected_card_type_not_allowed: 'Este tipo de cartão não é aceito. Use um cartão de crédito ou pague com Pix.',
}

function paymentMessage(result) {
  if (result.status === 'approved') return 'Pagamento aprovado. Seu acesso foi liberado.'
  if (['pending', 'in_process', 'authorized'].includes(result.status))
    return 'Pagamento recebido e em análise. O acesso será liberado após a aprovação.'
  return (
    REJECTIONS[result.statusDetail] ||
    'Pagamento não aprovado. Confira os dados do titular ou tente outro cartão.'
  )
}

function validDocument(type, value) {
  const digits = String(value || '').replace(/\D/gu, '')
  const check = (base, weights) => {
    const sum = weights.reduce((total, weight, index) => total + Number(base[index]) * weight, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  if (type === 'CNPJ') {
    if (digits.length !== 14 || /^(\d)\1+$/u.test(digits)) return false
    const first = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    return (
      check(digits, first) === Number(digits[12]) && check(digits, [6, ...first]) === Number(digits[13])
    )
  }
  if (digits.length !== 11 || /^(\d)\1+$/u.test(digits)) return false
  return (
    check(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[9]) &&
    check(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[10])
  )
}

// Confere o que dá para conferir antes de mandar ao Mercado Pago.
function holderProblem(form) {
  const name = form.querySelector('#mp-cardholder-name').value.trim()
  const email = form.querySelector('#mp-cardholder-email').value.trim()
  const type = form.querySelector('#mp-identification-type').value || 'CPF'
  const number = form.querySelector('#mp-identification-number').value
  if (name.length < 3) return 'Digite o nome como está impresso no cartão.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email)) return 'E-mail inválido. Confira o e-mail do titular.'
  if (!validDocument(type, number)) return `${type} inválido. Confira os números do documento do titular.`
  return ''
}

const FIELD_NAMES = {
  cardNumber: 'número do cartão',
  expirationDate: 'validade',
  expirationMonth: 'validade',
  expirationYear: 'validade',
  securityCode: 'código de segurança (CVV)',
  cardholderName: 'nome impresso no cartão',
  cardholderEmail: 'e-mail',
  identificationType: 'tipo de documento',
  identificationNumber: 'CPF',
  installments: 'parcelas',
  issuer: 'banco emissor',
}

function formErrorMessage(error) {
  const list = (Array.isArray(error) ? error : [error]).filter(Boolean)
  const text = list.map((item) => `${item.field || ''} ${item.message || ''} ${item.code || ''}`).join(' ')
  const fields = [
    ...new Set(
      Object.keys(FIELD_NAMES)
        .filter((key) => text.includes(key))
        .map((key) => FIELD_NAMES[key]),
    ),
  ]
  if (fields.length) return `Confira: ${fields.join(', ')}.`
  return 'Não foi possível validar o cartão. Confira os dados e tente de novo.'
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
  const say = (text, tone = '') => {
    status.textContent = text
    status.dataset.tone = tone
  }
  say('')
  submit.disabled = false
  // Roda antes do Mercado Pago: dado errado do titular para aqui, com aviso.
  if (!dialog.dataset.checked) {
    dialog.dataset.checked = 'true'
    dialog.addEventListener(
      'submit',
      (event) => {
        if (event.target.id !== 'mp-card-form') return
        const problem = holderProblem(event.target)
        if (!problem) return
        event.preventDefault()
        event.stopPropagation()
        const line = event.target.querySelector('[role="status"]')
        line.textContent = problem
        line.dataset.tone = 'error'
      },
      true,
    )
  }
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
          say('Não foi possível preparar os campos seguros do cartão.', 'error')
          return
        }
        dialog.querySelector('[data-card-loading]').hidden = true
        form.hidden = false
      },
      onPaymentMethodsReceived(error, paymentMethods) {
        updateCardBrand(dialog, error ? undefined : paymentMethods)
      },
      onError(error) {
        say(formErrorMessage(error), 'error')
        submit.disabled = false
      },
      onCardTokenReceived(error) {
        if (!error) return
        say(formErrorMessage(error), 'error')
        submit.disabled = false
      },
      async onSubmit(event) {
        event.preventDefault()
        submit.disabled = true
        say('Processando o pagamento com segurança…')
        try {
          const data = cardForm.getCardFormData()
          const result = await request('payments/card', {
            token: data.token,
            issuerId: data.issuerId,
            paymentMethodId: data.paymentMethodId,
            installments: Number(data.installments),
            identificationType: data.identificationType,
            identificationNumber: data.identificationNumber,
            // Ajudam o antifraude do Mercado Pago a reconhecer um pagamento legítimo.
            cardholderName: form.querySelector('#mp-cardholder-name').value.trim(),
            deviceId: String(window.MP_DEVICE_SESSION_ID || ''),
          })
          say(paymentMessage(result), result.status === 'approved' ? '' : result.status === 'rejected' ? 'error' : '')
          if (result.status === 'approved') {
            onApproved?.()
            window.setTimeout(() => dialog.close(), 1200)
          } else submit.disabled = false
        } catch (error) {
          say(error.message, 'error')
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
