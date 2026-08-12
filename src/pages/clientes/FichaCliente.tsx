import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, Cake, MessageCircle, Pencil, RotateCcw } from 'lucide-react'
import { Botao, Carta, Etiqueta, Retrato } from '@/components/ui'
import { CarregandoTela, Confirmar, EstadoErro } from '@/components/feedback'
import { useArquivarCliente, useCliente, useHistoricoDoCliente, useReativarCliente } from '@/hooks'
import { MENSAGENS } from '@/components/common'
import { useAviso } from '@/contexts'
import { mensagemDeErro } from '@/utils/erros'
import { ROTAS } from '@/constants'
import { linkWhatsApp, telefone } from '@/utils/formato'
import { dataCurta } from '@/utils/datas'
import { FormularioCliente } from './FormularioCliente'
import { TimelineCliente } from './componentes/TimelineCliente'
import {
  NotasDoCliente, NumerosDoCliente, PontosDoCliente, RitmoDeRetorno, ServicosPreferidos,
} from './componentes/PainelDoCliente'

export default function FichaCliente() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const [editando, setEditando] = useState(false)
  const [confirmandoArquivo, setConfirmandoArquivo] = useState(false)

  const aviso = useAviso()
  const arquivar = useArquivarCliente()
  const reativar = useReativarCliente()

  const { dados, carregando, erro, recarregar } = useCliente(id)
  const { dados: historico, carregando: carregandoHistorico } = useHistoricoDoCliente(id)

  if (carregando) return <CarregandoTela mensagem="Abrindo ficha" />

  if (erro || !dados?.cliente) {
    return (
      <EstadoErro
        titulo="Ficha não encontrada"
        descricao="Esta cliente pode ter sido removida."
        aoTentarNovamente={recarregar}
      />
    )
  }

  const { cliente, resumo } = dados

  /*
    O próximo atendimento dela, se houver.

    `doCliente` já devolve em ordem decrescente de data, então o
    próximo é o último item futuro que ainda está de pé — cancelado e
    faltou não contam como compromisso.
  */
  const proximo = [...(historico ?? [])]
    .reverse()
    .find(
      (a) =>
        new Date(a.inicio).getTime() > Date.now() &&
        ['pendente', 'confirmado'].includes(a.situacao),
    )

  /**
   * Arquivar em vez de apagar.
   *
   * A ficha carrega o histórico de atendimentos, os pontos e as fotos
   * de evolução. Apagá-la levaria tudo isso junto — e as entradas de
   * caixa daquela cliente ficariam sem dono no fechamento do mês.
   *
   * Depois de arquivar, volta para a lista: ficar na ficha de alguém
   * que acabou de sumir da lista principal é confuso, e a proprietária
   * arquivou justamente porque terminou com aquele cadastro.
   */
  const confirmarArquivo = async () => {
    try {
      await arquivar.executar(cliente.id)
      setConfirmandoArquivo(false)
      aviso.sucesso(
        'Cliente arquivada',
        'Ela saiu da lista principal. O histórico continua guardado.',
      )
      navegar(ROTAS.clientes)
    } catch (falha) {
      setConfirmandoArquivo(false)
      aviso.erro('Não foi possível arquivar', mensagemDeErro(falha))
    }
  }

  const desarquivar = async () => {
    try {
      await reativar.executar(cliente.id)
      aviso.sucesso('Cliente reativada', 'Ela voltou para a lista principal.')
    } catch (falha) {
      aviso.erro('Não foi possível reativar', mensagemDeErro(falha))
    }
  }

  return (
    <>
      <button
        onClick={() => navegar(ROTAS.clientes)}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-onix-400 transition-colors hover:text-onix-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Todas as clientes
      </button>

      <Carta className="mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Retrato nome={cliente.nome} tamanho="lg" />

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[21px] font-light leading-tight tracking-tight text-onix-900 sm:text-[24px]">
              {cliente.nome}
            </h1>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-onix-400">
              {cliente.telefone && <span className="tabular">{telefone(cliente.telefone)}</span>}
              {cliente.instagram && <span className="truncate">{cliente.instagram}</span>}
              {cliente.nascimento && (
                <span className="inline-flex items-center gap-1.5">
                  <Cake className="h-3.5 w-3.5" /> {dataCurta(cliente.nascimento)}
                </span>
              )}
            </div>

            {cliente.etiquetas.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {cliente.etiquetas.map((etiqueta) => (
                  <Etiqueta key={etiqueta}>{etiqueta}</Etiqueta>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {cliente.whatsapp && (
              <a
                /*
                  A mensagem muda conforme a situação da cliente.

                  Um "Oi, Ana!" solto obriga a proprietária a digitar o
                  resto justamente quando ela está com pressa. Com o
                  próximo horário na mão, a confirmação sai pronta; sem
                  horário marcado, o convite de volta faz mais sentido.
                */
                href={linkWhatsApp(
                  cliente.whatsapp,
                  proximo
                    ? MENSAGENS.confirmacao(cliente.nome, proximo.inicio, proximo.servico?.nome)
                    : MENSAGENS.saudade(cliente.nome),
                )}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-onix-200 bg-white px-4 text-sm font-medium text-onix-700 transition-colors hover:bg-quartzo-50 sm:flex-none"
              >
                <MessageCircle className="h-4 w-4 text-sucesso" /> WhatsApp
              </a>
            )}
            <Botao variante="secundario" onClick={() => setEditando(true)} className="flex-1 sm:flex-none">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Botao>

            {/*
              Arquivar aparece para quem está ativa; reativar, para quem
              não está. Um botão só, trocando de papel — dois lado a
              lado obrigariam a proprietária a ler qual está válido
              agora, e um deles estaria sempre desabilitado sem motivo
              visível.
            */}
            {cliente.ativo ? (
              <Botao
                variante="fantasma"
                onClick={() => setConfirmandoArquivo(true)}
                className="flex-1 sm:flex-none"
              >
                <Archive className="h-3.5 w-3.5" /> Arquivar
              </Botao>
            ) : (
              <Botao
                variante="secundario"
                onClick={() => void desarquivar()}
                carregando={reativar.salvando}
                className="flex-1 sm:flex-none"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reativar
              </Botao>
            )}
          </div>
        </div>
      </Carta>

      <NumerosDoCliente resumo={resumo} />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <TimelineCliente historico={historico ?? []} carregando={carregandoHistorico} />

        <div className="space-y-4">
          <NotasDoCliente cliente={cliente} />
          <PontosDoCliente pontos={resumo.pontos} />
          <ServicosPreferidos historico={historico ?? []} />
          <RitmoDeRetorno resumo={resumo} />
        </div>
      </div>

      <FormularioCliente
        aberto={editando}
        aoFechar={() => setEditando(false)}
        cliente={cliente}
      />

      {/*
        O texto é o que a proprietária precisa saber para decidir, e é
        literalmente o que foi pedido: arquivar não é apagar. Dizer só
        "tem certeza?" faria ela hesitar e desistir de usar o recurso —
        que foi o que aconteceu enquanto o botão não existia e a única
        saída aparente era apagar a ficha.
      */}
      <Confirmar
        aberto={confirmandoArquivo}
        aoFechar={() => setConfirmandoArquivo(false)}
        aoConfirmar={() => void confirmarArquivo()}
        titulo="Arquivar esta cliente?"
        descricao="Esta cliente deixará de aparecer na lista principal, mas seu histórico será preservado. Você pode reativá-la a qualquer momento."
        rotuloConfirmar="Arquivar"
        carregando={arquivar.salvando}
      />
    </>
  )
}
