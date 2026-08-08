import { useEffect, useMemo, useState } from 'react'
import { useAviso } from '@/contexts'
import {
  useAgendar, useAtendentes, useDebounce, useHorariosLivres, useInteressadasNaVaga,
  useMudarSituacao, useRemarcar, useSalvarCliente, useServicos, useSugerirClientes,
} from '@/hooks'
import { clientesRepo } from '@/services'
import { digitos } from '@/utils/formato'
import { dataRelativa, hora, isoData } from '@/utils/datas'
import { limparNome, limparTexto } from '@/utils/sanitizar'
import { mensagemDeErro } from '@/utils/erros'
import type { AgendamentoDetalhado, Cliente, SituacaoAgendamento } from '@/types'

/**
 * O formulário de agendamento, fora da tela.
 *
 * São doze campos, duas escritas diferentes (criar e remarcar), cadastro
 * de cliente no meio do caminho e a lista de espera esperando o
 * cancelamento. Na tela, isso enterraria o desenho embaixo de estado.
 * Aqui dá para ler o fluxo de uma vez; lá, o formulário.
 */

const ROTULO_SITUACAO: Partial<Record<SituacaoAgendamento, string>> = {
  concluido: 'Atendimento concluído',
  cancelado: 'Agendamento cancelado',
  faltou: 'Marcado como falta',
  em_atendimento: 'Atendimento iniciado',
  confirmado: 'Agendamento confirmado',
}

