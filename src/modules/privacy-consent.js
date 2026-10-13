// Aluno cuja conta foi criada pelo personal (no primeiro acesso) ou que aceitou
// uma versão antiga: aceita os Termos/Política e, separado, os dados de saúde (LGPD).
import { isDemoSession } from './demo-invite.js'

let box = null

export function ensurePrivacyAccepted(data, { request, reload } = {}) {
  // Na demonstração nada é salvo: o aceite não se aplica.
  if (isDemoSession()) return
  if (!data?.privacyPending || !request || box?.open) return
  box?.remove()
  box = document.createElement('dialog')
  box.className = 'demo-invite privacy-consent'
  // Sem aceitar não dá para seguir: Esc não fecha.
  box.addEventListener('cancel', (event) => event.preventDefault())
  const card = document.createElement('div')
  const title = document.createElement('h2')
  const updated = data.privacyPending === 'updated'
  title.textContent = updated ? 'Atualizamos nossos Termos e Política' : 'Antes de continuar'
  const text = document.createElement('p')
  text.append(
    updated
      ? 'Os Termos de Uso e a Política de Privacidade mudaram. Para continuar usando a área do aluno, leia e aceite a nova versão.'
      : 'Sua conta foi criada pelo seu personal. Para usar a área do aluno, leia e aceite os documentos abaixo.',
  )
  // LGPD: aceite dos Termos e, separado e destacado, o dos dados de saúde.
  const terms = check()
  terms.label.append('Li e concordo com os ', link('/termos.html', 'Termos de Uso'), ' e a ', link('/privacidade.html', 'Política de Privacidade'), '.')
  const health = check()
  const strong = document.createElement('b')
  strong.textContent = 'Autorizo o uso dos meus dados de saúde'
  health.label.append(
    strong,
    ' (avaliação física, medidas, fotos do corpo, PAR-Q, autoavaliação e check-ins) somente para o meu acompanhamento com este personal. Posso retirar a autorização excluindo a minha conta.',
  )
  const status = document.createElement('small')
  status.setAttribute('role', 'status')
  const actions = document.createElement('div')
  actions.className = 'demo-invite-actions'
  const accept = document.createElement('button')
  accept.type = 'button'
  accept.className = 'button button--primary'
  accept.textContent = 'Li e aceito'
  accept.disabled = true
  const sync = () => (accept.disabled = !(terms.input.checked && health.input.checked))
  terms.input.addEventListener('change', sync)
  health.input.addEventListener('change', sync)
  accept.addEventListener('click', async () => {
    if (!(terms.input.checked && health.input.checked)) return
    accept.disabled = true
    status.textContent = 'Salvando…'
    try {
      await request('privacy-accept', { acceptTerms: true, acceptHealth: true })
      box.close()
      box.remove()
      box = null
      await reload?.()
    } catch (error) {
      status.textContent = error.message
      sync()
    }
  })
  actions.append(accept)
  card.append(title, text, terms.row, health.row, status, actions)
  box.append(card)
  document.body.append(box)
  box.showModal()
}

function check() {
  const row = document.createElement('label')
  row.className = 'consent-check'
  const input = document.createElement('input')
  input.type = 'checkbox'
  const label = document.createElement('span')
  row.append(input, label)
  return { row, input, label }
}

function link(href, label) {
  const a = document.createElement('a')
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener'
  a.textContent = label
  return a
}
