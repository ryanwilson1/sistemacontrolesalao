import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowDownUp, Boxes, Pencil, Plus, Search } from 'lucide-react'
import { CabecalhoPagina, Indicador } from '@/components/common'
import { Abas, Botao, Carta, Entrada, Etiqueta } from '@/components/ui'
import { EstadoErro, EstadoVazio, EsqueletoGrade } from '@/components/feedback'
import { useDebounce, useProdutos } from '@/hooks'
import { dinheiro } from '@/utils/formato'
import { dataNumerica } from '@/utils/datas'
import { cn } from '@/utils/cn'
import { FormularioProduto } from './FormularioProduto'
import { FormularioMovimento } from './FormularioMovimento'
import type { Produto } from '@/types'

type Filtro = 'todos' | 'baixo' | 'vencendo'

export default function Estoque() {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [editando, setEditando] = useState<Produto | null>(null)
  const [criando, setCriando] = useState(false)
  const [movimentando, setMovimentando] = useState<Produto | null>(null)

  const termo = useDebounce(busca)
  const { dados: produtos, carregando, erro, recarregar } = useProdutos(termo)

  const { baixo, vencendo, valorTotal } = useMemo(() => {
    const lista = produtos ?? []
    const limite = new Date()
    limite.setDate(limite.getDate() + 30)

    return {
      baixo: lista.filter((p) => p.quantidade <= p.quantidadeMinima),
      vencendo: lista.filter((p) => p.validade && new Date(p.validade) <= limite),
      valorTotal: lista.reduce((soma, p) => soma + p.quantidade * p.precoCusto, 0),
    }
  }, [produtos])

  const visiveis = useMemo(() => {
    if (filtro === 'baixo') return baixo
    if (filtro === 'vencendo') return vencendo
    return produtos ?? []
  }, [filtro, produtos, baixo, vencendo])

  const fecharProduto = () => {
    setCriando(false)
    setEditando(null)
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Estoque"
        titulo="Produtos"
        descricao="O saldo muda por movimentação, para o estoque ter história."
        acoes={
          <Botao variante="ouro" tamanho="sm" onClick={() => setCriando(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo produto</span>
            <span className="sm:hidden">Novo</span>
          </Botao>
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-3">
        <Indicador rotulo="Produtos" valor={String(produtos?.length ?? 0)} icone={Boxes} atraso={0} />
        <Indicador
          rotulo="Repor"
          valor={String(baixo.length)}
          icone={AlertTriangle}
          detalhe={baixo.length ? 'Abaixo do mínimo' : 'Tudo em ordem'}
          destaque={baixo.length > 0}
          atraso={1}
        />
        <Indicador
          rotulo="Valor em estoque"
          valor={dinheiro(valorTotal)}
          detalhe="Pelo preço de custo"
          className="col-span-2 xl:col-span-1"
          atraso={2}
        />
      </section>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md flex-1">
          <Entrada
            type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto" prefixo={<Search className="h-4 w-4" />}
          />
        </div>

        <Abas
          idAnimacao="estoque"
          abas={[
            { valor: 'todos', rotulo: 'Todos', contador: produtos?.length },
            { valor: 'baixo', rotulo: 'Repor', contador: baixo.length },
            { valor: 'vencendo', rotulo: 'Vencendo', contador: vencendo.length },
          ]}
          ativa={filtro}
          aoTrocar={setFiltro}
        />
      </div>

      {erro ? (
        <EstadoErro descricao={erro} aoTentarNovamente={recarregar} />
      ) : carregando ? (
        <EsqueletoGrade />
      ) : visiveis.length === 0 ? (
        <Carta>
          <EstadoVazio
            icone={filtro === 'todos' ? Boxes : AlertTriangle}
            titulo={
              filtro === 'baixo' ? 'Nada para repor'
                : filtro === 'vencendo' ? 'Nada vencendo'
                : termo ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'
            }
            descricao={
              filtro === 'todos'
                ? 'Cadastre os produtos que você usa para acompanhar o consumo.'
                : 'Boa notícia: está tudo dentro do esperado.'
            }
            acao={
              filtro === 'todos' && !termo && (
                <Botao variante="ouro" onClick={() => setCriando(true)}>
                  <Plus className="h-4 w-4" /> Cadastrar produto
                </Botao>
              )
            }
          />
        </Carta>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((produto, indice) => {
            const abaixo = produto.quantidade <= produto.quantidadeMinima
            const proporcao = produto.quantidadeMinima
              ? Math.min(produto.quantidade / (produto.quantidadeMinima * 2), 1)
              : 1

            return (
              <motion.li
                key={produto.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(indice * 0.03, 0.3), duration: 0.25 }}
                className="min-w-0 rounded-2xl border border-onix-100 bg-white p-4 shadow-carta"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-medium text-onix-800">{produto.nome}</p>
                    <p className="truncate text-[12.5px] text-onix-400">
                      {[produto.marca, produto.categoria].filter(Boolean).join(' · ') || 'Sem marca'}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditando(produto)}
                    className="-m-1 shrink-0 rounded-lg p-1 text-onix-200 transition-colors hover:text-onix-600"
                    aria-label={`Editar ${produto.nome}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      'tabular font-display text-[22px] font-light leading-none',
                      abaixo ? 'text-perigo' : 'text-onix-900',
                    )}
                  >
                    {produto.quantidade}
                  </span>
                  <span className="text-[13px] text-onix-400">{produto.unidade}</span>
                  <span className="ml-auto text-[12px] text-onix-300">
                    mín. {produto.quantidadeMinima}
                  </span>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-onix-100">
                  <motion.div
                    className={cn('h-full rounded-full', abaixo ? 'bg-perigo' : 'bg-sucesso')}
                    initial={{ width: 0 }}
                    animate={{ width: `${proporcao * 100}%` }}
                    transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {abaixo && (
                    <Etiqueta className="border-[#EBD2D4] bg-[#F7E9EA] text-perigo">Repor</Etiqueta>
                  )}
                  {produto.validade && (
                    <Etiqueta>Val. {dataNumerica(produto.validade)}</Etiqueta>
                  )}
                  <Botao
                    variante="secundario" tamanho="sm" className="ml-auto"
                    onClick={() => setMovimentando(produto)}
                  >
                    <ArrowDownUp className="h-3.5 w-3.5" /> Movimentar
                  </Botao>
                </div>
              </motion.li>
            )
          })}
        </ul>
      )}

      <FormularioProduto aberto={criando || !!editando} aoFechar={fecharProduto} produto={editando} />
      <FormularioMovimento
        aberto={!!movimentando}
        aoFechar={() => setMovimentando(null)}
        produto={movimentando}
      />
    </>
  )
}
