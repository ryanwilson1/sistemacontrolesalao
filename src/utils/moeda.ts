/**
 * Dinheiro no padrão brasileiro.
 *
 * O problema que isto resolve aparece no primeiro dia de uso e não tem
 * meio-termo: `<input type="number">` só aceita ponto como separador
 * decimal. A proprietária digita `50,00` — como se escreve dinheiro no
 * Brasil — e o campo simplesmente **recusa a vírgula**. Ela apaga,
 * tenta `1.250,00`, e o navegador engole tudo. Sobra digitar `1250.5`,
 * que ninguém faz naturalmente.
 *
 * Pior: em alguns navegadores o campo fica vazio em silêncio quando o
 * valor é inválido. O formulário salva zero e nada avisa.
 *
 * Aqui o campo aceita texto e a interpretação é nossa. Vale para os dez
 * formulários do sistema — preço de serviço, produto, cupom, meta,
 * lançamento, caixa, fidelidade — porque uma regra que funciona na
 * agenda e quebra no financeiro é pior do que regra nenhuma.
 *
 * ---------------------------------------------------------------
 * A ambiguidade do ponto
 * ---------------------------------------------------------------
 * `1.250` é mil duzentos e cinquenta ou um real e vinte e cinco?
 *
 * No Brasil, ponto separa milhar. Mas alguém que digitou `10.50`
 * pensando em dez reais e cinquenta centavos também precisa ser
 * entendido — e essa pessoa existe.
 *
 * A regra de desempate: **ponto seguido de exatamente três dígitos é
 * milhar; qualquer outra quantidade é decimal.** `1.250` vira mil
 * duzentos e cinquenta; `10.50` e `1.5` viram dez e cinquenta e um e
 * meio — porque grupo de milhar sempre tem três dígitos, e nenhuma
 * dessas duas formas existe como milhar.
 *
 * Não é adivinhação perfeita — nenhuma é. É a leitura que acerta os
 * casos que aparecem de verdade num caixa de salão.
 */

/**
 * Texto digitado para número.
 *
 * Devolve `null` quando não há valor interpretável, e não zero: quem
 * chama precisa distinguir "campo vazio" de "de graça". Um serviço com
 * preço zero é decisão; um campo vazio é esquecimento.
 */
export function parseMoedaBR(entrada: string | number | null | undefined): number | null {
  if (typeof entrada === 'number') return Number.isFinite(entrada) ? entrada : null
  if (entrada === null || entrada === undefined) return null

  // Fora dígitos, vírgula, ponto e sinal. `R$`, espaços e o que mais
  // vier colado de uma planilha saem aqui.
  const limpo = String(entrada).trim().replace(/[^\d,.-]/g, '')
  if (limpo === '' || limpo === '-') return null

  const negativo = limpo.startsWith('-')
  const corpo = limpo.replace(/-/g, '')

  const temVirgula = corpo.includes(',')
  const temPonto = corpo.includes('.')

  let normalizado: string

  if (temVirgula) {
    // Com vírgula presente, ela é o decimal e o ponto é milhar.
    // "1.250,50" -> "1250.50"
    normalizado = corpo.replace(/\./g, '').replace(',', '.')
  } else if (temPonto) {
    const partes = corpo.split('.')
    const ultima = partes[partes.length - 1]

    /*
      Um ponto só, com exatamente TRÊS dígitos depois: milhar.
      Qualquer outra quantidade: decimal.

      A regra é essa porque grupo de milhar sempre tem três dígitos —
      "1.5" e "10.50" não existem como milhar em lugar nenhum, então
      só podem ser decimal. Já "1.250" é milhar inequívoco.

      A primeira versão fazia o contrário (dois dígitos = decimal) e
      transformava "1.5" em quinze reais. Um teste pegou.
    */
    normalizado =
      partes.length === 2 && ultima.length !== 3
        ? corpo
        : partes.join('')
  } else {
    normalizado = corpo
  }

  const numero = Number(normalizado)
  if (!Number.isFinite(numero)) return null

  // Duas casas: dinheiro não tem terceira. Sem isto, 0.1 + 0.2 aparece
  // como 0.30000000000000004 no total do caixa.
  const arredondado = Math.round(numero * 100) / 100
  return negativo ? -arredondado : arredondado
}

/** Igual a `parseMoedaBR`, mas devolve 0 no lugar de nulo. */
export const moedaOuZero = (entrada: string | number | null | undefined): number =>
  parseMoedaBR(entrada) ?? 0

/**
 * Número para o texto que a pessoa lê: `1250.5` → `1.250,50`.
 *
 * Sem o `R$` — o prefixo fica no componente, para o cursor não ter que
 * pular por cima dele enquanto se digita.
 */
export function formatarMoedaBR(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return ''
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Limpa o que a pessoa está digitando, sem atrapalhar.
 *
 * Roda a cada tecla, então não pode formatar: reescrever `1.2` para
 * `1,20` no meio da digitação joga o cursor para o fim e faz o próximo
 * dígito cair no lugar errado. Aqui só sai o que não é número — a
 * formatação bonita acontece quando o campo perde o foco.
 */
export function digitandoMoeda(entrada: string): string {
  let texto = entrada.replace(/[^\d,.]/g, '')

  // Uma vírgula só. A segunda em diante é ignorada.
  const primeira = texto.indexOf(',')
  if (primeira !== -1) {
    texto = texto.slice(0, primeira + 1) + texto.slice(primeira + 1).replace(/,/g, '')
    // No máximo dois centavos.
    const [inteiro, decimal = ''] = texto.split(',')
    texto = `${inteiro},${decimal.slice(0, 2)}`
  }

  return texto
}
