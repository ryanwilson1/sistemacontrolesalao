import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, Check, Inbox, MessageSquare, X } from 'lucide-react'
import { AreaTexto, Botao, Campo, Carta, Etiqueta, Selecao } from '@/components/ui'
import { EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { useAviso, useSessao } from '@/contexts'
import {
  useAprovarAlteracao, useAprovarCancelamento, useHorariosParaRemarcar,
  useRecusarSolicitacao, useSolicitacoesAbertas,
} from '@/hooks'
import { ROTULO_SOLICITACAO } from '@/types'
import { dataRelativa, hora, isoData } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'
import { telefone as formatarTelefone } from '@/utils/formato'
import { cn } from '@/utils/cn'
import type { SolicitacaoDetalhada } from '@/types'

/**
 * Pedidos que a cliente fez pelo portal.
 *
 * Cada um vira uma decisão de duas saídas — aprovar ou recusar — e as
 * duas escrevem no mesmo lugar de sempre. Recusar devolve o agendamento
 * exatamente onde estava; aprovar passa pelo `remarcar` da agenda, com
 * as mesmas regras de conflito. Não existe atalho aqui.
 */
export function Solicitacoes() {
  const { dados: pedidos, carregando } = useSolicitacoesAbertas()
  const [respondendo, setRespondendo] = useState<string | null>(null)

  if (carregando) return <EsqueletoLista linhas={3} />

  if (!pedidos?.length) {
    return (
      <EstadoVazio
        icone={Inbox}
        titulo="Nenhum pedido aguardando"
        descricao="Quando uma cliente pedir para remarcar ou cancelar pelo portal, o pedido aparece aqui."
      />
    )
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {pedidos.map((pedido) => (
          <motion.div
            key={pedido.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
          >
            <CartaDoPedido
              pedido={pedido}
              aberto={respondendo === pedido.id}
              aoAbrir={() => setRespondendo(respondendo === pedido.id ? null : pedido.id)}
              aoFechar={() => setRespondendo(null)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function CartaDoPedido({
  pedido, aberto, aoAbrir, aoFechar,
}: {
  pedido: SolicitacaoDetalhada
  aberto: boolean
  aoAbrir: () => void
  aoFechar: () => void
}) {
  const { nome: quem } = useSessao()
  const aviso = useAviso()

  const recusar = useRecusarSolicitacao()
  const aprovarCancelamento = useAprovarCancelamento()

  const agendamento = pedido.agendamento
  const cliente = agendamento?.cliente?.nome ?? agendamento?.nomeAvulso ?? 'Cliente'
  const contato = agendamento?.cliente?.telefone ?? agendamento?.telefoneAvulso ?? null

  const [resposta, setResposta] = useState('')

  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    try {
      await acao()
      aviso.sucesso(sucesso, cliente)
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível concluir', mensagemDeErro(falha))
    }
  }

  return (
    <Carta>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-onix-800">{cliente}</p>
          <p className="mt-0.5 text-[13px] text-onix-400">
            {agendamento?.servico?.nome ?? 'Serviço'} ·{' '}
            {agendamento && `${dataRelativa(agendamento.inicio)} às ${hora(agendamento.inicio)}`}
          </p>
          {contato && (
            <p className="mt-0.5 text-[12.5px] text-onix-300">{formatarTelefone(contato)}</p>
          )}
        </div>

        <Etiqueta
          className={
            pedido.tipo === 'cancelamento'
              ? 'border-[#EBD2D4] bg-[#F7E9EA] text-[#8C3F45]'
              : 'border-ouro-300 bg-ouro-100 text-ouro-700'
          }
        >
          {ROTULO_SOLICITACAO[pedido.tipo]}
        </Etiqueta>
      </div>

      {pedido.mensagem && (
        <p className="mt-3 flex gap-2 rounded-xl border border-onix-100 bg-quartzo-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-onix-600">
          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-onix-300" />
          {pedido.mensagem}
        </p>
      )}

      {!aberto ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {pedido.tipo === 'cancelamento' ? (
            <Botao
              variante="secundario" tamanho="sm"
              carregando={aprovarCancelamento.salvando}
              onClick={() =>
                void executar(
                  () => aprovarCancelamento.executar({ id: pedido.id, resposta: null, quem }),
                  'Cancelamento aprovado',
                )
              }
            >
              <Check className="h-3.5 w-3.5 text-sucesso" /> Aprovar cancelamento
            </Botao>
          ) : (
            <Botao variante="secundario" tamanho="sm" onClick={aoAbrir}>
              <CalendarClock className="h-3.5 w-3.5 text-ouro-600" /> Escolher novo horário
            </Botao>
          )}

          <Botao
            variante="perigo" tamanho="sm"
            carregando={recusar.salvando}
            onClick={() =>
              void executar(
                () => recusar.executar({ id: pedido.id, resposta: resposta || null, quem }),
                'Pedido recusado',
              )
            }
          >
            <X className="h-3.5 w-3.5" /> Recusar
          </Botao>
        </div>
      ) : (
        <EscolherNovoHorario
          pedido={pedido}
          resposta={resposta}
          aoMudarResposta={setResposta}
          aoCancelar={aoFechar}
          aoConcluir={aoFechar}
        />
      )}
    </Carta>
  )
}

/**
 * O novo horário de um pedido de alteração.
 *
 * A grade oferecida é a mesma da agenda, ignorando o próprio
 * agendamento — sem isso o horário atual apareceria ocupado por ele
 * mesmo e a proprietária não conseguiria mantê-lo.
 */
function EscolherNovoHorario({
  pedido, resposta, aoMudarResposta, aoCancelar, aoConcluir,
}: {
  pedido: SolicitacaoDetalhada
  resposta: string
  aoMudarResposta: (v: string) => void
  aoCancelar: () => void
  aoConcluir: () => void
}) {
  const { nome: quem } = useSessao()
  const aviso = useAviso()
  const aprovar = useAprovarAlteracao()

  const agendamento = pedido.agendamento
  const sugestao = pedido.preferenciaInicio ?? agendamento?.inicio ?? new Date().toISOString()

  const [data, setData] = useState(() => isoData(new Date(sugestao)))
  const [escolhido, setEscolhido] = useState<string | null>(null)

  const { dados: horarios, carregando } = useHorariosParaRemarcar(
    data,
    agendamento?.servicoId ?? '',
    agendamento?.profissionalId ?? '',
    agendamento?.id ?? '',
  )

  const confirmar = async () => {
    if (!escolhido) return
    try {
      await aprovar.executar({
        id: pedido.id,
        mudancas: { inicio: escolhido },
        resposta: resposta || null,
        quem,
      })
      aviso.sucesso('Horário alterado', 'A cliente será avisada.')
      aoConcluir()
    } catch (falha) {
      aviso.erro('Não foi possível remarcar', mensagemDeErro(falha))
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
      <Campo rotulo="Novo dia">
        <Selecao value={data} onChange={(e) => { setData(e.target.value); setEscolhido(null) }}>
          {Array.from({ length: 21 }, (_, indice) => {
            const dia = new Date()
            dia.setDate(dia.getDate() + indice)
            return (
              <option key={isoData(dia)} value={isoData(dia)}>
                {dataRelativa(dia)}
              </option>
            )
          })}
        </Selecao>
      </Campo>

      <Campo rotulo="Horário">
        {carregando ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-white" />
            ))}
          </div>
        ) : !horarios?.length ? (
          <p className="rounded-lg border border-dashed border-onix-200 bg-white px-3 py-4 text-center text-[13px] text-onix-400">
            Nenhum horário livre neste dia.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {horarios.map((item) => {
              const chave = item.toISOString()
              return (
                <button
                  key={chave}
                  onClick={() => setEscolhido(chave)}
                  className={cn(
                    'tabular h-10 rounded-lg border text-[13px] font-medium transition-colors',
                    escolhido === chave
                      ? 'border-transparent bg-onix-800 text-white'
                      : 'border-onix-200 bg-white text-onix-600 hover:border-marca',
                  )}
                >
                  {hora(item)}
                </button>
              )
            })}
          </div>
        )}
      </Campo>

      <Campo rotulo="Recado para a cliente" dica="Opcional. Vai junto na mensagem.">
        <AreaTexto
          value={resposta} onChange={(e) => aoMudarResposta(e.target.value)}
          placeholder="Consegui encaixar você mais cedo 💛" maxLength={400} rows={2}
        />
      </Campo>

      <div className="flex gap-2">
        <Botao variante="fantasma" tamanho="sm" bloco onClick={aoCancelar}>
          Voltar
        </Botao>
        <Botao
          variante="ouro" tamanho="sm" bloco
          disabled={!escolhido} carregando={aprovar.salvando}
          onClick={() => void confirmar()}
        >
          <Check className="h-3.5 w-3.5" /> Confirmar alteração
        </Botao>
      </div>
    </div>
  )
}
