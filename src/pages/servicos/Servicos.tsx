import { useMemo, useState } from 'react'
import {
  Check, Clock, Copy, ExternalLink, Eye, EyeOff, Link2, Pencil, Plus, Scissors, X,
} from 'lucide-react'
import { CabecalhoPagina, CompartilharLink } from '@/components/common'
import { Botao, Carta, Etiqueta, Modal } from '@/components/ui'
import { EstadoVazio, EsqueletoGrade } from '@/components/feedback'
import { useSessao } from '@/contexts'
import { useCategorias, useCopiar, useServicos } from '@/hooks'
import { dinheiro, duracao } from '@/utils/formato'
import { FormularioServico } from './FormularioServico'
import type { Servico } from '@/types'

export default function Servicos() {
  const { dados: servicos, carregando } = useServicos(false)
  const { dados: categorias } = useCategorias()
  const [editando, setEditando] = useState<Servico | null>(null)
  const [criando, setCriando] = useState(false)

  /*
    O studio vem da sessão, não de uma consulta nova.

    Ele já está carregado desde o login — é o mesmo objeto que o
    cabeçalho e o tema usam. Chamar `useStudio()` aqui acrescentaria
    uma ida ao banco a cada abertura desta tela para reler algo que já
    está na memória.
  */
  const { studio } = useSessao()
  const { copiado, copiar } = useCopiar()

  const endereco = studio ? `${window.location.origin}/agendar/${studio.identificador}` : ''

  const [compartilhando, setCompartilhando] = useState(false)
  /** Nome do último procedimento publicado. Null = nada a anunciar. */
  const [publicado, setPublicado] = useState<string | null>(null)

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
        titulo="Procedimentos e serviços"
        descricao="A duração aqui define os horários livres da agenda."
        acoes={
          <>
            <Botao
              variante="secundario"
              tamanho="sm"
              onClick={() => setCompartilhando(true)}
              disabled={!studio}
              aria-label="Ver e compartilhar o link público"
            >
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Link público</span>
            </Botao>

            <Botao variante="ouro" tamanho="sm" onClick={() => setCriando(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo procedimento</span>
              <span className="sm:hidden">Novo</span>
            </Botao>
          </>
        }
      />

      {/*
        A confirmação de que o procedimento saiu daqui e chegou ao link.

        Fica na tela em vez de virar aviso passageiro porque o que ela
        oferece — copiar o link, conferir como cliente — é uma ação, e
        ação nenhuma cabe em três segundos de toast.
      */}
      {publicado && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#CFE0D5] bg-[#E8F0EA] p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-sucesso">
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-[#3D6250]">
                Procedimento publicado no link público
              </p>
              <p className="mt-0.5 truncate text-[12.5px] text-[#3D6250]/75">
                {publicado} já aparece para as clientes.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Botao
              variante="secundario"
              tamanho="sm"
              onClick={() => void copiar(endereco)}
              disabled={!endereco}
            >
              {copiado ? (
                <><Check className="h-3.5 w-3.5 text-sucesso" /> Copiado</>
              ) : (
                <><Copy className="h-3.5 w-3.5" /> Copiar link</>
              )}
            </Botao>

            {endereco && (
              <a href={endereco} target="_blank" rel="noopener noreferrer">
                <Botao variante="secundario" tamanho="sm">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir como cliente
                </Botao>
              </a>
            )}

            <Botao
              variante="fantasma"
              tamanho="sm"
              onClick={() => setPublicado(null)}
              aria-label="Fechar confirmação"
            >
              <X className="h-3.5 w-3.5" />
            </Botao>
          </div>
        </div>
      )}

      {carregando ? (
        <EsqueletoGrade />
      ) : !servicos?.length ? (
        <Carta>
          <EstadoVazio
            icone={Scissors}
            titulo="Nenhum procedimento cadastrado"
            descricao="Cadastre cada procedimento com a duração real. É isso que monta a agenda e o que a cliente vê no link."
            acao={
              <Botao variante="ouro" onClick={() => setCriando(true)}>
                <Plus className="h-4 w-4" /> Cadastrar procedimento
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

      <FormularioServico
        aberto={criando || !!editando}
        aoFechar={fechar}
        servico={editando}
        aoPublicar={setPublicado}
      />

      {/*
        O mesmo componente de Ajustes → Link público, e o mesmo endereço.
        Não há segundo link nem segunda forma de gerá-lo: o que muda é
        só o lugar de onde a Sama alcança o que já existe.
      */}
      <Modal
        aberto={compartilhando}
        aoFechar={() => setCompartilhando(false)}
        titulo="Link público de agendamento"
        descricao="Aparecem aqui apenas os procedimentos ativos e marcados como disponíveis no link."
        largura="sm"
      >
        {studio && (
          <div className="pb-1">
            <CompartilharLink
              endereco={endereco}
              nomeDoSalao={studio.nomeFantasia?.trim() || studio.nome}
            />
          </div>
        )}
      </Modal>
    </>
  )
}
