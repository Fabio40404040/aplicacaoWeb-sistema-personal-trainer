// Janela com o carimbo "✓ PAGO" (na própria página, sem alert do navegador).
// Usada na área do aluno, na assinatura do personal e quando um aluno paga.
export function showPaidDialog({ title, text, button = 'Continuar' }) {
  if (document.querySelector('dialog.paid-dialog')) return
  const make = (tag, className, content) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (content !== undefined) node.textContent = content
    return node
  }
  const box = make('dialog', 'confirm-dialog paid-dialog')
  const body = make('div', 'paid-dialog-body')
  const ok = make('button', 'button button--primary', button)
  ok.type = 'button'
  ok.addEventListener('click', () => box.close())
  body.append(make('span', 'paid-stamp', '✓ PAGO'), make('h2', '', title), make('p', '', text), ok)
  box.append(body)
  box.addEventListener('close', () => box.remove())
  document.body.append(box)
  box.showModal()
}
