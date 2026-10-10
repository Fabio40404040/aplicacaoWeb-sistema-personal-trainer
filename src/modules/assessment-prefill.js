// Nova avaliação física: mostra os dados da última avaliação do aluno.
// - Altura vem preenchida (quase não muda).
// - Os outros campos ficam vazios, com "anterior: …" embaixo, para comparar
//   sem salvar um número velho por engano.
// - "Copiar dados da última avaliação" preenche tudo de uma vez.
import { getData } from './state.js'

const FIELDS = [
  { name: 'weight', key: 'weightKg', unit: 'kg' },
  { name: 'height', key: 'heightCm', unit: 'cm', keep: true },
  { name: 'fat', key: 'bodyFatPercent', unit: '%' },
  { name: 'waist', key: 'waistCm', unit: 'cm' },
  { name: 'hip', key: 'hipCm', unit: 'cm' },
  { name: 'chest', key: 'chestCm', unit: 'cm' },
  { name: 'arm', key: 'armCm', unit: 'cm' },
  { name: 'thigh', key: 'thighCm', unit: 'cm' },
  { name: 'calf', key: 'calfCm', unit: 'cm' },
  { name: 'bloodPressure', key: 'bloodPressure', unit: '' },
  { name: 'restingHR', key: 'restingHr', unit: 'bpm' },
  { name: 'pushUps', key: 'pushUps', unit: 'rep.' },
  { name: 'plank', key: 'plankSeconds', unit: 's' },
  { name: 'sitAndReach', key: 'sitAndReachCm', unit: 'cm' },
  { name: 'restriction', key: 'restriction', unit: '' },
]

const shown = (value) => (value === null || value === undefined ? '' : String(value).trim())
const number = (value) => String(value).replace('.', ',')

function lastAssessment(studentId) {
  if (!studentId) return null
  const list = (getData().assessments || []).filter((item) => item.studentId === studentId)
  list.sort((a, b) => String(b.assessedAt || '').localeCompare(String(a.assessedAt || '')))
  return list[0] || null
}

export function initAssessmentPrefill() {
  const form = document.querySelector('[data-form="assessment"]')
  const dialog = form?.closest('dialog')
  const select = form?.querySelector('[name="student"]')
  if (!form || !select) return

  const box = document.createElement('div')
  box.className = 'assessment-previous'
  box.hidden = true
  select.closest('label')?.after(box)

  const hintFor = (input) => {
    const label = input.closest('label')
    let hint = label?.querySelector('.field-previous')
    if (!hint && label) {
      hint = document.createElement('small')
      hint.className = 'field-previous'
      label.append(hint)
    }
    return hint
  }
  const clear = () => {
    box.hidden = true
    box.replaceChildren()
    form.querySelectorAll('.field-previous').forEach((hint) => hint.remove())
    // Volta o exemplo original do campo.
    form.querySelectorAll('[data-example]').forEach((input) => {
      input.placeholder = input.dataset.example
      delete input.dataset.example
    })
    form.querySelectorAll('[data-prefilled]').forEach((input) => {
      if (input.value === input.dataset.prefilled) input.value = input.tagName === 'SELECT' ? 'Inicial' : ''
      delete input.dataset.prefilled
    })
  }

  const apply = () => {
    clear()
    const studentId = select.selectedOptions[0]?.dataset.studentId
    const last = lastAssessment(studentId)
    if (!last) return
    FIELDS.forEach((field) => {
      const input = form.elements[field.name]
      const previous = shown(last[field.key])
      if (!input || !previous) return
      const text = field.unit ? `${number(previous)} ${field.unit}` : previous
      const hint = hintFor(input)
      if (hint) hint.textContent = `anterior: ${text}`
      // Sem o exemplo cinza ("70,4"), que parecia um valor já preenchido.
      if (input.placeholder && input.dataset.example === undefined) {
        input.dataset.example = input.placeholder
        input.placeholder = ''
      }
      // Altura: já vem preenchida (se o campo estiver vazio).
      if (field.keep && !input.value) {
        input.value = previous
        input.dataset.prefilled = previous
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    // Já tem avaliação: a nova é uma reavaliação.
    const protocol = form.elements.protocol
    if (protocol && protocol.value === 'Inicial' && [...protocol.options].some((option) => option.value === 'Reavaliação'))
    {
      protocol.value = 'Reavaliação'
      protocol.dataset.prefilled = 'Reavaliação'
    }
    const title = document.createElement('span')
    title.textContent = `Última avaliação: ${last.date || ''}. Os valores anteriores aparecem embaixo de cada campo.`
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'button button--secondary'
    copy.textContent = 'Copiar dados da última avaliação'
    copy.addEventListener('click', () => {
      FIELDS.forEach((field) => {
        const input = form.elements[field.name]
        const previous = shown(last[field.key])
        if (input && previous) {
          input.value = previous
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })
      if (last.protocol && form.elements.protocol) form.elements.protocol.value = last.protocol
      if (form.elements.parq) form.elements.parq.checked = Boolean(last.parq)
      copy.textContent = '✓ Dados copiados — ajuste o que mudou'
      copy.disabled = true
    })
    box.append(title, copy)
    box.hidden = false
  }

  select.addEventListener('change', apply)
  // A janela abre por vários botões: confere sempre que ela abre.
  if (dialog)
    new MutationObserver(() => {
      if (dialog.open) window.setTimeout(apply, 0)
      else clear()
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] })
}
