import { useMemo, useState } from 'react'
import { Pencil, Percent, Plus, Tag, Trash2 } from 'lucide-react'
import { CabecalhoPagina, Indicador } from '@/components/common'
import { Abas, Botao, Carta, Etiqueta } from '@/components/ui'
import { Confirmar, EstadoVazio, EsqueletoGrade } from '@/components/feedback'
import { useAviso } from '@/contexts'
import { useCupons, useRemoverCupom } from '@/hooks'
import { dinheiro } from '@/utils/formato'
import { dataNumerica, isoData } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import { FormularioCupom } from './FormularioCupom'
import type { Cupom } from '@/types'

type Filtro = 'ativos' | 'expirados' | 'todos'

/** Situação legível de um cupom, derivada das datas e do limite. */
function situacaoDoCupom(cupom: Cupom) {
  const hoje = isoData(new Date())

  if (!cupom.ativo) return { rotulo: 'Desativado', classe: 'border-onix-200 bg-onix-50 text-onix-400' }
  if (hoje > cupom.validoAte) return { rotulo: 'Expirado', classe: 'border-onix-200 bg-onix-50 text-onix-400' }
  if (hoje < cupom.validoDe) return { rotulo: 'Agendado', classe: 'border-quartzo-200 bg-quartzo-100 text-quartzo-700' }
  if (cupom.limiteUsos > 0 && cupom.usos >= cupom.limiteUsos) {
    return { rotulo: 'Esgotado', classe: 'border-[#EBD2D4] bg-[#F7E9EA] text-perigo' }
  }
  return { rotulo: 'Valendo', classe: 'border-[#CFE0D5] bg-[#E8F0EA] text-[#3D6250]' }
}

export default function Cupons() {
  const { dados: cupons, carregando } = useCupons()
  const remover = useRemoverCupom()
  const aviso = useAviso()

  const [filtro, setFiltro] = useState<Filtro>('ativos')
  const [editando, setEditando] = useState<Cupom | null>(null)
  const [criando, setCriando] = useState(false)
  const [removendo, setRemovendo] = useState<Cupom | null>(null)

  const { valendo, expirados } = useMemo(() => {
    const lista = cupons ?? []
    return {
      valendo: lista.filter((c) => situacaoDoCupom(c).rotulo === 'Valendo'),
      expirados: lista.filter((c) => ['Expirado', 'Esgotado'].includes(situacaoDoCupom(c).rotulo)),
    }
  }, [cupons])

  const visiveis = useMemo(() => {
    if (filtro === 'ativos') return valendo
    if (filtro === 'expirados') return expirados
    return cupons ?? []
  }, [filtro, cupons, valendo, expirados])

  const totalDescontado = useMemo(
    () => (cupons ?? []).reduce((soma, c) => soma + c.usos, 0),
    [cupons],
  )

  const confirmarRemocao = async () => {
    if (!removendo) return
    try {
      await remover.executar(removendo.id)
      aviso.sucesso('Cupom removido', removendo.codigo)
      setRemovendo(null)
    } catch (falha) {
      aviso.erro('Não foi possível remover', mensagemDeErro(falha))
    }
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Comercial"
        titulo="Cupons de desconto"
        descricao="Para campanhas de retorno, indicação e datas especiais."
        acoes={
          <Botao variante="ouro" tamanho="sm" onClick={() => setCriando(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo cupom</span>
            <span className="sm:hidden">Novo</span>
          </Botao>
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-3">
        <Indicador rotulo="Valendo agora" valor={String(valendo.length)} icone={Tag} atraso={0} />
        <Indicador rotulo="Usos totais" valor={String(totalDescontado)} icone={Percent}
          detalhe="Desde o início" atraso={1} />
        <Indicador rotulo="Cadastrados" valor={String(cupons?.length ?? 0)}
          className="col-span-2 xl:col-span-1" atraso={2} />
      </section>

      <div className="mb-4">
        <Abas
          idAnimacao="cupons"
          abas={[
            { valor: 'ativos', rotulo: 'Valendo', contador: valendo.length },
            { valor: 'expirados', rotulo: 'Encerrados', contador: expirados.length },
            { valor: 'todos', rotulo: 'Todos', contador: cupons?.length },
          ]}
          ativa={filtro}
          aoTrocar={setFiltro}
        />
      </div>

      {carregando ? (
        <EsqueletoGrade />
      ) : visiveis.length === 0 ? (
        <Carta>
          <EstadoVazio
            icone={Tag}
            titulo={filtro === 'todos' ? 'Nenhum cupom criado' : 'Nada por aqui'}
            descricao="Crie um cupom para trazer clientes de volta ou premiar indicações."
            acao={
              <Botao variante="ouro" onClick={() => setCriando(true)}>
                <Plus className="h-4 w-4" /> Criar cupom
              </Botao>
            }
          />
        </Carta>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((cupom, indice) => {
            const situacao = situacaoDoCupom(cupom)
            const restantes = cupom.limiteUsos > 0 ? cupom.limiteUsos - cupom.usos : null

            return (
              <li
                key={cupom.id}
                className="entra-lista min-w-0 rounded-2xl border border-onix-100 bg-white p-4 shadow-carta"
                style={{ animationDelay: `${Math.min(indice * 0.03, 0.3)}s` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tabular truncate font-display text-[17px] font-medium tracking-[0.08em] text-onix-900">
                      {cupom.codigo}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-onix-400">{cupom.descricao}</p>
                  </div>
                  <Etiqueta className={situacao.classe}>{situacao.rotulo}</Etiqueta>
                </div>

                <p className="mt-3 font-display text-[21px] font-light text-marca">
                  {cupom.tipo === 'percentual' ? `${cupom.valor}%` : dinheiro(cupom.valor)}
                  <span className="ml-1.5 text-[12.5px] text-onix-400">de desconto</span>
                </p>

                <dl className="mt-3 space-y-1 border-t border-onix-50 pt-3 text-[12.5px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-onix-400">Validade</dt>
                    <dd className="tabular truncate text-onix-600">
                      {dataNumerica(cupom.validoDe)} — {dataNumerica(cupom.validoAte)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-onix-400">Usos</dt>
                    <dd className="tabular text-onix-600">
                      {cupom.usos}
                      {restantes !== null && (
                        <span className={cn('ml-1', restantes <= 0 && 'text-perigo')}>
                          de {cupom.limiteUsos}
                        </span>
                      )}
                    </dd>
                  </div>
                  {cupom.valorMinimo > 0 && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-onix-400">Mínimo</dt>
                      <dd className="tabular text-onix-600">{dinheiro(cupom.valorMinimo)}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-3 flex gap-2">
                  <Botao
                    variante="secundario" tamanho="sm" className="flex-1"
                    onClick={() => setEditando(cupom)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Botao>
                  <Botao variante="perigo" tamanho="sm" onClick={() => setRemovendo(cupom)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Botao>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <FormularioCupom
        aberto={criando || !!editando}
        aoFechar={() => { setCriando(false); setEditando(null) }}
        cupom={editando}
      />

      <Confirmar
        aberto={!!removendo}
        aoFechar={() => setRemovendo(null)}
        aoConfirmar={() => void confirmarRemocao()}
        titulo={`Remover o cupom ${removendo?.codigo ?? ''}?`}
        descricao="Os usos já registrados permanecem no histórico. O cupom deixa de poder ser aplicado."
        rotuloConfirmar="Remover cupom"
        destrutivo
        carregando={remover.salvando}
      />
    </>
  )
}
