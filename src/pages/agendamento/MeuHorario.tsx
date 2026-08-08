import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, KeyRound, Search } from 'lucide-react'
import { Botao, Campo, Entrada } from '@/components/ui'
import { CarregandoTela } from '@/components/feedback'
import { useAbrirSolicitacao, useConsultarHorario, usePortal, useRegistrarChegada } from '@/hooks'
import { ROTAS } from '@/constants'
import { mascaraTelefone } from '@/utils/formato'
import { mensagemDeErro } from '@/utils/erros'
import { CabecalhoDoPortal, Passo, TelaSimples } from './componentes/Moldura'
import { DetalheDoHorario } from './componentes/DetalheDoHorario'
import type { AgendamentoDetalhado, TipoSolicitacao } from '@/types'

/**
 * O horário da cliente.
 *
 * Entra com protocolo e telefone — os dois, nunca só um. Protocolo
 * sozinho é adivinhável em poucas tentativas de sorte; telefone sozinho
 * abriria a agenda de qualquer pessoa para quem souber o número dela.
 *
 * Daqui ela consulta e **pede**. Não altera nada: a agenda de um studio
 * não é uma lista de compromissos independentes, e quem tem o quadro
 * inteiro na cabeça é quem toca o studio.
 */
export default function MeuHorario() {
  const { identificador } = useParams<{ identificador: string }>()
  const { dados, carregando } = usePortal(identificador)

  const [protocolo, setProtocolo] = useState('')
  const [telefone, setTelefone] = useState('')
  const [agendamento, setAgendamento] = useState<AgendamentoDetalhado | null>(null)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState<TipoSolicitacao | null>(null)

  const consultar = useConsultarHorario()
  const chegada = useRegistrarChegada()
  const solicitar = useAbrirSolicitacao()

  if (carregando) return <CarregandoTela mensagem="Abrindo" />

  if (!dados?.studio) {
    return <TelaSimples titulo="Studio não encontrado" texto="Confira o link e tente de novo." />
  }

  const buscar = async () => {
    setErro('')
    try {
      const encontrado = await consultar.executar({ protocolo, telefone })
      if (!encontrado) {
        setErro('Não achamos esse horário. Confira o protocolo e o telefone que você usou.')
        return
      }
      setAgendamento(encontrado)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <div className="min-h-dvh bg-quartzo pb-12">
      <CabecalhoDoPortal studio={dados.studio} compacto />

      <main className="mx-auto w-full max-w-lg px-5 pt-6">
        <Link
          to={ROTAS.agendamentoPublico(identificador ?? dados.studio.identificador)}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-onix-400 transition-colors hover:text-onix-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Marcar um horário
        </Link>

        {!agendamento ? (
          <Busca
            protocolo={protocolo} aoMudarProtocolo={setProtocolo}
            telefone={telefone} aoMudarTelefone={setTelefone}
            erro={erro} buscando={consultar.salvando}
            aoBuscar={() => void buscar()}
          />
        ) : (
          <DetalheDoHorario
            agendamento={agendamento}
            aceitaSolicitacoes={dados.studio.aceitaSolicitacoes}
            checkinAtivo={dados.studio.checkinAtivo}
            /*
              Grava primeiro, atualiza a tela depois.

              A versão anterior só fazia `setAgendamento({...})`: a
              cliente via "chegada registrada", ia sentar, e a recepção
              não recebia nada. Nada era gravado em lugar nenhum — o
              aviso existia só naquele navegador, até ela recarregar a
              página.

              Agora o servidor confirma antes de a tela mudar. Se
              falhar, o erro aparece e o botão continua disponível: é
              melhor a cliente avisar de novo do que achar que avisou.
            */
            aoChegar={async () => {
              setErro('')
              try {
                // O horário exibido é o que o BANCO gravou. Usar
                // `new Date()` daqui faria um celular com relógio
                // adiantado mostrar uma hora que a recepção não vê.
                const chegouEm = await chegada.executar({
                  agendamentoId: agendamento.id,
                  protocolo,
                  telefone,
                })
                setAgendamento({ ...agendamento, chegouEm })
              } catch (falha) {
                setErro(mensagemDeErro(falha))
              }
            }}
            registrandoChegada={chegada.salvando}
            enviado={enviado}
            enviando={solicitar.salvando}
            erro={erro}
            aoPedir={async (tipo, mensagem) => {
              setErro('')
              try {
                await solicitar.executar({
                  agendamentoId: agendamento.id, tipo, mensagem,
                  // Com banco, é por eles que o servidor confere se quem
                  // pede é quem marcou — o id vem da tela e poderia ser
                  // trocado no console.
                  protocolo, telefone,
                })
                setEnviado(tipo)
              } catch (falha) {
                setErro(mensagemDeErro(falha))
              }
            }}
          />
        )}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Busca({
  protocolo, aoMudarProtocolo, telefone, aoMudarTelefone, erro, buscando, aoBuscar,
}: {
  protocolo: string
  aoMudarProtocolo: (v: string) => void
  telefone: string
  aoMudarTelefone: (v: string) => void
  erro: string
  buscando: boolean
  aoBuscar: () => void
}) {
  return (
    <Passo titulo="Consultar meu horário">
      <div className="space-y-4">
        <Campo rotulo="Protocolo" obrigatorio dica="Os seis caracteres que você recebeu ao marcar.">
          <Entrada
            value={protocolo}
            onChange={(e) => aoMudarProtocolo(e.target.value.toUpperCase().slice(0, 8))}
            placeholder="ABC123" maxLength={8} autoFocus
            className="tabular tracking-[0.2em]"
            prefixo={<KeyRound className="h-4 w-4" />}
          />
        </Campo>

        <Campo rotulo="Telefone com DDD" obrigatorio>
          <Entrada
            value={telefone} onChange={(e) => aoMudarTelefone(mascaraTelefone(e.target.value))}
            placeholder="(11) 98765-4321" inputMode="tel"
          />
        </Campo>

        {erro && (
          <p className="rounded-xl border border-[#EBD2D4] bg-[#FBF3F4] px-3.5 py-2.5 text-[13px] text-perigo">
            {erro}
          </p>
        )}

        <Botao variante="ouro" tamanho="lg" bloco onClick={aoBuscar} carregando={buscando}>
          <Search className="h-4 w-4" /> Buscar
        </Botao>
      </div>
    </Passo>
  )
}
