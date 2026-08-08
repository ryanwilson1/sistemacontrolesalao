import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTema } from '@/contexts'
import {
  useConfirmarPeloPortal, useEntrarNaFila, useGradeDoDia, useLiberarReserva,
  usePortal, useReservar, useVarrerReservas,
} from '@/hooks'
import { useRelogio } from '@/hooks/useTempoReal'
import { relogioDaReserva, segundosRestantes } from '@/services'
import { PORTAL } from '@/constants'
import { addDays, isoData } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'
import type {
  Agendamento, OpcaoDeHorario, PeriodoDoDia, Profissional, ReservaTemporaria, Servico,
} from '@/types'

export type EtapaDoPortal =
  | 'servico' | 'profissional' | 'horario' | 'dados' | 'espera' | 'pronto' | 'na_espera'

/**
 * O fluxo do portal, fora da página.
 *
 * A tela ficaria com 400 linhas de estado se isto morasse nela — e boa
 * parte desse estado não é de tela, é de negócio: qual reserva está de
 * pé, quanto tempo falta, o que acontece quando ela vence. Aqui dá para
 * ler o fluxo inteiro de uma vez; lá dá para ler o desenho.
 */
export function usarFluxoDoPortal(identificador?: string) {
  const { dados, carregando } = usePortal(identificador)
  const studio = dados?.studio ?? null

  /*
    A identidade visual do salão vale no portal também.

    Sem isto, a proprietária escolhe a cor da casa, vê o painel dela
    mudar — e o link que ela manda para a cliente continua saindo com a
    cor de fábrica. A promessa de "o portal parece pertencer ao salão"
    quebra justamente na tela que a cliente vê.

    O portal roda sem sessão, então esta é a única oportunidade: o
    `SessaoContext`, que aplica o tema no painel, nem chega a carregar
    aqui.
  */
  const { aplicar, aplicarCorPropria } = useTema()

  useEffect(() => {
    if (!studio) return
    if (studio.tema) aplicar(studio.tema)
    aplicarCorPropria(studio.corPrincipal ?? null)
  }, [studio, aplicar, aplicarCorPropria])

  const [etapa, setEtapa] = useState<EtapaDoPortal>('servico')
  const [servico, setServico] = useState<Servico | null>(null)
  const [profissional, setProfissional] = useState<Profissional | null>(null)
  const [data, setData] = useState(() => isoData(new Date()))

  const [reserva, setReserva] = useState<ReservaTemporaria | null>(null)
  const [restantes, setRestantes] = useState(0)

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [observacao, setObservacao] = useState('')
  const [armadilha, setArmadilha] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoDoDia>('qualquer')

  const [erro, setErro] = useState('')

  /**
   * O que foi marcado, guardado à parte.
   *
   * A reserva é apagada assim que vira agendamento — e a tela final
   * ainda precisa mostrar horário, protocolo e com quem. Ler da reserva
   * daria uma tela em branco no instante do sucesso.
   */
  const [confirmado, setConfirmado] = useState<Agendamento | null>(null)

  const grade = useGradeDoDia(data, servico?.id ?? '', profissional?.id ?? null)
  const reservar = useReservar()
  const liberar = useLiberarReserva()
  const confirmar = useConfirmarPeloPortal()
  const entrarNaFila = useEntrarNaFila()
  const varrer = useVarrerReservas()

  /* Devolve à agenda o que venceu, inclusive de outras visitantes. */
  useRelogio(() => void varrer.executar(undefined), PORTAL.varreduraMs)

  /* Relógio regressivo da reserva desta cliente. */
  useEffect(() => {
    if (!reserva) return setRestantes(0)

    const atualizar = () => {
      const faltam = segundosRestantes(reserva)
      setRestantes(faltam)

      if (faltam === 0) {
        setReserva(null)
        setErro('O tempo acabou e o horário voltou para a agenda. Escolha de novo, por favor.')
        setEtapa('horario')
      }
    }

    atualizar()
    const relogio = window.setInterval(atualizar, PORTAL.contagemMs)
    return () => window.clearInterval(relogio)
  }, [reserva])

  /* Trocar de serviço ou de dia solta o horário que estava preso. */
  const soltar = useCallback(async () => {
    setReserva(null)
    try {
      await liberar.executar(undefined)
    } catch {
      // Vence sozinha em poucos minutos de qualquer forma.
    }
  }, [liberar])

  const datasDisponiveis = useMemo(() => {
    const limite = Math.min(studio?.horizonteDias ?? 30, PORTAL.diasNaTira)
    return Array.from({ length: limite }, (_, indice) => addDays(new Date(), indice))
  }, [studio])

  /* ---------------- Ações ---------------- */

  const escolherServico = (item: Servico) => {
    setServico(item)
    setErro('')
    setEtapa(studio?.escolhaDeProfissional ? 'profissional' : 'horario')
  }

  const escolherProfissional = (item: Profissional | null) => {
    setProfissional(item)
    setEtapa('horario')
  }

  const trocarData = (nova: string) => {
    void soltar()
    setData(nova)
  }

  /**
   * Prender o horário acontece no toque, não no "Continuar".
   *
   * Entre uma coisa e outra a cliente ainda vai ler o resumo e decidir —
   * e é justamente nesse intervalo que outra pessoa marcaria por cima.
   */
  const escolherHorario = async (opcao: OpcaoDeHorario) => {
    if (!servico) return
    setErro('')

    // Sem preferência: fica com quem tiver a agenda mais vazia é o que
    // pareceria justo, mas exigiria contar a agenda de todas a cada
    // toque. A primeira livre resolve e mantém o toque instantâneo.
    const escolhida = profissional?.id ?? opcao.profissionaisLivres[0]
    if (!escolhida) return

    try {
      const nova = await reservar.executar({
        servicoId: servico.id,
        profissionalId: escolhida,
        inicio: opcao.inicio.toISOString(),
      })
      setReserva(nova)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
      grade.recarregar()
    }
  }

  const enviarAgendamento = async () => {
    setErro('')

    // Campo invisível preenchido = robô. Fingimos sucesso e não gravamos.
    if (armadilha) {
      setEtapa('pronto')
      return
    }

    if (!reserva) {
      setErro('Seu horário expirou. Escolha outro, por favor.')
      setEtapa('horario')
      return
    }

    try {
      const { agendamento } = await confirmar.executar({
        reserva, nome, telefone, observacao,
      })
      setConfirmado(agendamento)
      setReserva(null)
      setEtapa('pronto')
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  const enviarEspera = async () => {
    if (!servico) return
    setErro('')

    try {
      await entrarNaFila.executar({
        nome, telefone, servicoId: servico.id,
        profissionalId: profissional?.id ?? null,
        data, periodo, observacao,
      })
      setEtapa('na_espera')
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  const voltar = () => {
    setErro('')
    if (etapa === 'dados') {
      void soltar()
      setEtapa('horario')
    } else if (etapa === 'espera') setEtapa('horario')
    else if (etapa === 'horario') {
      void soltar()
      setEtapa(studio?.escolhaDeProfissional ? 'profissional' : 'servico')
    } else if (etapa === 'profissional') setEtapa('servico')
  }

  const desistirDaReserva = () => {
    void soltar()
    setEtapa('horario')
  }

  return {
    /* dados */
    carregando, studio, servicos: dados?.servicos ?? [], profissionais: dados?.profissionais ?? [],
    datasDisponiveis, grade,

    /* estado do fluxo */
    etapa, setEtapa, servico, profissional, data, reserva, confirmado, erro,
    relogio: relogioDaReserva(restantes),
    urgente: restantes > 0 && restantes <= 60,

    /* formulário */
    nome, setNome, telefone, setTelefone, observacao, setObservacao,
    armadilha, setArmadilha, periodo, setPeriodo,

    /* ações */
    escolherServico, escolherProfissional, trocarData, escolherHorario,
    enviarAgendamento, enviarEspera, voltar, desistirDaReserva,

    /* estados de envio */
    reservando: reservar.salvando,
    enviando: confirmar.salvando,
    entrandoNaFila: entrarNaFila.salvando,
  }
}
