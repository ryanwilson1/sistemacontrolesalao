import { useMemo, useState } from 'react'
import { Clock, Eye, EyeOff, Pencil, Plus, Scissors } from 'lucide-react'
import { CabecalhoPagina } from '@/components/common'
import { Botao, Carta, Etiqueta } from '@/components/ui'
import { EstadoVazio, EsqueletoGrade } from '@/components/feedback'
import { useCategorias, useServicos } from '@/hooks'
import { dinheiro, duracao } from '@/utils/formato'
import { FormularioServico } from './FormularioServico'
import type { Servico } from '@/types'

export default function Servicos() {
  const { dados: servicos, carregando } = useServicos(false)
  const { dados: categorias } = useCategorias()
  const [editando, setEditando] = useState<Servico | null>(null)
  const [criando, setCriando] = useState(false)

  /** Agrupa por categoria mantendo a ordem cadastrada. */
  const agrupados = useMemo(() => {
    const mapa = new Map<string, Servico[]>()

    for (const servico of servicos ?? []) {
      const nome = categorias?.find((c) => c.id === servico.categoriaId)?.nome ?? 'Sem categoria'
      mapa.set(nome, [...(mapa.get(nome) ?? []), servico])
    }

    return [...mapa.entries()]
  }, [servicos, categorias])

  const fechar = () => {
    setCriando(false)
    setEditando(null)
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Catálogo"
        titulo="Serviços"
        descricao="A duração aqui define os horários livres da agenda."
        acoes={
          <Botao variante="ouro" tamanho="sm" onClick={() => setCriando(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo serviço</span>
            <span className="sm:hidden">Novo</span>
          </Botao>
        }
      />

      {carregando ? (
        <EsqueletoGrade />
      ) : !servicos?.length ? (
        <Carta>
          <EstadoVazio
            icone={Scissors}
            titulo="Nenhum serviço cadastrado"
            descricao="Cadastre os serviços com a duração real de cada um. É isso que monta a agenda."
            acao={
              <Botao variante="ouro" onClick={() => setCriando(true)}>
                <Plus className="h-4 w-4" /> Cadastrar serviço
              </Botao>
            }
          />
        </Carta>
      ) : (
        <div className="space-y-6">
          {agrupados.map(([categoria, lista]) => (
            <section key={categoria}>
              <h2 className="eyebrow mb-2.5">{categoria}</h2>

              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {lista.map((servico, indice) => (
                  <li
                    key={servico.id}
                className="entra-lista"
                style={{ animationDelay: `${Math.min(indice * 0.03, 0.3)}s` }}
              >
                    <button
                      onClick={() => setEditando(servico)}
                      style={{ borderLeftColor: servico.cor, borderLeftWidth: 3 }}
                      className="group w-full rounded-2xl border border-onix-100 bg-white p-4 text-left shadow-carta transition-colors hover:border-onix-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-[14.5px] font-medium text-onix-800">
                            {servico.nome}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-onix-400">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {duracao(servico.duracaoMinutos)}
                            </span>
                            {servico.intervaloMinutos > 0 && (
                              <span>+{servico.intervaloMinutos}min de intervalo</span>
                            )}
                          </span>
                        </span>
                        <Pencil className="h-3.5 w-3.5 shrink-0 text-onix-200 transition-colors group-hover:text-onix-500" />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="tabular font-display text-[17px] font-light text-onix-900">
                          {dinheiro(servico.preco)}
                        </span>
                        <span className="flex gap-1.5">
                          {!servico.ativo && <Etiqueta>Inativo</Etiqueta>}
                          <Etiqueta
                            className={
                              servico.noLinkPublico
                                ? 'border-ouro-200 bg-ouro-100 text-ouro-700'
                                : 'border-onix-200 bg-onix-50 text-onix-400'
                            }
                          >
                            {servico.noLinkPublico ? (
                              <><Eye className="h-3 w-3" /> No link</>
                            ) : (
                              <><EyeOff className="h-3 w-3" /> Interno</>
                            )}
                          </Etiqueta>
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <FormularioServico aberto={criando || !!editando} aoFechar={fechar} servico={editando} />
    </>
  )
}
