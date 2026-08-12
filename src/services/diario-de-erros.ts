/**
 * Diário de erros — o que sobrou depois que a tela travou.
 *
 * ---------------------------------------------------------------
 * O problema que isto resolve
 * ---------------------------------------------------------------
 * O Error Boundary de produção mostrava "A tela travou, recarregue" e
 * NÃO REGISTRAVA NADA — o `console.error` rodava só em DEV. Quando a
 * proprietária relatava "travou de novo", a investigação começava do
 * zero: sem mensagem, sem pilha, sem rota, sem saber nem QUAL versão
 * estava no ar. Todo diagnóstico virava arqueologia de print.
 *
 * Este diário guarda os últimos erros num anel no `localStorage`:
 * sobrevive ao recarregamento (que é justamente o que a pessoa faz em
 * seguida), não cresce sem limite e é legível de qualquer console:
 *
 *   JSON.parse(localStorage.getItem('studio:diario-de-erros'))
 *
 * ---------------------------------------------------------------
 * O que NUNCA entra aqui
 * ---------------------------------------------------------------
 * Senha, token, credencial, conteúdo de formulário, nome de cliente.
 * O diário guarda a MECÂNICA da falha (mensagem, pilha, rota, versão,
 * instante) — nunca os DADOS que a tela manuseava. A pilha do React e
 * a mensagem do erro não carregam campos de formulário; a rota é a da
 * barra de endereço, que a própria pessoa vê. Se um dia algum erro
 * passar a embutir dado sensível na mensagem, o problema é do erro —
 * e este arquivo é o lembrete de onde cortar.
 */

const CHAVE = 'studio:diario-de-erros'

/** Quantos erros o anel guarda. O 21º empurra o 1º para fora. */
const CAPACIDADE = 20

export interface ErroRegistrado {
  em: string
  versao: string
  rota: string
  mensagem: string
  pilha: string | null
  componente: string | null
}

declare const __VERSAO_STUDIO__: string

function versaoAtual(): string {
  try {
    return typeof __VERSAO_STUDIO__ === 'string' ? __VERSAO_STUDIO__ : 'desconhecida'
  } catch {
    return 'desconhecida'
  }
}

function lerDiario(): ErroRegistrado[] {
  try {
    const bruto = window.localStorage.getItem(CHAVE)
    const lista = bruto ? (JSON.parse(bruto) as ErroRegistrado[]) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

/**
 * Registra uma falha de renderização (ou qualquer erro grave).
 *
 * Nunca lança: um diário que quebra durante a falha que deveria
 * anotar transformaria um problema em dois. Se o `localStorage`
 * estiver cheio ou indisponível, o registro simplesmente não acontece
 * — e o console (abaixo) continua sendo a segunda via.
 */
export function registrarErro(dados: {
  erro: unknown
  componente?: string | null
}): void {
  const erro = dados.erro

  const entrada: ErroRegistrado = {
    em: new Date().toISOString(),
    versao: versaoAtual(),
    rota: typeof window !== 'undefined' ? window.location.pathname : '',
    mensagem: erro instanceof Error ? erro.message : String(erro),
    /*
      A pilha é truncada, não pela metade do valor, mas porque anel ×
      pilhas de produção minificada gigantes estourariam a cota do
      localStorage — e aí o diário falharia exatamente quando mais
      importa. As primeiras linhas carregam o que interessa.
    */
    pilha: erro instanceof Error && erro.stack ? erro.stack.slice(0, 2_000) : null,
    componente: dados.componente?.slice(0, 2_000) ?? null,
  }

  /*
    O console SEMPRE recebe — produção inclusive.

    A regra antiga ("em produção, silêncio") protegia contra vazar a
    estrutura interna PARA A TELA. O console não é a tela: quem o abre
    está diagnosticando, e negar a ele a mensagem só alonga o
    diagnóstico. O que não pode é a PILHA aparecer na interface — e não
    aparece; a tela amigável continua a mesma.
  */
  console.error(`[System Studio ${entrada.versao}] falha em ${entrada.rota}:`, erro)

  try {
    const diario = lerDiario()
    diario.push(entrada)
    window.localStorage.setItem(CHAVE, JSON.stringify(diario.slice(-CAPACIDADE)))
  } catch {
    // Sem espaço ou sem localStorage: o console acima já registrou.
  }
}

/** Os erros guardados, do mais antigo para o mais recente. */
export function diarioDeErros(): ErroRegistrado[] {
  return lerDiario()
}

/** Esvazia o diário — depois de exportado ou investigado. */
export function limparDiario(): void {
  try {
    window.localStorage.removeItem(CHAVE)
  } catch {
    // Indisponível: não havia o que limpar.
  }
}
