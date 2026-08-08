import { COLECOES, ROTULO_COLECAO, type Colecao } from '../storage/tipos'
import { calcularHash, hashConfere } from './hash'
import { tamanhoEmBytes } from './arquivo'
import type { ArquivoBackup, ContagemPorColecao, ValidacaoBackup } from '@/types'

/** Versão do formato de arquivo que este sistema sabe ler. */
export const VERSAO_FORMATO = 3

/**
 * Conferência de um arquivo de backup.
 *
 * Nunca lança: devolve problemas e avisos separados. Problema impede a
 * restauração; aviso apenas alerta e deixa a decisão com quem opera.
 */
export async function validarArquivo(bruto: string): Promise<{
  validacao: ValidacaoBackup
  arquivo: ArquivoBackup | null
}> {
  const problemas: string[] = []
  const avisos: string[] = []

  let arquivo: ArquivoBackup | null = null

  try {
    arquivo = JSON.parse(bruto) as ArquivoBackup
  } catch {
    return {
      arquivo: null,
      validacao: {
        valido: false,
        problemas: ['O arquivo não é um backup válido: não foi possível ler o conteúdo.'],
        avisos: [],
        contagens: [],
        versaoCompativel: false,
        hashConfere: false,
      },
    }
  }

  if (!arquivo?.conteudo?.colecoes || !arquivo?.metadados) {
    problemas.push('O arquivo não tem a estrutura de um backup do System Studio.')
    return {
      arquivo: null,
      validacao: {
        valido: false, problemas, avisos, contagens: [],
        versaoCompativel: false, hashConfere: false,
      },
    }
  }

  /* Versão -------------------------------------------------------- */
  const versao = arquivo.conteudo.versao ?? 0
  const versaoCompativel = versao === VERSAO_FORMATO

  if (versao > VERSAO_FORMATO) {
    problemas.push(
      `Este backup veio de uma versão mais nova do sistema (formato ${versao}). Atualize antes de restaurar.`,
    )
  } else if (versao < VERSAO_FORMATO) {
    avisos.push(
      `Backup de um formato anterior (${versao}). Campos criados depois virão vazios.`,
    )
  }

  /* Integridade --------------------------------------------------- */
  const hashCalculado = await calcularHash(arquivo.conteudo)
  const integro = hashConfere(arquivo.metadados.hash ?? '', hashCalculado)

  if (!arquivo.metadados.hash) {
    avisos.push('O arquivo não traz impressão digital. Não dá para conferir se foi alterado.')
  } else if (!integro) {
    problemas.push(
      'A impressão digital não confere: o arquivo foi alterado ou corrompeu depois de gerado.',
    )
  }

  /* Conteúdo ------------------------------------------------------ */
  const contagens = contarColecoes(arquivo.conteudo.colecoes)
  const totalRegistros = contagens.reduce((soma, c) => soma + c.registros, 0)

  if (totalRegistros === 0) problemas.push('O backup está vazio.')

  const declarado = arquivo.metadados.totalRegistros
  if (declarado !== undefined && declarado !== totalRegistros) {
    problemas.push(
      `O arquivo diz ter ${declarado} registros, mas foram encontrados ${totalRegistros}.`,
    )
  }

  const ausentes = COLECOES.filter((c) => !(c in arquivo!.conteudo.colecoes))
  if (ausentes.length > 0) {
    avisos.push(
      `${ausentes.length} coleção(ões) não vieram no arquivo: ${ausentes
        .slice(0, 4)
        .map((c) => ROTULO_COLECAO[c])
        .join(', ')}${ausentes.length > 4 ? '…' : ''}.`,
    )
  }

  const semStudio = !arquivo.conteudo.colecoes.studio?.length
  if (semStudio) avisos.push('O backup não contém os dados do studio.')

  const semFotos = !arquivo.conteudo.colecoes.fotos?.length
  const temProcedimentos = (arquivo.conteudo.colecoes.procedimentos?.length ?? 0) > 0
  if (semFotos && temProcedimentos) {
    avisos.push('Este backup foi gerado sem as fotos de antes e depois.')
  }

  return {
    arquivo,
    validacao: {
      valido: problemas.length === 0,
      problemas,
      avisos,
      contagens,
      versaoCompativel,
      hashConfere: integro,
    },
  }
}

/** Conta registros e mede o peso de cada coleção. */
export function contarColecoes(
  colecoes: Partial<Record<Colecao, unknown[]>>,
): ContagemPorColecao[] {
  return COLECOES.filter((colecao) => colecao in colecoes).map((colecao) => {
    const registros = colecoes[colecao] ?? []
    return {
      colecao,
      rotulo: ROTULO_COLECAO[colecao],
      registros: registros.length,
      bytes: tamanhoEmBytes(JSON.stringify(registros)),
    }
  })
}
