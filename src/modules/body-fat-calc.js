// Calculadora de gordura corporal dentro do formulário de avaliação física.
// O personal informa as dobras (adipômetro) ou as medidas de fita, e o sistema
// calcula o percentual, a massa gorda e a massa magra. O resultado preenche o
// campo "Gordura (%)" e o método usado fica anotado nas observações.
import '../styles/body-fat-calc.css'

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
const num = (value, digits = 1) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits })

// Siri: densidade corporal → percentual de gordura.
const siri = (density) => 495 / density - 450

const METHODS = {
  jp3: {
    label: 'Dobras cutâneas · 3 dobras (Jackson & Pollock)',
    short: 'Jackson & Pollock 3 dobras',
    unit: 'mm',
    fields: {
      M: [['chest', 'Peitoral'], ['abdomen', 'Abdômen'], ['thigh', 'Coxa']],
      F: [['triceps', 'Tríceps'], ['suprailiac', 'Supra-ilíaca'], ['thigh', 'Coxa']],
    },
    compute(sex, age, v) {
      const sum = Object.values(v).reduce((a, b) => a + b, 0)
      return siri(
        sex === 'M'
          ? 1.10938 - 0.0008267 * sum + 0.0000016 * sum ** 2 - 0.0002574 * age
          : 1.0994921 - 0.0009929 * sum + 0.0000023 * sum ** 2 - 0.0001392 * age,
      )
    },
  },
  jp7: {
    label: 'Dobras cutâneas · 7 dobras (Jackson & Pollock)',
    short: 'Jackson & Pollock 7 dobras',
    unit: 'mm',
    fields: {
      M: [['chest', 'Peitoral'], ['midaxillary', 'Axilar média'], ['triceps', 'Tríceps'], ['subscapular', 'Subescapular'], ['abdomen', 'Abdômen'], ['suprailiac', 'Supra-ilíaca'], ['thigh', 'Coxa']],
    },
    compute(sex, age, v) {
      const sum = Object.values(v).reduce((a, b) => a + b, 0)
      return siri(
        sex === 'M'
          ? 1.112 - 0.00043499 * sum + 0.00000055 * sum ** 2 - 0.00028826 * age
          : 1.097 - 0.00046971 * sum + 0.00000056 * sum ** 2 - 0.00012828 * age,
      )
    },
  },
  navy: {
    label: 'Fita métrica (método da Marinha americana)',
    short: 'fita métrica (Marinha americana)',
    unit: 'cm',
    needsAge: false,
    fields: {
      M: [['neck', 'Pescoço'], ['waist', 'Cintura (na altura do umbigo)'], ['height', 'Altura']],
      F: [['neck', 'Pescoço'], ['waist', 'Cintura (parte mais fina)'], ['hip', 'Quadril'], ['height', 'Altura']],
    },
    compute(sex, _age, v) {
      const girth = sex === 'M' ? v.waist - v.neck : v.waist + v.hip - v.neck
      if (!(girth > 0)) return NaN
      return sex === 'M'
        ? 495 / (1.0324 - 0.19077 * Math.log10(girth) + 0.15456 * Math.log10(v.height)) - 450
        : 495 / (1.29579 - 0.35004 * Math.log10(girth) + 0.221 * Math.log10(v.height)) - 450
    },
  },
}
METHODS.jp7.fields.F = METHODS.jp7.fields.M

export function bodyFatPercent(method, sex, age, values) {
  const result = METHODS[method]?.compute(sex, Number(age), values)
  return Number.isFinite(result) && result >= 2 && result <= 70 ? Math.round(result * 10) / 10 : null
}

const NOTE_MARK = 'Gordura calculada por '

