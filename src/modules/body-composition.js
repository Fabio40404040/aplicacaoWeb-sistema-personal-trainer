// Composição corporal: classifica o % de gordura pela faixa de homem ou
// mulher (tabela do ACE, a mais usada por personais) e explica o IMC quando
// ele não combina com a gordura (ex.: IMC "sobrepeso" por massa muscular).

export const SEX_LABELS = { M: 'Masculino', F: 'Feminino' }

// [até (exclusivo), nome, tom]. Tons iguais aos da régua do IMC.
export const FAT_BANDS = {
  M: [
    [6, 'Essencial', 'low'],
    [14, 'Atleta', 'ok'],
    [18, 'Boa', 'ok'],
    [25, 'Média', 'warn'],
    [Infinity, 'Acima do ideal', 'high'],
  ],
  F: [
    [14, 'Essencial', 'low'],
    [21, 'Atleta', 'ok'],
    [25, 'Boa', 'ok'],
    [32, 'Média', 'warn'],
    [Infinity, 'Acima do ideal', 'high'],
  ],
}
// Começo e fim da régua de cada sexo.
export const FAT_SCALE = { M: [3, 35], F: [10, 45] }

const toNumber = (value) => {
  const number = Number(String(value ?? '').replace(',', '.').replace(/[^\d.]/gu, ''))
  return Number.isFinite(number) && number > 0 ? number : null
}

export function fatClass(sex, fat) {
  const value = toNumber(fat)
  if (!value || !FAT_BANDS[sex]) return null
  const [, label, tone] = FAT_BANDS[sex].find(([limit]) => value < limit)
  return { value, label, tone, sex }
}

const br = (value, digits = 1) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits })

// Aviso sobre o IMC. Sem gordura medida: lembrete geral.
export function bmiNote(bmi, sex, fat) {
  const imc = toNumber(bmi)
  if (!imc) return ''
  const composition = fatClass(sex, fat)
  if (!composition)
    return 'O IMC usa só peso e altura: não diferencia músculo de gordura. O % de gordura mostra melhor a composição corporal.'
  if (imc >= 25 && composition.tone === 'ok')
    return `IMC de ${br(imc)} por massa muscular: a gordura (${br(composition.value)}%) está na faixa "${composition.label}". Para quem treina, vale mais a composição corporal do que o IMC.`
  if (imc < 25 && composition.tone === 'high')
    return `O IMC está normal, mas a gordura (${br(composition.value)}%) está acima do ideal: o peso esconde pouca massa muscular.`
  return 'A classificação principal é a do % de gordura; o IMC fica como referência.'
}
