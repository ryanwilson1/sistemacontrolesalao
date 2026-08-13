import { useMemo, useState } from 'react'
import {
  Ban, CheckCircle2, Clock, MessageCircle, Play, Send, XCircle,
} from 'lucide-react'
import { CabecalhoPagina, Indicador } from '@/components/common'
import { Abas, Botao, Carta, Etiqueta } from '@/components/ui'
import { EstadoVazio, EsqueletoLista, Confirmar } from '@/components/feedback'
import { useAviso } from '@/contexts'
import {
  useCancelarLembrete, useConfirmarEnvio, useFilaDeLembretes,
  useHistoricoDeLembretes, useProcessarFila, useVencidos,
} from '@/hooks'
import { canal, montarLinkWhatsApp, ROTULO_LEMBRETE } from '@/services'
import { dataCurta, hora, tempoRelativo } from '@/utils/datas'
import { telefone as formatarTelefone } from '@/utils/formato'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import { Modelos } from './Modelos'
import type { Lembrete, SituacaoLembrete } from '@/types'

const SITUACAO: Record<SituacaoLembrete, { rotulo: string; classe: string; ponto: string }> = {
  agendado: { rotulo: 'Na fila', classe: 'border-quartzo-200 bg-quartzo-100 text-quartzo-700', ponto: 'bg-quartzo-500' },
  enviando: { rotulo: 'Aguardando você', classe: 'border-ouro-200 bg-ouro-100 text-ouro-700', ponto: 'bg-ouro-500' },
  enviado: { rotulo: 'Enviado', classe: 'border-[#CFE0D5] bg-[#E8F0EA] text-[#3D6250]', ponto: 'bg-sucesso' },
  falhou: { rotulo: 'Falhou', classe: 'border-[#EBD2D4] bg-[#F7E9EA] text-perigo', ponto: 'bg-perigo' },
  cancelado: { rotulo: 'Cancelado', classe: 'border-onix-200 bg-onix-50 text-onix-400', ponto: 'bg-onix-300' },
}

type Secao = 'fila' | 'historico' | 'modelos'

