// Um exercício pode trabalhar mais de um grupo muscular (ex.: afundo no
// smith = quadríceps e glúteos). O campo continua sendo um texto só no
// banco, com os nomes separados por vírgula — esta função é o único lugar
// que sabe abrir essa lista de volta.
export function exerciseGroups(exercise) {
  return String(exercise?.group || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export function initials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function formatDate(value) {
  if (!value) return 'A definir'
  const normalized = value.includes('T') ? value : `${value}T12:00:00Z`
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(normalized))
    .replace('.', '')
}

// Caixas de confirmação e de digitação no visual do painel, no lugar das
// janelas cinzas do navegador (window.confirm / window.prompt).
function appDialog() {
  let dialog = document.querySelector('[data-app-dialog]')
  if (dialog) return dialog
  dialog = document.createElement('dialog')
  dialog.className = 'modal app-dialog'
  dialog.dataset.appDialog = ''
  dialog.innerHTML = `<form method="dialog">
    <header>
      <div>
        <span class="eyebrow eyebrow--blue" data-dialog-eyebrow></span>
        <h2 data-dialog-title></h2>
      </div>
      <button class="icon-button" type="submit" value="cancel" aria-label="Fechar">×</button>
    </header>
    <div class="modal-body">
      <p data-dialog-message></p>
      <label class="field" data-dialog-field hidden>
        <span data-dialog-label></span>
        <input data-dialog-input maxlength="40" autocomplete="off">
      </label>
      <p class="password-requirements" data-dialog-note hidden></p>
    </div>
    <footer>
      <button class="button button--secondary" type="submit" value="cancel">Cancelar</button>
      <button class="button button--primary" type="submit" value="confirm" data-dialog-confirm></button>
    </footer>
  </form>`
  document.body.append(dialog)
  return dialog
}

function openAppDialog({
  eyebrow,
  title,
  message,
  note = '',
  confirmLabel,
  danger = false,
  input = null,
}) {
  const dialog = appDialog()
  dialog.querySelector('[data-dialog-eyebrow]').textContent = eyebrow
  dialog.querySelector('[data-dialog-title]').textContent = title
  const messageNode = dialog.querySelector('[data-dialog-message]')
  messageNode.textContent = message || ''
  messageNode.hidden = !message
  const noteNode = dialog.querySelector('[data-dialog-note]')
  noteNode.textContent = note
  noteNode.hidden = !note
  const field = dialog.querySelector('[data-dialog-field]')
  const control = dialog.querySelector('[data-dialog-input]')
  field.hidden = !input
  control.required = Boolean(input)
  control.disabled = !input
  control.value = input?.value || ''
  control.placeholder = input?.placeholder || ''
  if (input) dialog.querySelector('[data-dialog-label]').textContent = input.label
  const confirm = dialog.querySelector('[data-dialog-confirm]')
  confirm.textContent = confirmLabel
  confirm.classList.toggle('button--danger', danger)
  dialog.returnValue = 'cancel'
  dialog.showModal()
  if (input) window.setTimeout(() => control.focus(), 40)
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => {
        const confirmed = dialog.returnValue === 'confirm'
        resolve(input ? (confirmed ? control.value.trim() : null) : confirmed)
      },
      { once: true },
    )
  })
}

export function askConfirm({
  title,
  message = '',
  note = '',
  eyebrow = 'Confirmar',
  confirmLabel = 'Excluir',
  danger = true,
}) {
  return openAppDialog({ eyebrow, title, message, note, confirmLabel, danger })
}

export function askText({
  title,
  message = '',
  label,
  value = '',
  placeholder = '',
  note = '',
  eyebrow = 'Biblioteca',
  confirmLabel = 'Salvar',
}) {
  return openAppDialog({
    eyebrow,
    title,
    message,
    note,
    confirmLabel,
    input: { label, value, placeholder },
  })
}

export function showToast(message) {
  const toast = document.querySelector('[data-toast]')
  toast.querySelector('span').textContent = message
  toast.classList.add('is-visible')
  window.clearTimeout(showToast.timer)
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600)
}
