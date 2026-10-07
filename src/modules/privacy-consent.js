// Aluno cuja conta foi criada pelo personal: no primeiro acesso ele precisa
// aceitar os Termos de Uso e a Política de Privacidade (LGPD).
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
  title.textContent = 'Antes de continuar'
  const text = document.createElement('p')
  text.append(
    'Sua conta foi criada pelo seu personal. Para usar a área do aluno, leia e aceite os ',
    link('/termos.html', 'Termos de Uso'),
    ' e a ',
    link('/privacidade.html', 'Política de Privacidade'),
    '. Seus dados, inclusive de saúde, são usados só para o seu acompanhamento.',
  )
  const status = document.createElement('small')
  status.setAttribute('role', 'status')
  const actions = document.createElement('div')
  actions.className = 'demo-invite-actions'
  const accept = document.createElement('button')
  accept.type = 'button'
  accept.className = 'button button--primary'
  accept.textContent = 'Li e aceito'
  accept.addEventListener('click', async () => {
    accept.disabled = true
    status.textContent = 'Salvando…'
    try {
      await request('privacy-accept', {})
      box.close()
      box.remove()
      box = null
      await reload?.()
    } catch (error) {
      status.textContent = error.message
      accept.disabled = false
    }
  })
  actions.append(accept)
  card.append(title, text, status, actions)
  box.append(card)
  document.body.append(box)
  box.showModal()
}

function link(href, label) {
  const a = document.createElement('a')
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener'
  a.textContent = label
  return a
}
