import { useEffect, useState } from 'react'
import { moedaOuZero } from '@/utils/moeda'
import { CampoMoeda, Botao, Campo, Entrada, Modal, Selecao } from '@/components/ui'
import { useAviso, useSessao } from '@/contexts'
import { useMovimentarCaixa } from '@/hooks'
import { FORMA_PAGAMENTO } from '@/constants'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { FormaPagamento, OrigemMovimento } from '@/types'

const ORIGENS: Record<'entrada' | 'saida', { valor: OrigemMovimento; rotulo: string }[]> = {
  entrada: [
    { valor: 'venda', rotulo: 'Venda de produto' },
    { valor: 'atendimento', rotulo: 'Atendimento avulso' },
    { valor: 'suprimento', rotulo: 'Suprimento (reforço de troco)' },
    { valor: 'ajuste', rotulo: 'Ajuste' },
  ],
  saida: [
    { valor: 'despesa', rotulo: 'Despesa' },
    { valor: 'sangria', rotulo: 'Sangria (retirada)' },
    { valor: 'ajuste', rotulo: 'Ajuste' },
  ],
}

export function FormularioMovimentoCaixa({
  aberto, aoFechar, tipoInicial,
}: {
  aberto: boolean
  aoFechar: () => void
  tipoInicial: 'entrada' | 'saida'
}) {
  const movimentar = useMovimentarCaixa()
  const { sessao } = useSessao()
  const aviso = useAviso()

  const [tipo, setTipo] = useState<'entrada' | 'saida'>(tipoInicial)
  const [origem, setOrigem] = useState<OrigemMovimento>('venda')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('dinheiro')

  useEffect(() => {
    if (!aberto) return
    setTipo(tipoInicial)
    setOrigem(tipoInicial === 'entrada' ? 'venda' : 'despesa')
    setDescricao('')
    setValor('')
    setForma('dinheiro')
  }, [aberto, tipoInicial])

  const trocarTipo = (novo: 'entrada' | 'saida') => {
    setTipo(novo)
    setOrigem(novo === 'entrada' ? 'venda' : 'despesa')
  }

  const enviar = async () => {
    try {
      await movimentar.executar({
        tipo,
        origem,
        descricao: descricao.trim() || ORIGENS[tipo].find((o) => o.valor === origem)!.rotulo,
        valor: moedaOuZero(valor),
        forma,
        profissionalId: sessao?.profissionalId ?? null,
      })
      aviso.sucesso(tipo === 'entrada' ? 'Entrada registrada' : 'Saída registrada')
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível registrar', mensagemDeErro(falha))
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Movimentar caixa"
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="ouro" onClick={() => void enviar()} carregando={movimentar.salvando}>
            Registrar
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="grid grid-cols-2 gap-2">
          {(['entrada', 'saida'] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              onClick={() => trocarTipo(opcao)}
              className={cn(
                'h-11 rounded-xl border text-sm font-medium transition-colors',
                tipo === opcao
                  ? opcao === 'entrada'
                    ? 'border-transparent bg-[#E8F0EA] text-[#3D6250]'
                    : 'border-transparent bg-[#F7E9EA] text-[#8C3F45]'
                  : 'border-onix-200 bg-white text-onix-500 hover:border-onix-300',
              )}
            >
              {opcao === 'entrada' ? 'Entrada' : 'Saída'}
            </button>
          ))}
        </div>

        <Campo rotulo="Motivo">
          <Selecao value={origem} onChange={(e) => setOrigem(e.target.value as OrigemMovimento)}>
            {ORIGENS[tipo].map((o) => (
              <option key={o.valor} value={o.valor}>{o.rotulo}</option>
            ))}
          </Selecao>
        </Campo>

        <Campo rotulo="Descrição" dica="Deixe em branco para usar o motivo acima.">
          <Entrada
            value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: shampoo vendido para a Beatriz" maxLength={200}
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Valor" obrigatorio>
            <CampoMoeda value={valor} onChange={setValor} />
          </Campo>

          <Campo
            rotulo="Forma"
            dica={forma === 'dinheiro' ? 'Altera o dinheiro na gaveta' : 'Não altera a gaveta'}
          >
            <Selecao value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
              {Object.entries(FORMA_PAGAMENTO).map(([v, rotulo]) => (
                <option key={v} value={v}>{rotulo}</option>
              ))}
            </Selecao>
          </Campo>
        </div>
      </div>
    </Modal>
  )
}
