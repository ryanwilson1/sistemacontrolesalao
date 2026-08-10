import { useEffect, useState } from 'react'
import { formatarMoedaBR, moedaOuZero } from '@/utils/moeda'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Gem, Save } from 'lucide-react'
import { CabecalhoPagina } from '@/components/common'
import { CampoMoeda, Botao, Campo, Carta, CartaTitulo, Entrada, Interruptor, Retrato } from '@/components/ui'
import { EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { useAviso } from '@/contexts'
import {
  useConfiguracaoFidelidade, useRankingFidelidade, useSalvarFidelidade,
} from '@/hooks'
import { ROTAS } from '@/constants'
import { dinheiro } from '@/utils/formato'
import { mensagemDeErro } from '@/utils/erros'
import type { ConfiguracaoFidelidade } from '@/types'

const PADRAO: ConfiguracaoFidelidade = {
  ativo: false,
  pontosPorReal: 1,
  valorDoPonto: 0.05,
  validadeDias: 365,
}

export default function Fidelidade() {
  const { dados: configuracao, carregando } = useConfiguracaoFidelidade()
  const { dados: ranking, carregando: carregandoRanking } = useRankingFidelidade()
  const salvar = useSalvarFidelidade()
  const aviso = useAviso()

  const [rascunho, setRascunho] = useState<ConfiguracaoFidelidade>(PADRAO)

  /*
    O texto do campo anda junto com o número do rascunho.

    O estado guarda número — é o que o banco recebe. Mas o campo
    precisa guardar texto, senão "0," some no meio da digitação: o
    número não sabe representar uma vírgula ainda sem centavos.
  */
  const [valorDoPontoTexto, setValorDoPontoTexto] = useState('')

  useEffect(() => {
    setValorDoPontoTexto(formatarMoedaBR(rascunho.valorDoPonto))
    // Só quando o rascunho vem do banco; a digitação manda no resto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuracao])

  useEffect(() => {
    if (configuracao) setRascunho(configuracao)
  }, [configuracao])

  const alterar = <C extends keyof ConfiguracaoFidelidade>(
    campo: C,
    valor: ConfiguracaoFidelidade[C],
  ) => setRascunho((atual) => ({ ...atual, [campo]: valor }))

  const enviar = async () => {
    try {
      await salvar.executar(rascunho)
      aviso.sucesso('Programa atualizado')
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Fidelização"
        titulo="Programa de pontos"
        descricao="Cada atendimento concluído credita pontos automaticamente."
        acoes={
          <Botao variante="ouro" tamanho="sm" onClick={() => void enviar()} carregando={salvar.salvando}>
            <Save className="h-3.5 w-3.5" /> Salvar
          </Botao>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Carta>
          <CartaTitulo titulo="Como funciona" descricao="Defina o valor de cada ponto" />

          {carregando ? (
            <div className="space-y-4">
              <div className="h-11 animate-pulse rounded-xl bg-quartzo-100" />
              <div className="h-11 animate-pulse rounded-xl bg-quartzo-100" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
                <Interruptor
                  ligado={rascunho.ativo}
                  aoMudar={(valor) => alterar('ativo', valor)}
                  rotulo="Programa ativo"
                  descricao="Com o programa desligado, nenhum ponto novo é creditado."
                />
              </div>

              <Campo rotulo="Pontos por real gasto" dica="Ex.: 1 ponto a cada R$ 1,00">
                <Entrada
                  type="number" min="0" step="0.1" inputMode="decimal"
                  value={rascunho.pontosPorReal}
                  onChange={(e) => alterar('pontosPorReal', Number(e.target.value))}
                  disabled={!rascunho.ativo}
                />
              </Campo>

              <Campo
                rotulo="Valor de cada ponto"
                dica={
                  rascunho.valorDoPonto > 0
                    ? `100 pontos valem ${dinheiro(100 * rascunho.valorDoPonto)}`
                    : undefined
                }
              >
                {/*
                    Campo de texto, não numérico.

                    "R$ 0,05 por ponto" é dinheiro, e `type="number"`
                    recusa a vírgula — a proprietária digitava `0,05` e
                    o campo não aceitava.
                  */}
                  <CampoMoeda
                    value={valorDoPontoTexto}
                    onChange={(texto) => {
                      setValorDoPontoTexto(texto)
                      alterar('valorDoPonto', moedaOuZero(texto))
                    }}
                    disabled={!rascunho.ativo}
                  />
              </Campo>

              <Campo rotulo="Validade dos pontos" dica="Em dias. Deixe vazio para não expirar.">
                <Entrada
                  type="number" min="0" step="30" inputMode="numeric"
                  value={rascunho.validadeDias ?? ''}
                  onChange={(e) =>
                    alterar('validadeDias', e.target.value ? Number(e.target.value) : null)
                  }
                  disabled={!rascunho.ativo}
                />
              </Campo>
            </div>
          )}
        </Carta>

        <Carta espacamento={false} className="overflow-hidden">
          <div className="p-4 pb-1 sm:p-5 sm:pb-1">
            <CartaTitulo titulo="Clientes com mais pontos" descricao="As mais fiéis do studio" />
          </div>

          {carregandoRanking ? (
            <div className="p-4 sm:p-5">
              <EsqueletoLista linhas={4} />
            </div>
          ) : !ranking?.length ? (
            <EstadoVazio
              icone={Gem}
              titulo="Nenhum ponto creditado ainda"
              descricao="Assim que os atendimentos forem concluídos, o ranking se monta sozinho."
              compacto
            />
          ) : (
            <ol className="divide-y divide-onix-50">
              {ranking.map((linha, indice) => (
                <motion.li
                  key={linha.clienteId}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(indice * 0.03, 0.3), duration: 0.22 }}
                >
                  <Link
                    to={ROTAS.cliente(linha.clienteId)}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-quartzo-50 sm:px-5"
                  >
                    <span className="tabular w-5 shrink-0 text-center font-display text-[13px] text-onix-300">
                      {indice + 1}
                    </span>
                    <Retrato nome={linha.nome} tamanho="sm" />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-onix-800">
                        {linha.nome}
                      </span>
                      <span className="block truncate text-[12.5px] text-onix-400">
                        {linha.visitas} visita{linha.visitas === 1 ? '' : 's'} ·{' '}
                        {dinheiro(linha.totalGasto)}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="tabular block font-display text-[17px] font-light leading-none text-onix-900">
                        {linha.pontos}
                      </span>
                      <span className="block text-[11px] text-onix-300">
                        {dinheiro(linha.pontos * rascunho.valorDoPonto)}
                      </span>
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ol>
          )}
        </Carta>
      </div>
    </>
  )
}
