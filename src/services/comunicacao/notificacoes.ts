import { agendamentosRepo } from '../repositorios/agenda'
import { backupsRepo, configuracaoBackupRepo } from '../repositorios/backup'
import { caixaRepo } from '../repositorios/caixa'
import { clientesRepo } from '../repositorios/clientes'
import { notificacoesRepo } from '../repositorios/comunicacao'
import { listaEsperaRepo, solicitacoesRepo } from '../repositorios/portal'
import { produtosRepo } from '../repositorios/estoque'
import { backupVencido } from '../backup'
import { estaAtivo } from '../agenda/regras'
import { ROTAS } from '@/constants'
import { faixaDoDia, isoData } from '@/utils/datas'
import type { Notificacao, TipoNotificacao } from '@/types'

/**
 * Avisos internos para a equipe.
 *
 * Diferente dos lembretes, que vão para a cliente: estes ficam no sino
 * do painel. São recalculados a cada abertura e nunca duplicam — a chave
 * de dedução é o próprio texto do dia.
 */

interface Candidata {
  tipo: TipoNotificacao
  titulo: string
  detalhe: string | null
  destino: string | null
}

/**
 * Reúne o que merece atenção agora.
 *
 * Tudo é derivado dos módulos existentes: nada aqui é digitado ou
 * guardado à parte, então nunca fica desatualizado.
 */
