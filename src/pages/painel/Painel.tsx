import { lazy, Suspense, useMemo } from 'react'
import { Award, Clock, Scissors } from 'lucide-react'
import { CabecalhoPagina } from '@/components/common'
import { EstadoErro, EsqueletoCarta } from '@/components/feedback'
import { usePainelCompleto, useResumoDoDia, useRetornoMedio } from '@/hooks'
import { useSessao } from '@/contexts'
import { dataLonga, hora } from '@/utils/datas'
import { ProximosAtendimentos } from './componentes/ProximosAtendimentos'
import { Aniversariantes, EstoqueBaixo } from './componentes/ListasDoDia'
import {
  CartaoDestaque, HorariosMovimentados, IndicadorPeriodo, NumerosSecundarios,
  ProdutosMaisUsados, Taxa,
} from './componentes/IndicadoresPremium'

/**
 * O gráfico traz a biblioteca de charts junto (~110 KB comprimidos).
 * Como só a gestão o enxerga, entra por carregamento sob demanda.
 */
const GraficoFaturamento = lazy(() =>
  import('./componentes/GraficoFaturamento').then((m) => ({ default: m.GraficoFaturamento })),
)

function saudacao(): string {
  const agora = new Date().getHours()
  if (agora < 12) return 'Bom dia'
  if (agora < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function Painel() {
  const { nome, ehGestor } = useSessao()
  const hoje = useMemo(() => new Date(), [])

  const { dados, carregando, erro, recarregar } = useResumoDoDia(hoje)
  const { dados: painel, carregando: carregandoPainel } = usePainelCompleto(hoje)
  const { dados: retornoMedio } = useRetornoMedio()

  if (erro) {
    return (
      <>
        <CabecalhoPagina titulo="Início" />
        <EstadoErro descricao={erro} aoTentarNovamente={recarregar} />
      </>
    )
  }

  const primeiroNome = nome.split(' ')[0] ?? ''

  return (
    <>
      <CabecalhoPagina
        sobretitulo={dataLonga(hoje)}
        titulo={`${saudacao()}, ${primeiroNome}`}
        descricao="Este é o resumo do seu dia."
      />

      {/* Indicadores por período */}
      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        {carregandoPainel || !painel ? (
          Array.from({ length: 4 }).map((_, i) => <EsqueletoCarta key={i} />)
        ) : (
          <>
            <IndicadorPeriodo rotulo="Agendamentos" valores={painel.agendamentos} atraso={0} />
            {ehGestor && (
              <IndicadorPeriodo
                rotulo="Receita" valores={painel.faturamento} formato="dinheiro" atraso={1}
              />
            )}
            <Taxa
              rotulo="Ocupação da agenda"
              valor={painel.taxaOcupacao}
              detalhe={`${painel.horariosLivresHoje} horário(s) ainda livres hoje`}
              atraso={2}
            />
            <Taxa
              rotulo="Cancelamentos"
              valor={painel.taxaCancelamento}
              detalhe={`${painel.cancelamentos.mes} no mês, ${painel.faltas} falta(s)`}
              invertido
              atraso={3}
            />
          </>
        )}
      </section>

      {/* Números secundários */}
      {painel && (
        <section className="mt-2.5 sm:mt-4">
          <NumerosSecundarios painel={painel} retornoMedio={retornoMedio ?? null} />
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <ProximosAtendimentos itens={dados?.proximos ?? []} carregando={carregando} />

          {ehGestor && painel && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CartaoDestaque
                titulo="Profissional destaque"
                destaque={painel.profissionalDestaque}
                icone={Award}
              />
              <CartaoDestaque
                titulo="Serviço mais vendido"
                destaque={painel.servicoMaisVendido}
                icone={Scissors}
                formato="numero"
              />
            </div>
          )}

          {painel && <HorariosMovimentados faixas={painel.horariosMovimentados} />}
        </div>

        <div className="space-y-4">
          {ehGestor && (
            <Suspense fallback={<EsqueletoCarta />}>
              <GraficoFaturamento
                serie={dados?.serieFaturamento ?? []}
                faturado={dados?.faturamentoDoMes ?? 0}
                meta={dados?.metaDoMes ?? null}
                carregando={carregando}
              />
            </Suspense>
          )}
          <Aniversariantes itens={dados?.aniversariantes ?? []} />
          <EstoqueBaixo itens={dados?.estoqueBaixo ?? []} />
          {painel && <ProdutosMaisUsados produtos={painel.produtosMaisUsados} />}
        </div>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11.5px] text-onix-300">
        <Clock className="h-3 w-3" />
        Atualizado às {hora(new Date())}
      </p>
    </>
  )
}
