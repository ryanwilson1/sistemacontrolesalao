import { armazenamento } from '../storage'
import { COLECOES, ROTULO_COLECAO, type Colecao } from '../storage/tipos'
import { studioRepo } from '../repositorios/equipe'
import { APP } from '@/constants'
import { calcularChecksum, calcularHash } from './hash'
import { colecaoParaCSV, comBOM } from './csv'
import { baixar, nomearArquivo, tamanhoEmBytes, TIPOS_MIME } from './arquivo'
import { contarColecoes, VERSAO_FORMATO } from './validador'
import { ErroDeRegra } from '@/utils/erros'
import type {
  ArquivoBackup, ConteudoBackup, FormatoExportacao, OrigemBackup,
} from '@/types'

/**
 * Geração de backups e exportações.
 *
 * Monta o pacote em memória, calcula a impressão digital e entrega o
 * arquivo. Quando houver servidor, só o destino muda: o formato do
 * pacote e a validação continuam iguais.
 */

export interface OpcoesBackup {
  nome?: string
  origem?: OrigemBackup
  incluirFotos?: boolean
  /** Vazio significa todas. */
  colecoes?: Colecao[]
  observacoes?: string | null

  /**
   * Ignora o espelho em memória e lê direto do banco.
   *
   * Obrigatório na cópia de segurança que antecede uma restauração:
   * ali, uma leitura de cache velho produziria uma rede de proteção
   * que não corresponde ao estado real do studio.
   */
  semCache?: boolean
}

/** Monta o conteúdo do pacote sem gravar nada. */
export async function montarConteudo(opcoes: OpcoesBackup = {}): Promise<ConteudoBackup> {
  const alvo = opcoes.colecoes?.length ? opcoes.colecoes : COLECOES
  const incluirFotos = opcoes.incluirFotos ?? true

  // Fotos em base64 dominam o tamanho do arquivo. Poder deixá-las de fora
  // é o que mantém o backup do dia a dia leve.
  const selecionadas = alvo.filter((c) => (c === 'fotos' ? incluirFotos : true))

  const studio = await studioRepo.ler()
  const colecoes: Partial<Record<Colecao, unknown[]>> = {}

  /*
    `semCache` pede um instantâneo direto do banco.

    Usado pela cópia de segurança feita antes de uma restauração, e por
    nada mais. O espelho em memória desta aba pode estar velho — outra
    aba gravou, o tempo real ainda não avisou — e uma cópia de
    segurança velha é pior do que nenhuma: ela dá a confiança para
    restaurar e devolve o estado errado se der errado.

    Fora desse caso o espelho serve bem, e ir ao banco a cada exportação
    manual seria pagar rede à toa.
  */
  if (opcoes.semCache && armazenamento.instantaneo) {
    const fresco = await armazenamento.instantaneo()
    const nomeTabela: Partial<Record<Colecao, string>> = {
      listaEspera: 'lista_espera',
      movimentosCaixa: 'movimentos_caixa',
      usosCupom: 'usos_cupom',
      modelosMensagem: 'modelos_mensagem',
    }

    for (const colecao of selecionadas) {
      colecoes[colecao] = fresco[nomeTabela[colecao] ?? colecao] ?? []
    }
  } else {
    // Sequencial de propósito: em paralelo, um lote grande de fotos pode
    // estourar a memória em aparelhos modestos.
    for (const colecao of selecionadas) {
      colecoes[colecao] = await armazenamento.listar(colecao)
    }
  }

  return {
    versao: VERSAO_FORMATO,
    versaoSistema: APP.versao,
    geradoEm: new Date().toISOString(),
    studio: studio?.nome ?? 'System Studio',
    colecoes,
  }
}

/** Monta o pacote completo, com metadados e impressão digital. */
export async function montarArquivo(opcoes: OpcoesBackup = {}): Promise<ArquivoBackup> {
  const conteudo = await montarConteudo(opcoes)
  const contagens = contarColecoes(conteudo.colecoes)
  const totalRegistros = contagens.reduce((soma, c) => soma + c.registros, 0)

  const hash = await calcularHash(conteudo)
  const agora = new Date().toISOString()

  return {
    metadados: {
      id: '',
      criadoEm: agora,
      atualizadoEm: agora,
      nome: opcoes.nome ?? `Backup de ${new Date().toLocaleDateString('pt-BR')}`,
      origem: opcoes.origem ?? 'manual',
      situacao: 'concluido',
      versao: VERSAO_FORMATO,
      versaoSistema: APP.versao,
      totalRegistros,
      tamanhoBytes: tamanhoEmBytes(JSON.stringify(conteudo)),
      contagens,
      hash,
      observacoes: opcoes.observacoes ?? null,
      temConteudo: false,
    },
    conteudo,
  }
}

/** Checksum leve, exibido ao lado do hash na tela. */
export const checksumDoArquivo = (arquivo: ArquivoBackup) =>
  calcularChecksum(arquivo.metadados.contagens)

/** Entrega o pacote como arquivo .json no computador. */
export function baixarBackup(arquivo: ArquivoBackup): string {
  const nome = nomearArquivo(arquivo.metadados.nome, 'json')
  baixar(nome, JSON.stringify(arquivo, null, 2), TIPOS_MIME.json)
  return nome
}

/* ------------------------------------------------------------------ */
/* Exportação individual de um módulo                                  */
/* ------------------------------------------------------------------ */

export async function exportarColecao(
  colecao: Colecao,
  formato: FormatoExportacao,
): Promise<{ nome: string; registros: number }> {
  const registros = await armazenamento.listar<Record<string, unknown>>(colecao)
  if (registros.length === 0) {
    throw new ErroDeRegra(`Não há nada em ${ROTULO_COLECAO[colecao]} para exportar.`)
  }

  const rotulo = ROTULO_COLECAO[colecao]

  if (formato === 'json') {
    const nome = nomearArquivo(rotulo, 'json')
    baixar(nome, JSON.stringify(registros, null, 2), TIPOS_MIME.json)
    return { nome, registros: registros.length }
  }

  if (formato === 'csv' || formato === 'excel') {
    // O Excel abre CSV com separador de ponto e vírgula sem reclamar; um
    // .xlsx de verdade exigiria uma biblioteca inteira só para isso.
    const nome = nomearArquivo(rotulo, formato === 'excel' ? 'csv' : 'csv')
    baixar(nome, comBOM(colecaoParaCSV(registros)), TIPOS_MIME.csv)
    return { nome, registros: registros.length }
  }

  throw new ErroDeRegra('Este formato ainda não está disponível para exportação direta.')
}

/** Formatos oferecidos por coleção, com o que cada um serve. */
export const FORMATOS: { valor: FormatoExportacao; rotulo: string; detalhe: string; pronto: boolean }[] = [
  { valor: 'json', rotulo: 'JSON', detalhe: 'Para restaurar no sistema', pronto: true },
  { valor: 'csv', rotulo: 'CSV', detalhe: 'Abre no Excel e no Google Planilhas', pronto: true },
  { valor: 'excel', rotulo: 'Excel', detalhe: 'CSV com acentuação corrigida', pronto: true },
  { valor: 'pdf', rotulo: 'PDF', detalhe: 'Use Relatórios → Imprimir', pronto: false },
]