export default function Lembretes() {
  const [secao, setSecao] = useState<Secao>('fila')
  const [aguardandoConfirmacao, setAguardandoConfirmacao] = useState<Lembrete | null>(null)

  const { dados: fila, carregando } = useFilaDeLembretes()
  const { dados: vencidos } = useVencidos()
  const { dados: historico } = useHistoricoDeLembretes()

  const processar = useProcessarFila()
  const confirmar = useConfirmarEnvio()
  const cancelar = useCancelarLembrete()
  const aviso = useAviso()

  const enviados = useMemo(
    () => (historico ?? []).filter((l) => l.situacao === 'enviado').length,
    [historico],
  )

  const processarFila = async () => {
    try {
      const r = await processar.executar({})

      if (r.processados === 0) {
        aviso.info('Nada vencido na fila', 'Os próximos lembretes ainda não chegaram na hora.')
        return
      }

      if (r.aguardandoAcao > 0) {
        aviso.info(
          `${r.aguardandoAcao} mensagem(ns) prontas`,
          'Abra cada uma no WhatsApp para enviar. O texto já vai preenchido.',
        )
      } else {
        aviso.sucesso(`${r.enviados} lembrete(s) enviados`)
      }
    } catch (falha) {
      aviso.erro('Não foi possível processar', mensagemDeErro(falha))
    }
  }

  /*
    Abrir o WhatsApp NÃO é enviar.

    A versão anterior marcava o lembrete como "enviado" logo depois do
    `window.open`. Só que `window.open` devolve sucesso quando a aba
    abre — e ela abre mesmo que a proprietária feche o WhatsApp sem
    apertar nada, ou desista da mensagem, ou o número esteja errado.

    O histórico passava a afirmar que a cliente foi avisada. Ninguém
    ligava para ela, e ela não aparecia.

    Agora o lembrete fica no estado honesto — aguardando a confirmação
    de quem realmente apertou enviar. Não existe integração capaz de
    confirmar isso sozinha aqui, e inventar uma seria pior do que
    admitir o limite.
  */
  const abrirNoWhatsApp = (lembrete: Lembrete) => {
    window.open(montarLinkWhatsApp(lembrete.destinatario, lembrete.mensagem), '_blank', 'noopener')
    setAguardandoConfirmacao(lembrete)
  }

  /** Só marca como enviado quando a proprietária diz que enviou. */
  const confirmarEnvioDe = async (lembrete: Lembrete) => {
    setAguardandoConfirmacao(null)
    try {
      await confirmar.executar(lembrete.id)
      aviso.sucesso('Lembrete marcado como enviado')
    } catch (falha) {
      aviso.erro('Não foi possível registrar', mensagemDeErro(falha))
    }
  }

  const lista = secao === 'fila' ? fila ?? [] : historico ?? []

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Comunicação"
        titulo="Lembretes"
        descricao="Confirmações e avisos que saem para as clientes."
        acoes={
          secao === 'fila' && (
            <Botao
              variante="ouro" tamanho="sm"
              onClick={() => void processarFila()}
              carregando={processar.salvando}
            >
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Processar fila</span>
              <span className="sm:hidden">Processar</span>
            </Botao>
          )
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Na fila" valor={String(fila?.length ?? 0)} icone={Clock} atraso={0} />
        <Indicador
          rotulo="Prontos para enviar" valor={String(vencidos?.length ?? 0)}
          icone={Send} detalhe="Já passou da hora" destaque={(vencidos?.length ?? 0) > 0} atraso={1}
        />
        <Indicador rotulo="Enviados" valor={String(enviados)} icone={CheckCircle2} atraso={2} />
        <Indicador
          rotulo="Canal" valor={canal.automatico ? 'Automático' : 'Por link'}
          icone={MessageCircle} detalhe={canal.nome} atraso={3}
        />
      </section>

      {!canal.automatico && (
        <Carta className="mb-4 border-ouro-200 bg-ouro-100/40">
          <p className="text-[13px] leading-relaxed text-ouro-700">
            <span className="font-medium">Como funciona hoje:</span> o sistema monta a
            mensagem completa e abre o WhatsApp para você — falta só apertar enviar.
            Envio realmente automático depende da API oficial do WhatsApp, que entra
            junto com o servidor.
          </p>
        </Carta>
      )}

      <div className="mb-4">
        <Abas
          idAnimacao="lembretes"
          abas={[
            { valor: 'fila', rotulo: 'Fila', contador: fila?.length },
            { valor: 'historico', rotulo: 'Histórico', contador: historico?.length },
            { valor: 'modelos', rotulo: 'Modelos' },
          ]}
          ativa={secao}
          aoTrocar={setSecao}
        />
      </div>

      {secao === 'modelos' ? (
        <Modelos />
      ) : carregando ? (
        <EsqueletoLista linhas={4} />
      ) : lista.length === 0 ? (
        <Carta>
          <EstadoVazio
            icone={MessageCircle}
            titulo={secao === 'fila' ? 'Nenhum lembrete na fila' : 'Nada enviado ainda'}
            descricao={
              secao === 'fila'
                ? 'Ao criar um agendamento, os lembretes de confirmação e véspera entram aqui sozinhos.'
                : 'Assim que os primeiros lembretes saírem, o histórico aparece aqui.'
            }
          />
        </Carta>
      ) : (
        <ul className="space-y-2.5">
          {lista.map((lembrete, indice) => {
            const situacao = SITUACAO[lembrete.situacao]
            const vencido = lembrete.situacao === 'agendado' && new Date(lembrete.agendadoPara) <= new Date()

            return (
              <li
                key={lembrete.id}
                className={cn(
                  'entra-lista rounded-2xl border bg-white p-4 shadow-carta',
                  vencido ? 'border-ouro-300' : 'border-onix-100',
                )}
                style={{ animationDelay: `${Math.min(indice * 0.025, 0.3)}s` }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[14.5px] font-medium text-onix-800">
                        {lembrete.nomeDestinatario || 'Sem nome'}
                      </p>
                      <Etiqueta className={situacao.classe} ponto={situacao.ponto}>
                        {situacao.rotulo}
                      </Etiqueta>
                    </div>

                    <p className="tabular mt-1 text-[12.5px] text-onix-400">
                      {ROTULO_LEMBRETE[lembrete.tipo]} ·{' '}
                      {lembrete.destinatario ? formatarTelefone(lembrete.destinatario) : 'sem telefone'} ·{' '}
                      {lembrete.situacao === 'enviado' && lembrete.enviadoEm
                        ? `enviado ${tempoRelativo(lembrete.enviadoEm)}`
                        : `${dataCurta(lembrete.agendadoPara)} às ${hora(lembrete.agendadoPara)}`}
                    </p>

                    <p className="mt-2 whitespace-pre-line rounded-xl bg-quartzo-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-onix-600">
                      {lembrete.mensagem}
                    </p>

                    {lembrete.ultimoErro && (
                      <p className="mt-1.5 text-[12px] text-perigo">
                        {lembrete.ultimoErro} · {lembrete.tentativas} tentativa(s)
                      </p>
                    )}
                  </div>

                  {['agendado', 'enviando', 'falhou'].includes(lembrete.situacao) && (
                    <div className="flex shrink-0 gap-2">
                      <Botao
                        variante="secundario" tamanho="sm"
                        onClick={() => abrirNoWhatsApp(lembrete)}
                        disabled={!lembrete.destinatario}
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-sucesso" />
                        <span className="hidden sm:inline">Enviar</span>
                      </Botao>
                      <Botao
                        variante="perigo" tamanho="sm"
                        onClick={() => void cancelar.executar(lembrete.id)}
                        aria-label="Cancelar lembrete"
                      >
                        {lembrete.situacao === 'falhou' ? <XCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                      </Botao>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {/*
        A pergunta que transforma "aberto" em "enviado".

        Ela existe porque o sistema não tem como saber. O WhatsApp não
        avisa de volta, e fingir que avisou seria pior do que perguntar.
      */}
      <Confirmar
        aberto={aguardandoConfirmacao !== null}
        aoFechar={() => setAguardandoConfirmacao(null)}
        aoConfirmar={() => void confirmarEnvioDe(aguardandoConfirmacao!)}
        titulo="Você enviou a mensagem?"
        descricao={
          aguardandoConfirmacao
            ? `Só marque como enviado se você realmente apertou enviar para ${aguardandoConfirmacao.nomeDestinatario}. Se fechou o WhatsApp sem mandar, volte — o lembrete continua na fila.`
            : undefined
        }
        rotuloConfirmar="Sim, enviei"
      />
    </>
  )
}
