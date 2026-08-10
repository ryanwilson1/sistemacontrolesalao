import { useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { AreaTexto, Botao, Carta, CartaTitulo, Interruptor } from '@/components/ui'
import { EsqueletoLista } from '@/components/feedback'
import { useAviso } from '@/contexts'
import { useModelos, useSalvarModelo } from '@/hooks'
import { modelosRepo, preencher, MODELOS_AVULSOS, ROTULO_AVULSO } from '@/services'
import { MARCADORES } from '@/types'
import { mensagemDeErro } from '@/utils/erros'
import type { ModeloAvulso } from '@/services'
import type { ModeloMensagem } from '@/types'

/*
  Exemplo para a pessoa ver o resultado enquanto escreve o modelo.

  Os nomes são propositalmente genéricos. Antes eram "Beatriz Almeida",
  "Emely Barbosa" e um endereço com número — pareciam dados de gente de
  verdade, e num sistema entregue a um salão isso confunde: a
  proprietária não sabe se aquilo é cliente dela ou enfeite.

  O que aparece aqui é claramente um espaço reservado.
*/
const EXEMPLO = {
  cliente: 'Cliente',
  clienteCompleto: 'Nome da cliente',
  servico: 'Serviço',
  profissional: 'Profissional',
  inicio: new Date(Date.now() + 86_400_000).toISOString(),
  valor: 100,
  studio: 'Seu salão',
  endereco: 'Endereço do salão',
  telefone: '11900000000',
  protocolo: 'ABC123',
  chavePix: 'chave-pix@salao',
}

export function Modelos() {
  const { dados: modelos, carregando } = useModelos()
  const salvar = useSalvarModelo()
  const aviso = useAviso()

  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    if (!modelos) return
    setRascunhos(Object.fromEntries(modelos.map((m) => [m.id, m.corpo])))
  }, [modelos])

  const enviar = async (modelo: ModeloMensagem) => {
    try {
      await salvar.executar({ id: modelo.id, dados: { corpo: rascunhos[modelo.id] ?? modelo.corpo } })
      aviso.sucesso('Modelo salvo', modelo.nome)
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  const restaurar = (modelo: ModeloMensagem) => {
    setRascunhos((atuais) => ({ ...atuais, [modelo.id]: modelosRepo.restaurarPadrao(modelo.chave) }))
  }

  if (carregando) return <EsqueletoLista linhas={4} />

  return (
    <div className="space-y-4">
      <Carta>
        <CartaTitulo
          titulo="Marcadores disponíveis"
          descricao="Escreva um deles no texto e o sistema troca pelo dado real"
        />
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(MARCADORES).map(([marcador, significado]: [string, string]) => (
            <span
              key={marcador}
              title={significado}
              className="rounded-md border border-onix-200 bg-quartzo-50 px-2 py-1 font-mono text-[11.5px] text-onix-600"
            >
              {marcador}
            </span>
          ))}
        </div>
      </Carta>

      <ul className="space-y-2.5">
        {modelos?.map((modelo) => {
          const corpo = rascunhos[modelo.id] ?? modelo.corpo
          const mudou = corpo !== modelo.corpo
          const expandido = aberto === modelo.id

          return (
            <li key={modelo.id} className="rounded-2xl border border-onix-100 bg-white shadow-carta">
              <button
                onClick={() => setAberto(expandido ? null : modelo.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-medium text-onix-800">
                    {modelo.nome}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-onix-400">
                    {corpo.split('\n')[0]}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] text-onix-300">
                  {expandido ? 'fechar' : 'editar'}
                </span>
              </button>

              {expandido && (
                <div className="border-t border-onix-50 p-4">
                  <AreaTexto
                    value={corpo}
                    onChange={(e) =>
                      setRascunhos((atuais) => ({ ...atuais, [modelo.id]: e.target.value }))
                    }
                    rows={7}
                    className="font-mono text-[13px]"
                  />

                  <div className="mt-3">
                    <p className="eyebrow mb-1.5">Como a cliente vai receber</p>
                    <p className="whitespace-pre-line rounded-xl bg-quartzo-50 px-3.5 py-3 text-[13px] leading-relaxed text-onix-600">
                      {preencher(corpo, EXEMPLO)}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Interruptor
                      ligado={modelo.ativo}
                      aoMudar={(valor) => void salvar.executar({ id: modelo.id, dados: { ativo: valor } })}
                      rotulo="Modelo ativo"
                    />
                    <div className="flex gap-2">
                      <Botao variante="fantasma" tamanho="sm" onClick={() => restaurar(modelo)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Texto original
                      </Botao>
                      <Botao
                        variante="ouro" tamanho="sm"
                        onClick={() => void enviar(modelo)}
                        disabled={!mudou}
                        carregando={salvar.salvando}
                      >
                        <Save className="h-3.5 w-3.5" /> Salvar
                      </Botao>
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Carta>
        <CartaTitulo
          titulo="Mensagens avulsas"
          descricao="Usadas fora da fila: cancelamento, cobrança e endereço"
        />
        <ul className="space-y-3">
          {(Object.keys(MODELOS_AVULSOS) as ModeloAvulso[]).map((chave) => (
            <li key={chave}>
              <p className="text-[13.5px] font-medium text-onix-800">{ROTULO_AVULSO[chave]}</p>
              <p className="mt-1 whitespace-pre-line rounded-xl bg-quartzo-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-onix-500">
                {preencher(MODELOS_AVULSOS[chave], EXEMPLO)}
              </p>
            </li>
          ))}
        </ul>
      </Carta>
    </div>
  )
}
