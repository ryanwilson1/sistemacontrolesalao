import { useEffect, useState } from 'react'
import { Botao, Campo, Entrada, Modal, Selecao } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useMovimentarEstoque } from '@/hooks'
import { TIPO_MOVIMENTO } from '@/constants'
import { mensagemDeErro } from '@/utils/erros'
import type { Produto, TipoMovimento } from '@/types'

/** Entrada e saída de estoque. O saldo é sempre consequência daqui. */
export function FormularioMovimento({
  aberto, aoFechar, produto,
}: {
  aberto: boolean
  aoFechar: () => void
  produto: Produto | null
}) {
  const movimentar = useMovimentarEstoque()
  const aviso = useAviso()

  const [tipo, setTipo] = useState<TipoMovimento>('entrada')
  const [quantidade, setQuantidade] = useState('1')
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (!aberto) return
    setTipo('entrada')
    setQuantidade('1')
    setMotivo('')
  }, [aberto])

  if (!produto) return null

  const enviar = async () => {
    try {
      await movimentar.executar({
        produtoId: produto.id,
        tipo,
        quantidade: Number(quantidade),
        motivo: motivo.trim() || undefined,
      })

      const regra = TIPO_MOVIMENTO[tipo]
      aviso.sucesso(
        `${regra.rotulo} registrada`,
        `${produto.nome}: ${regra.soma ? '+' : '−'}${quantidade} ${produto.unidade}`,
      )
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível movimentar', mensagemDeErro(falha))
    }
  }

  const previsao = TIPO_MOVIMENTO[tipo].soma
    ? produto.quantidade + Number(quantidade || 0)
    : produto.quantidade - Number(quantidade || 0)

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Movimentar estoque"
      descricao={produto.nome}
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="principal" onClick={() => void enviar()} carregando={movimentar.salvando}>
            Registrar
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="tabular flex items-baseline justify-between rounded-xl border border-onix-100 bg-quartzo-50 px-3.5 py-3">
          <span className="text-[13px] text-onix-400">Saldo atual</span>
          <span className="font-display text-[19px] font-light text-onix-900">
            {produto.quantidade} {produto.unidade}
          </span>
        </div>

        <Campo rotulo="Tipo de movimentação">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimento)}>
            {Object.entries(TIPO_MOVIMENTO).map(([valor, { rotulo, soma }]) => (
              <option key={valor} value={valor}>
                {rotulo} ({soma ? 'soma' : 'subtrai'})
              </option>
            ))}
          </Selecao>
        </Campo>

        <Campo
          rotulo="Quantidade"
          obrigatorio
          dica={
            Number(quantidade) > 0
              ? `Saldo ficará em ${Math.max(previsao, 0)} ${produto.unidade}`
              : undefined
          }
          erro={previsao < 0 ? 'Saldo insuficiente para esta saída.' : undefined}
        >
          <Entrada
            type="number" min="0.001" step="0.001" inputMode="decimal"
            value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
            erro={previsao < 0} autoFocus
            sufixo={<span className="text-[13px]">{produto.unidade}</span>}
          />
        </Campo>

        <Campo rotulo="Motivo" dica="Fica registrado no histórico do produto.">
          <Entrada
            value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: compra do mês, uso em atendimento" maxLength={200}
          />
        </Campo>
      </div>
    </Modal>
  )
}
