import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, MessageCircle, Plus, Search, Users } from 'lucide-react'
import { CabecalhoPagina } from '@/components/common'
import { Botao, Carta, Entrada, Retrato } from '@/components/ui'
import { EstadoErro, EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { useClientes, useDebounce } from '@/hooks'
import { PAGINACAO, ROTAS } from '@/constants'
import { linkWhatsApp, telefone } from '@/utils/formato'
import { dataCurta } from '@/utils/datas'
import { FormularioCliente } from './FormularioCliente'

export default function Clientes() {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [criando, setCriando] = useState(false)

  const termo = useDebounce(busca)

  // Trocar o termo volta para a primeira página — senão a lista some.
  useEffect(() => setPagina(0), [termo])

  const { dados, carregando, erro, recarregar } = useClientes(termo, pagina)
  const totalPaginas = Math.ceil((dados?.total ?? 0) / PAGINACAO.clientesPorPagina)

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Clientes"
        titulo={dados?.total ? `${dados.total} cadastradas` : 'Clientes'}
        descricao="Histórico, preferências e evolução de cada uma."
        acoes={
          <Botao variante="ouro" tamanho="sm" onClick={() => setCriando(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova cliente</span>
            <span className="sm:hidden">Nova</span>
          </Botao>
        }
      />

      <div className="mb-4 max-w-md">
        <Entrada
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          prefixo={<Search className="h-4 w-4" />}
        />
      </div>

      {erro ? (
        <EstadoErro descricao={erro} aoTentarNovamente={recarregar} />
      ) : carregando ? (
        <EsqueletoLista linhas={6} />
      ) : !dados?.itens.length ? (
        <Carta>
          <EstadoVazio
            icone={termo ? Search : Users}
            titulo={termo ? 'Nenhuma cliente encontrada' : 'Nenhuma cliente ainda'}
            descricao={
              termo
                ? 'Confira a escrita ou tente pelo telefone.'
                : 'Cadastre a primeira cliente para começar a montar o histórico.'
            }
            acao={
              !termo && (
                <Botao variante="ouro" onClick={() => setCriando(true)}>
                  <Plus className="h-4 w-4" /> Cadastrar cliente
                </Botao>
              )
            }
          />
        </Carta>
      ) : (
        <>
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {dados.itens.map((cliente, indice) => (
              <motion.li
                key={cliente.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(indice * 0.02, 0.3), duration: 0.25 }}
              >
                <div className="group flex items-center gap-3.5 rounded-2xl border border-onix-100 bg-white p-3.5 shadow-carta transition-colors hover:border-onix-200">
                  <Retrato nome={cliente.nome} />

                  <Link to={ROTAS.cliente(cliente.id)} className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-onix-800 group-hover:underline">
                      {cliente.nome}
                    </p>
                    <p className="truncate text-[12.5px] text-onix-400">
                      {cliente.telefone ? telefone(cliente.telefone) : 'Sem telefone'}
                      {cliente.nascimento && ` · ${dataCurta(cliente.nascimento)}`}
                    </p>
                  </Link>

                  {cliente.whatsapp && (
                    <a
                      href={linkWhatsApp(cliente.whatsapp)}
                      target="_blank" rel="noopener noreferrer"
                      className="shrink-0 rounded-lg p-2 text-onix-300 transition-colors hover:bg-quartzo-50 hover:text-sucesso"
                      aria-label={`Conversar com ${cliente.nome} no WhatsApp`}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>

          {totalPaginas > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Botao
                variante="secundario" tamanho="sm"
                disabled={pagina === 0}
                onClick={() => setPagina((atual) => atual - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </Botao>
              <span className="tabular text-[13px] text-onix-400">
                {pagina + 1} de {totalPaginas}
              </span>
              <Botao
                variante="secundario" tamanho="sm"
                disabled={pagina >= totalPaginas - 1}
                onClick={() => setPagina((atual) => atual + 1)}
              >
                Próxima <ChevronRight className="h-3.5 w-3.5" />
              </Botao>
            </div>
          )}
        </>
      )}

      <FormularioCliente aberto={criando} aoFechar={() => setCriando(false)} />
    </>
  )
}
