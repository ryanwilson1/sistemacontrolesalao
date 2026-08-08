import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, DoorOpen } from 'lucide-react'
import { AreaTexto, Botao, Campo, Etiqueta } from '@/components/ui'
import { podeFazerCheckin } from '@/services'
import { SITUACAO } from '@/constants'
import { dataRelativa, hora } from '@/utils/datas'
import { dinheiro } from '@/utils/formato'
import { Passo } from './Moldura'
import type { AgendamentoDetalhado, TipoSolicitacao } from '@/types'

/**
 * O horário encontrado, e o que a cliente pode fazer com ele.
 *
 * Consultar e **pedir** — nunca alterar. A agenda de um studio não é uma
 * lista de compromissos independentes: o horário que abre às 15h pode ser
 * o que permitiu recusar outra cliente às 14h. Quem tem esse quadro na
 * cabeça é quem toca o studio, então é ela quem decide.
 */
export function DetalheDoHorario({
  agendamento, aceitaSolicitacoes, checkinAtivo, enviado, enviando, erro, aoPedir, aoChegar,
  registrandoChegada,
}: {
  agendamento: AgendamentoDetalhado
  aceitaSolicitacoes: boolean
  checkinAtivo: boolean
  enviado: TipoSolicitacao | null
  enviando: boolean
  erro: string
  aoPedir: (tipo: TipoSolicitacao, mensagem: string) => Promise<void>
  /**
   * Registra a chegada. Quem persiste é a página, não este componente.
   *
   * Antes havia duas chamadas para a mesma coisa: este componente
   * gravava por `useRegistrarChegada` e a página gravava de novo no
   * `.then()`. Uma delas não passava pela RPC do portal e falhava com
   * banco ligado; a outra só mexia no estado do React. Juntas, davam a
   * impressão de funcionar em modo local e nada em produção.
   */
  aoChegar: () => Promise<void>
  registrandoChegada?: boolean
}) {
  const [pedindo, setPedindo] = useState<TipoSolicitacao | null>(null)
  const [mensagem, setMensagem] = useState('')
  const podeChegar = checkinAtivo && podeFazerCheckin(agendamento)

  const situacao = SITUACAO[agendamento.situacao]
  const encerrado = ['cancelado', 'concluido', 'faltou'].includes(agendamento.situacao)
  const jaPediu = ['solicitou_alteracao', 'solicitou_cancelamento'].includes(agendamento.situacao)

  const linhas: [string, string][] = [
    ['Serviço', agendamento.servico?.nome ?? '—'],
    ['Com', agendamento.profissional?.nome ?? '—'],
    ['Quando', `${dataRelativa(agendamento.inicio)} às ${hora(agendamento.inicio)}`],
    ['Valor', dinheiro(agendamento.preco - agendamento.desconto)],
    ['Protocolo', agendamento.protocolo],
  ]

  if (enviado) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-white p-7 text-center shadow-carta"
      >
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ouro-100 text-ouro-600">
          <CalendarClock className="h-8 w-8" strokeWidth={1.5} />
        </span>
        <h2 className="mt-5 font-display text-[22px] font-light tracking-tight text-onix-900">
          Pedido enviado
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-onix-400">
          {enviado === 'cancelamento'
            ? 'O studio recebeu seu pedido de cancelamento.'
            : 'O studio recebeu seu pedido de alteração.'}
          <br />
          Assim que for analisado, avisamos você pelo WhatsApp.
        </p>
        <p className="mt-5 text-[13px] leading-relaxed text-onix-400">
          Seu horário continua reservado até lá 💛
        </p>
      </motion.div>
    )
  }

  return (
    <Passo titulo="Seu horário">
      <div className="rounded-2xl border border-onix-100 bg-white p-4">
        <div className="mb-3 flex justify-end">
          <Etiqueta className={situacao.classe} ponto={situacao.ponto}>
            {situacao.rotulo}
          </Etiqueta>
        </div>

        <dl className="space-y-1.5 text-[13.5px]">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-3">
              <dt className="shrink-0 text-onix-400">{rotulo}</dt>
              <dd className="truncate text-right font-medium text-onix-800">{valor}</dd>
            </div>
          ))}
        </dl>

        {agendamento.observacao && (
          <p className="mt-3 border-t border-onix-50 pt-3 text-[13px] leading-relaxed text-onix-500">
            {agendamento.observacao}
          </p>
        )}
      </div>

      {/*
        O check-in aparece só na janela em que faz sentido: uma hora
        antes até o fim do atendimento. Fora dela o botão nem existe.
      */}
      {podeChegar && (
        <Botao
          variante="ouro" tamanho="lg" bloco className="mt-4"
          carregando={registrandoChegada}
          onClick={() => void aoChegar()}
        >
          <DoorOpen className="h-4 w-4" /> Cheguei
        </Botao>
      )}

      {agendamento.chegouEm && (
        <p className="mt-4 rounded-2xl border border-[#CFE0D5] bg-[#E8F0EA] px-4 py-3 text-center text-[13px] leading-relaxed text-[#3D6250]">
          O studio já sabe que você chegou. Pode se acomodar 💛
        </p>
      )}

      {encerrado ? (
        <p className="mt-4 rounded-2xl border border-onix-100 bg-white/60 px-4 py-5 text-center text-[13.5px] leading-relaxed text-onix-400">
          Este horário já foi encerrado. Para marcar de novo, é só voltar ao início.
        </p>
      ) : jaPediu ? (
        <p className="mt-4 rounded-2xl border border-ouro-200 bg-ouro-100/60 px-4 py-5 text-center text-[13.5px] leading-relaxed text-ouro-700">
          Já existe um pedido em análise para este horário. Avisamos você
          assim que o studio responder.
        </p>
      ) : !aceitaSolicitacoes ? (
        <p className="mt-4 rounded-2xl border border-onix-100 bg-white/60 px-4 py-5 text-center text-[13.5px] leading-relaxed text-onix-400">
          Para mudar ou cancelar, fale com o studio pelo WhatsApp.
        </p>
      ) : pedindo ? (
        <div className="mt-4 space-y-4 rounded-2xl border border-onix-100 bg-white p-4">
          <Campo
            rotulo={pedindo === 'cancelamento' ? 'Por que precisa cancelar?' : 'Quando ficaria melhor?'}
            dica="A proprietária lê antes de decidir."
          >
            <AreaTexto
              value={mensagem} onChange={(e) => setMensagem(e.target.value)}
              placeholder={
                pedindo === 'cancelamento'
                  ? 'Opcional, mas ajuda muito'
                  : 'Ex.: qualquer horário na quinta à tarde'
              }
              maxLength={500} rows={3} autoFocus
            />
          </Campo>

          {erro && (
            <p className="rounded-xl border border-[#EBD2D4] bg-[#FBF3F4] px-3.5 py-2.5 text-[13px] text-perigo">
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <Botao variante="fantasma" bloco onClick={() => setPedindo(null)}>
              Voltar
            </Botao>
            <Botao
              variante="ouro" bloco carregando={enviando}
              onClick={() => void aoPedir(pedindo, mensagem)}
            >
              Enviar pedido
            </Botao>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Botao variante="secundario" bloco onClick={() => setPedindo('alteracao')}>
            Pedir outro horário
          </Botao>
          <Botao variante="perigo" bloco onClick={() => setPedindo('cancelamento')}>
            Pedir cancelamento
          </Botao>
          <p className="pt-1 text-center text-[12px] leading-relaxed text-onix-300">
            Os dois são pedidos: o studio confirma antes de valer.
          </p>
        </div>
      )}
    </Passo>
  )
}
