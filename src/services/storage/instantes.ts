/**
 * Instantes vindos do banco, em uma forma só.
 *
 * ---------------------------------------------------------------
 * O problema
 * ---------------------------------------------------------------
 * O sistema compara datas como TEXTO. Está por toda parte:
 *
 *   agendamentos.filter((a) => a.inicio >= de && a.inicio < ate)
 *   agendamentos.sort((a, b) => a.inicio.localeCompare(b.inicio))
 *
 * É uma escolha defensável — ISO 8601 em UTC ordena igual como texto e
 * como instante, e comparar texto é muito mais barato do que construir
 * dois `Date` por item numa agenda de milhares de linhas.
 *
 * Ela só funciona sob uma condição: **todo mundo escrevendo no mesmo
 * formato.** E não estava.
 *
 * O que o sistema produz:   2026-08-11T03:00:00.000Z   (toISOString)
 * O que o PostgREST devolve: 2026-08-11T03:00:00+00:00
 *
 * Mesmo instante. Textos diferentes. E, comparando caractere a
 * caractere, `'+'` (43) vem antes de `'.'` (46) — então a linha do
 * banco é considerada MENOR que o próprio limite que a contém.
 *
 * Na prática, na virada do dia:
 *
 *   · um agendamento à meia-noite some da agenda do próprio dia;
 *   · a meia-noite do dia seguinte aparece no dia anterior.
 *
 * Um salão raramente marca à meia-noite, então isso dormia. O que não
 * dorme é o caso do fuso: o Supabase nasce em UTC, mas o fuso é
 * ajustável no painel. Trocado para `America/Sao_Paulo`, o PostgREST
 * passa a responder `-03:00`, e aí a comparação de texto não erra mais
 * na borda — erra o dia inteiro, para todos os horários da madrugada.
 *
 * ---------------------------------------------------------------
 * A correção
 * ---------------------------------------------------------------
 * Uma forma canônica na fronteira. Tudo que entra pelo adaptador passa
 * por aqui e vira exatamente o que `toISOString()` produziria.
 *
 * Escolhi normalizar na entrada em vez de trocar as comparações por
 * `new Date(...)` porque o custo fica num lugar só, pago uma vez por
 * linha lida, em vez de espalhado por trinta filtros — dos quais um
 * sempre passa despercebido.
 */

/**
 * Um instante ISO completo: data, hora e fuso.
 *
 * A âncora no fim é o que mantém `'1990-04-23'` (nascimento) e
 * `'09:30'` (jornada) fora daqui. Data pura não é instante: convertê-la
 * criaria uma hora que ninguém escreveu e deslocaria aniversários em
 * fusos negativos.
 */
const INSTANTE_ISO =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/

export function normalizarInstante<T>(valor: T): T | string {
  if (typeof valor !== 'string') return valor
  if (!INSTANTE_ISO.test(valor)) return valor

  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return valor

  return data.toISOString()
}

/** Aplica a normalização a todos os campos de uma linha. */
export function normalizarLinha(
  linha: Record<string, unknown>,
): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    saida[chave] = normalizarInstante(valor)
  }
  return saida
}