export function initBodyFatCalc() {
  const form = document.querySelector('[data-form="assessment"]')
  const fatInput = form?.querySelector('[name="fat"]')
  if (!form || !fatInput || form.querySelector('.fat-calc')) return
  const box = el('div', 'fat-calc')
  const toggle = el('button', 'button button--secondary fat-calc-toggle', '🧮 Calcular a gordura pelas medidas')
  toggle.type = 'button'
  const panel = el('div', 'fat-calc-panel')
  panel.hidden = true
  box.append(toggle, panel)
  fatInput.closest('.field-grid, fieldset').after(box)

  const state = { method: 'jp3', sex: 'M', age: '', values: {} }
  const select = (labelText, options, current, onChange) => {
    const label = el('label', 'field')
    const input = el('select')
    options.forEach(([value, text]) => {
      const option = el('option', '', text)
      option.value = value
      input.append(option)
    })
    input.value = current
    input.addEventListener('change', () => onChange(input.value))
    label.append(el('span', '', labelText), input)
    return label
  }
  const result = el('div', 'fat-calc-result')
  const grid = el('div', 'field-grid field-grid--three fat-calc-fields')
  const top = el('div', 'field-grid field-grid--three')

  const paintResult = () => {
    const method = METHODS[state.method]
    const fields = method.fields[state.sex]
    const values = {}
    const complete = fields.every(([key]) => {
      values[key] = Number(state.values[key])
      return values[key] > 0
    })
    const ageOk = method.needsAge === false || (Number(state.age) >= 10 && Number(state.age) <= 100)
    result.replaceChildren()
    if (!complete || !ageOk) {
      result.append(el('p', 'support-muted', method.needsAge === false ? 'Preencha as medidas para ver o resultado.' : 'Preencha a idade e as medidas para ver o resultado.'))
      return
    }
    const percent = bodyFatPercent(state.method, state.sex, state.age, values)
    if (percent === null) {
      result.append(el('p', 'fat-calc-error', 'Confira as medidas: o resultado ficou fora do esperado.'))
      return
    }
    const tiles = el('div', 'fat-calc-tiles')
    const tile = (label, value) => {
      const item = el('div')
      item.append(el('span', '', label), el('strong', '', value))
      tiles.append(item)
    }
    tile('Gordura corporal', `${num(percent)}%`)
    const weight = Number(form.querySelector('[name="weight"]')?.value)
    if (weight > 0) {
      tile('Massa gorda', `${num((weight * percent) / 100)} kg`)
      tile('Massa magra', `${num(weight * (1 - percent / 100))} kg`)
    }
    const use = el('button', 'button button--primary', 'Usar este resultado')
    use.type = 'button'
    use.addEventListener('click', () => {
      fatInput.value = String(percent)
      fatInput.dispatchEvent(new Event('input', { bubbles: true }))
      // Medidas de fita também preenchem os campos da avaliação, se vazios.
      if (state.method === 'navy')
        [['waist', 'waist'], ['hip', 'hip'], ['height', 'height']].forEach(([key, name]) => {
          const target = form.querySelector(`[name="${name}"]`)
          if (target && !target.value && values[key]) target.value = String(values[key])
        })
      const notes = form.querySelector('[name="notes"]')
      if (notes) {
        const detail = fields.map(([key, label]) => `${label.replace(/ \(.*\)$/u, '')} ${num(values[key])} ${method.unit}`).join(', ')
        const line = `${NOTE_MARK}${method.short}: ${detail}.`
        const kept = notes.value
          .split('\n')
          .filter((text) => !text.startsWith(NOTE_MARK))
          .join('\n')
          .trim()
        notes.value = kept ? `${kept}\n${line}` : line
      }
      panel.hidden = true
      toggle.textContent = `🧮 Gordura calculada: ${num(percent)}% · refazer o cálculo`
    })
    result.append(tiles, use)
  }

  const paintFields = () => {
    const method = METHODS[state.method]
    grid.replaceChildren()
    method.fields[state.sex].forEach(([key, label]) => {
      const wrap = el('label', 'field')
      const input = el('input')
      Object.assign(input, { type: 'number', step: '0.1', min: '0', inputMode: 'decimal', value: state.values[key] ?? '' })
      // Na fita, aproveita o que já foi digitado na avaliação.
      if (state.method === 'navy' && !input.value) {
        const source = form.querySelector(`[name="${key}"]`)
        if (source?.value) {
          input.value = source.value
          state.values[key] = source.value
        }
      }
      input.addEventListener('input', () => {
        state.values[key] = input.value
        paintResult()
      })
      wrap.append(el('span', '', `${label} (${method.unit})`), input)
      grid.append(wrap)
    })
    ageField.hidden = method.needsAge === false
    paintResult()
  }

  // Sexo: o mesmo da avaliação (um preenche o outro).
  const formSex = form.querySelector('[name="sex"]')
  const sexField = select('Sexo', [['M', 'Masculino'], ['F', 'Feminino']], state.sex, (value) => {
    state.sex = value
    state.values = {}
    if (formSex && !formSex.value) formSex.value = value
    paintFields()
  })
  const sexInput = sexField.querySelector('select')
  const ageField = el('label', 'field')
  const ageInput = el('input')
  Object.assign(ageInput, { type: 'number', min: '10', max: '100', inputMode: 'numeric', placeholder: 'Ex.: 32' })
  ageInput.addEventListener('input', () => {
    state.age = ageInput.value
    paintResult()
  })
  ageField.append(el('span', '', 'Idade (anos)'), ageInput)
  top.append(
    select('Método', Object.entries(METHODS).map(([key, method]) => [key, method.label]), state.method, (value) => {
      state.method = value
      state.values = {}
      paintFields()
    }),
    sexField,
    ageField,
  )
  panel.append(
    top,
    grid,
    result,
    el('small', 'support-muted', 'Estimativas por equações validadas (Jackson & Pollock com Siri; Marinha americana). O resultado varia conforme a técnica de medida: use sempre o mesmo método nas reavaliações.'),
  )
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden
    if (!panel.hidden) {
      if (formSex?.value && formSex.value !== state.sex) {
        state.sex = formSex.value
        sexInput.value = state.sex
        state.values = {}
      }
      paintFields()
    }
  })
  form.addEventListener('reset', () => {
    state.values = {}
    panel.hidden = true
    toggle.textContent = '🧮 Calcular a gordura pelas medidas'
  })
}