export async function apurar(): Promise<Candidata[]> {
  const hoje = new Date()
  const { de, ate } = faixaDoDia(hoje)

  const [
    pendentes, estoqueBaixo, vencendo, aniversariantes, caixa, configuracao, ultimoBackup,
    solicitacoesAbertas, esperando,
  ] = await Promise.all([
    agendamentosRepo.noPeriodo(de, ate),
    produtosRepo.abaixoDoMinimo(),
    produtosRepo.vencendoEm(30),
    clientesRepo.aniversariantes(hoje),
    caixaRepo.aberto(),
    configuracaoBackupRepo.ler(),
    backupsRepo.ultimo(),
    solicitacoesRepo.abertas(),
    listaEsperaRepo.aguardando(),
  ])

  const candidatas: Candidata[] = []

  /* Agenda -------------------------------------------------------- */
  const aguardando = pendentes.filter((a) => a.situacao === 'pendente')
  if (aguardando.length > 0) {
    candidatas.push({
      tipo: 'alerta',
      titulo: `${aguardando.length} agendamento(s) aguardando confirmação`,
      detalhe: 'Vieram pelo link público e ainda não foram confirmados.',
      destino: ROTAS.agenda,
    })
  }

  /* Portal ---------------------------------------------------------- */
  const doLink = pendentes.filter((a) => a.origem === 'link' && estaAtivo(a))
  if (doLink.length > 0) {
    candidatas.push({
      tipo: 'sucesso',
      titulo: `${doLink.length} agendamento(s) pelo portal hoje`,
      detalhe: doLink
        .slice(0, 3)
        .map((a) => a.nomeAvulso?.split(' ')[0] ?? 'Cliente')
        .join(', '),
      destino: ROTAS.agenda,
    })
  }

  if (solicitacoesAbertas.length > 0) {
    const alteracoes = solicitacoesAbertas.filter((s) => s.tipo === 'alteracao').length
    const cancelamentos = solicitacoesAbertas.length - alteracoes

    candidatas.push({
      tipo: 'alerta',
      titulo: `${solicitacoesAbertas.length} pedido(s) aguardando sua decisão`,
      detalhe: [
        alteracoes > 0 ? `${alteracoes} de alteração` : null,
        cancelamentos > 0 ? `${cancelamentos} de cancelamento` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      destino: ROTAS.portal,
    })
  }

  if (esperando.length > 0) {
    candidatas.push({
      tipo: 'info',
      titulo: `${esperando.length} cliente(s) na lista de espera`,
      detalhe: 'Se abrir uma vaga, o sistema já sabe quem avisar.',
      destino: ROTAS.portal,
    })
  }

  const semConcluir = pendentes.filter(
    (a) => estaAtivo(a) && a.situacao !== 'concluido' && new Date(a.fim) < hoje,
  )
  if (semConcluir.length > 0) {
    candidatas.push({
      tipo: 'info',
      titulo: `${semConcluir.length} atendimento(s) do dia sem fechamento`,
      detalhe: 'Concluir libera a receita no financeiro e credita os pontos.',
      destino: ROTAS.agenda,
    })
  }

  /* Caixa ---------------------------------------------------------- */
  if (!caixa) {
    const houveMovimento = pendentes.some((a) => a.situacao === 'concluido')
    if (houveMovimento) {
      candidatas.push({
        tipo: 'alerta',
        titulo: 'Caixa fechado com atendimentos no dia',
        detalhe: 'Abra o caixa para os recebimentos entrarem na conferência.',
        destino: ROTAS.caixa,
      })
    }
  } else if (caixa.data !== isoData(hoje)) {
    candidatas.push({
      tipo: 'alerta',
      titulo: 'Há um caixa de outro dia ainda aberto',
      detalhe: `Aberto em ${caixa.data}. Feche antes de abrir o de hoje.`,
      destino: ROTAS.caixa,
    })
  }

  /* Estoque -------------------------------------------------------- */
  if (estoqueBaixo.length > 0) {
    candidatas.push({
      tipo: 'alerta',
      titulo: `${estoqueBaixo.length} produto(s) para repor`,
      detalhe: estoqueBaixo.slice(0, 3).map((p) => p.nome).join(', '),
      destino: ROTAS.estoque,
    })
  }

  if (vencendo.length > 0) {
    candidatas.push({
      tipo: 'alerta',
      titulo: `${vencendo.length} produto(s) vencendo em 30 dias`,
      detalhe: vencendo.slice(0, 3).map((p) => p.nome).join(', '),
      destino: ROTAS.estoque,
    })
  }

  /* Clientes ------------------------------------------------------- */
  if (aniversariantes.length > 0) {
    candidatas.push({
      tipo: 'info',
      titulo: `${aniversariantes.length} aniversariante(s) hoje`,
      detalhe: aniversariantes.map((c) => c.nome.split(' ')[0]).join(', '),
      destino: ROTAS.clientes,
    })
  }

  /* Backup --------------------------------------------------------- */
  if (!ultimoBackup) {
    candidatas.push({
      tipo: 'erro',
      titulo: 'Nenhum backup foi feito ainda',
      detalhe: 'Os dados ficam só neste aparelho. Sem backup, uma limpeza do navegador apaga tudo.',
      destino: ROTAS.backup,
    })
  } else if (backupVencido(configuracao)) {
    candidatas.push({
      tipo: 'alerta',
      titulo: 'Está na hora de um novo backup',
      detalhe: 'O último já tem alguns dias.',
      destino: ROTAS.backup,
    })
  }

  return candidatas
}

/**
 * Sincroniza os avisos com a situação atual.
 *
 * Grava só o que ainda não existe hoje e apaga o que deixou de valer —
 * assim o sino nunca mostra um alerta já resolvido.
 */
export async function sincronizar(): Promise<{ novas: number; removidas: number }> {
  const candidatas = await apurar()
  const existentes = await notificacoesRepo.listar()

  const hoje = isoData(new Date())
  const chave = (titulo: string) => `${hoje}|${titulo}`

  const chavesAtuais = new Set(candidatas.map((c) => chave(c.titulo)))

  // Fora: avisos de hoje que não valem mais, e qualquer coisa de ontem.
  const manter = existentes.filter((n) => {
    const doDia = n.criadoEm.slice(0, 10) === hoje
    return doDia && chavesAtuais.has(chave(n.titulo))
  })

  const titulosMantidos = new Set(manter.map((n) => n.titulo))
  const novas = candidatas.filter((c) => !titulosMantidos.has(c.titulo))

  const agora = new Date().toISOString()
  const criadas: Notificacao[] = novas.map((c, indice) => ({
    id: `${hoje}-${indice}-${c.titulo.slice(0, 12)}`,
    criadoEm: agora,
    atualizadoEm: agora,
    tipo: c.tipo,
    titulo: c.titulo,
    detalhe: c.detalhe,
    lida: false,
    destino: c.destino,
  }))

  await notificacoesRepo.substituirTudo([...criadas, ...manter])

  return { novas: criadas.length, removidas: existentes.length - manter.length }
}