export function usarFormularioDeAgendamento({
  aberto, aoFechar, agendamento, inicioSugerido, profissionalSugerido,
}: {
  aberto: boolean
  aoFechar: () => void
  agendamento?: AgendamentoDetalhado | null
  inicioSugerido?: Date
  profissionalSugerido?: string
}) {
  const aviso = useAviso()
  const { dados: servicos } = useServicos()
  const { dados: atendentes } = useAtendentes()

  const agendar = useAgendar()
  const remarcar = useRemarcar()
  const mudarSituacao = useMudarSituacao()
  const salvarCliente = useSalvarCliente()

  const editando = !!agendamento
  const salvando = agendar.salvando || remarcar.salvando || salvarCliente.salvando

  const [servicoId, setServicoId] = useState('')
  const [profissionalId, setProfissionalId] = useState('')
  const [data, setData] = useState('')
  const [horario, setHorario] = useState('')
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [busca, setBusca] = useState('')
  const [modoNovoCliente, setModoNovoCliente] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoFone, setNovoFone] = useState('')
  const [preco, setPreco] = useState('')
  const [desconto, setDesconto] = useState('')
  const [observacao, setObservacao] = useState('')
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)
  const [vagaAberta, setVagaAberta] = useState<AgendamentoDetalhado | null>(null)

  /**
   * Quem espera por este horário.
   *
   * Consultado enquanto o agendamento está aberto, não depois de
   * cancelar: cancelado, ele deixa de ocupar a faixa e a busca não
   * teria mais o que casar.
   */
  const { dados: interessadas } = useInteressadasNaVaga(
    agendamento && !['cancelado', 'concluido'].includes(agendamento.situacao)
      ? agendamento.id
      : null,
  )

  /* Preenche ao abrir --------------------------------------------- */
  useEffect(() => {
    if (!aberto) return

    if (agendamento) {
      const inicio = new Date(agendamento.inicio)
      setServicoId(agendamento.servicoId)
      setProfissionalId(agendamento.profissionalId)
      setData(isoData(inicio))
      setHorario(hora(inicio))
      setCliente(agendamento.cliente)
      setModoNovoCliente(!agendamento.clienteId)
      setNovoNome(agendamento.nomeAvulso ?? '')
      setNovoFone(agendamento.telefoneAvulso ?? '')
      setPreco(String(agendamento.preco))
      setDesconto(agendamento.desconto ? String(agendamento.desconto) : '')
      setObservacao(agendamento.observacao ?? '')
      return
    }

    const base = inicioSugerido ?? new Date()
    setServicoId(servicos?.[0]?.id ?? '')
    setProfissionalId(profissionalSugerido ?? atendentes?.[0]?.id ?? '')
    setData(isoData(base))
    setHorario(inicioSugerido ? hora(base) : '')
    setCliente(null)
    setBusca('')
    setModoNovoCliente(false)
    setNovoNome('')
    setNovoFone('')
    setDesconto('')
    setObservacao('')
  }, [aberto, agendamento, inicioSugerido, profissionalSugerido, servicos, atendentes])

  const servico = useMemo(() => servicos?.find((s) => s.id === servicoId), [servicos, servicoId])

  useEffect(() => {
    if (!editando && servico) setPreco(String(servico.preco))
  }, [servico, editando])

  const termoBusca = useDebounce(busca)
  const { dados: sugestoes, carregando: buscando } = useSugerirClientes(
    cliente || modoNovoCliente ? '' : termoBusca,
  )

  const { dados: livres, carregando: carregandoHorarios } = useHorariosLivres(
    data, servicoId, profissionalId,
  )

  const listaHorarios = useMemo(() => {
    const base = (livres ?? []).map(hora)
    // Ao editar, o horário atual continua na lista mesmo estando ocupado por
    // este próprio agendamento.
    if (editando && horario && !base.includes(horario)) return [horario, ...base].sort()
    return base
  }, [livres, editando, horario])

  /** Cadastro rápido durante o agendamento, reaproveitando ficha existente. */
  const resolverCliente = async (): Promise<string | null> => {
    if (cliente) return cliente.id
    if (!modoNovoCliente) return null

    const fone = digitos(novoFone)
    const existente = fone ? await clientesRepo.porTelefone(fone) : null
    if (existente) return existente.id

    const criada = await salvarCliente.executar({
      dados: {
        nome: limparNome(novoNome),
        telefone: fone || null,
        whatsapp: fone || null,
        instagram: null,
        nascimento: null,
        observacoes: null,
        preferencias: null,
        etiquetas: [],
        aceitaContato: false,
        ativo: true,
      },
    })

    return criada.id
  }

  const enviar = async () => {
    if (!servicoId || !profissionalId || !data || !horario) {
      aviso.erro('Faltam informações', 'Escolha serviço, profissional, data e horário.')
      return
    }
    if (!cliente && !modoNovoCliente) {
      aviso.erro('Escolha a cliente', 'Busque uma cliente ou cadastre uma nova.')
      return
    }
    if (modoNovoCliente && limparNome(novoNome).length < 2) {
      aviso.erro('Informe o nome', 'A cliente precisa de um nome no registro.')
      return
    }

    const inicio = new Date(`${data}T${horario}:00`)

    try {
      const clienteId = await resolverCliente()

      const comum = {
        preco: Number(preco) || 0,
        desconto: Number(desconto) || 0,
        observacao: limparTexto(observacao) || null,
      }

      if (agendamento) {
        await remarcar.executar({
          id: agendamento.id,
          mudancas: { ...comum, servicoId, profissionalId, inicio: inicio.toISOString(), clienteId },
        })
      } else {
        await agendar.executar({
          ...comum,
          clienteId,
          servicoId,
          profissionalId,
          inicio: inicio.toISOString(),
          nomeAvulso: modoNovoCliente ? limparNome(novoNome) : null,
          telefoneAvulso: modoNovoCliente ? digitos(novoFone) || null : null,
        })
      }

      aviso.sucesso(
        editando ? 'Agendamento atualizado' : 'Agendamento criado',
        `${dataRelativa(inicio)} às ${horario}`,
      )
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  const alterarSituacao = async (situacao: SituacaoAgendamento) => {
    if (!agendamento) return
    try {
      // A fila é lida antes de gravar: depois de cancelado o horário
      // deixa de ocupar a faixa e a busca não acharia mais ninguém.
      const fila = situacao === 'cancelado' ? interessadas ?? [] : []

      await mudarSituacao.executar({ id: agendamento.id, situacao })
      aviso.sucesso(ROTULO_SITUACAO[situacao] ?? 'Situação atualizada')
      setConfirmandoCancelamento(false)

      if (fila.length > 0) {
        setVagaAberta(agendamento)
        return
      }

      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível atualizar', mensagemDeErro(falha))
    }
  }

  const fecharAviso = () => {
    setVagaAberta(null)
    aoFechar()
  }

  const total = Math.max(Number(preco || 0) - Number(desconto || 0), 0)
  const encerrado = !!agendamento && ['cancelado', 'concluido'].includes(agendamento.situacao)

  return {
    /* referência */
    servicos, atendentes, servico, editando, encerrado, total,

    /* campos */
    servicoId, setServicoId, profissionalId, setProfissionalId,
    data, setData, horario, setHorario,
    cliente, setCliente, busca, setBusca,
    modoNovoCliente, setModoNovoCliente,
    novoNome, setNovoNome, novoFone, setNovoFone,
    preco, setPreco, desconto, setDesconto, observacao, setObservacao,

    /* apoio da tela */
    sugestoes, buscando, listaHorarios, carregandoHorarios,
    interessadas: interessadas ?? [],

    /* fluxo de cancelamento e lista de espera */
    confirmandoCancelamento, setConfirmandoCancelamento,
    vagaAberta, fecharAviso,

    /* ações */
    enviar, alterarSituacao,
    salvando, mudandoSituacao: mudarSituacao.salvando,
  }
}
