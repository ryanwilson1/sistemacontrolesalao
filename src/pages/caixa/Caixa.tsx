import { useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, Lock, Minus, Plus, Receipt, Users, Wallet,
} from 'lucide-react'
import { CabecalhoPagina, Indicador } from '@/components/common'
import { Botao, Carta, CartaTitulo, Etiqueta } from '@/components/ui'
import { EstadoErro, EstadoVazio, EsqueletoCarta, EsqueletoLista } from '@/components/feedback'
import {
  useCaixaAberto, useMovimentosDoCaixa, useResumoDoCaixa,
} from '@/hooks'
import { FORMA_PAGAMENTO } from '@/constants'
import { dinheiro } from '@/utils/formato'
import { dataLonga, hora } from '@/utils/datas'
import { cn } from '@/utils/cn'
import { AbrirCaixa } from './componentes/AbrirCaixa'
import { FormularioMovimentoCaixa } from './componentes/FormularioMovimentoCaixa'
import { FecharCaixa } from './componentes/FecharCaixa'
import { CaixaFechado, PorFormaDePagamento } from './componentes/ResumoDoCaixa'

/**
 * Caixa diário.
 *
 * Fluxo: abrir → movimentar → fechar. A tela troca de forma conforme o
 * estado, em vez de mostrar tudo desativado — menos ruído para quem usa.
 */
export default function Caixa() {
  const { dados: caixa, carregando, erro, recarregar } = useCaixaAberto()
  const { dados: movimentos, carregando: carregandoMovimentos } = useMovimentosDoCaixa(caixa?.id)
  const { dados: resumo } = useResumoDoCaixa(caixa?.id)

  const [movimentando, setMovimentando] = useState<'entrada' | 'saida' | null>(null)
  const [fechando, setFechando] = useState(false)

  if (carregando) {
    return (
      <>
        <CabecalhoPagina sobretitulo="Caixa" titulo="Caixa diário" />
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <EsqueletoCarta key={i} />)}
        </div>
      </>
    )
  }

  /*
    Leitura falhou ≠ caixa fechado.

    Sem esta distinção, a falha de leitura caía no `!caixa` e a tela
    oferecia ABRIR o caixa — sobre um estado que o sistema não conhecia.
    Se já houvesse um aberto, a tentativa levava a mais um erro; a
    proprietária via duas mensagens contraditórias em sequência e
    nenhuma explicava nada.
  */
  if (erro) {
    return (
      <>
        <CabecalhoPagina sobretitulo="Caixa" titulo="Caixa diário" />
        <EstadoErro
          titulo="Não foi possível carregar o caixa"
          descricao={erro}
          aoTentarNovamente={recarregar}
        />
      </>
    )
  }

  if (!caixa) {
    return (
      <>
        <CabecalhoPagina
          sobretitulo="Caixa"
          titulo="Caixa diário"
          descricao="Abra o caixa para registrar as entradas e saídas do dia."
        />
        <AbrirCaixa aoAbrir={recarregar} />
      </>
    )
  }

  if (caixa.situacao === 'fechado') {
    return (
      <>
        <CabecalhoPagina sobretitulo="Caixa" titulo="Caixa diário" />
        <div className="mx-auto max-w-md">
          <CaixaFechado caixa={caixa} />
        </div>
      </>
    )
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo={dataLonga(new Date())}
        titulo="Caixa aberto"
        descricao={`Aberto às ${hora(caixa.abertoEm)} com ${dinheiro(caixa.valorAbertura)} de troco.`}
        acoes={
          <>
            <Botao variante="secundario" tamanho="sm" onClick={() => setMovimentando('saida')}>
              <Minus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Saída</span>
            </Botao>
            <Botao variante="ouro" tamanho="sm" onClick={() => setMovimentando('entrada')}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Entrada</span>
            </Botao>
          </>
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <Indicador
          rotulo="Entradas" valor={dinheiro(resumo?.entradas ?? 0)}
          icone={ArrowUpRight} detalhe="Recebido hoje" atraso={0}
        />
        <Indicador
          rotulo="Saídas" valor={dinheiro(resumo?.saidas ?? 0)}
          icone={ArrowDownLeft} detalhe="Pago hoje" atraso={1}
        />
        <Indicador
          rotulo="Na gaveta" valor={dinheiro(resumo?.saldoEsperado ?? 0)}
          icone={Wallet} detalhe="Só dinheiro, com o troco" destaque atraso={2}
        />
        <Indicador
          rotulo="Ticket médio" valor={dinheiro(resumo?.ticketMedio ?? 0)}
          icone={Users} detalhe={`${resumo?.atendimentos ?? 0} atendimento(s)`} atraso={3}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Carta espacamento={false} className="overflow-hidden">
          <div className="p-4 pb-1 sm:p-5 sm:pb-1">
            <CartaTitulo
              titulo="Movimentações"
              descricao="Tudo que entrou e saiu desde a abertura"
            />
          </div>

          {carregandoMovimentos ? (
            <div className="p-4 sm:p-5"><EsqueletoLista linhas={4} /></div>
          ) : !movimentos?.length ? (
            <EstadoVazio
              icone={Receipt}
              titulo="Nenhuma movimentação ainda"
              descricao="Atendimentos concluídos entram aqui sozinhos. Vendas e despesas você registra à mão."
              compacto
            />
          ) : (
            <ul className="divide-y divide-onix-50">
              {movimentos.map((movimento, indice) => {
                const entrada = movimento.tipo === 'entrada'

                return (
                  <li
                    key={movimento.id}
                    className="entra-lista-lateral flex items-center gap-3 px-4 py-3 transition-colors hover:bg-quartzo-50 sm:px-5"
                    style={{ animationDelay: `${Math.min(indice * 0.025, 0.3)}s` }}
                  >
                    <span
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                        entrada ? 'bg-[#E8F0EA] text-sucesso' : 'bg-[#F7E9EA] text-perigo',
                      )}
                    >
                      {entrada ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-onix-800">
                        {movimento.descricao}
                      </p>
                      <p className="tabular truncate text-[12.5px] text-onix-400">
                        {hora(movimento.criadoEm)} · {FORMA_PAGAMENTO[movimento.forma]}
                      </p>
                    </div>

                    <p
                      className={cn(
                        'tabular shrink-0 text-[14px] font-medium',
                        entrada ? 'text-sucesso' : 'text-onix-700',
                      )}
                    >
                      {entrada ? '+' : '−'} {dinheiro(movimento.valor)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Carta>

        <div className="space-y-4">
          {resumo && <PorFormaDePagamento resumo={resumo} />}

          <Carta>
            <CartaTitulo titulo="Encerrar o dia" descricao="Confira o dinheiro e feche o caixa" />
            <Etiqueta className="mb-4 border-ouro-200 bg-ouro-100 text-ouro-700" ponto="bg-ouro-500">
              Caixa aberto desde {hora(caixa.abertoEm)}
            </Etiqueta>
            <Botao variante="principal" bloco onClick={() => setFechando(true)}>
              <Lock className="h-4 w-4" /> Fechar caixa
            </Botao>
          </Carta>
        </div>
      </div>

      <FormularioMovimentoCaixa
        aberto={!!movimentando}
        aoFechar={() => setMovimentando(null)}
        tipoInicial={movimentando ?? 'entrada'}
      />
      <FecharCaixa
        aberto={fechando}
        aoFechar={() => { setFechando(false); recarregar() }}
        caixaId={caixa.id}
        resumo={resumo}
      />
    </>
  )
}
