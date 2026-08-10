import { useEffect, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { CampoMoeda, Botao, Campo, Entrada, Modal } from '@/components/ui'
import { useAviso, useSessao } from '@/contexts'
import { useFecharCaixa } from '@/hooks'
import { dinheiro } from '@/utils/formato'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { ResumoCaixa } from '@/types'

/**
 * Conferência do fechamento.
 *
 * A pessoa conta o dinheiro e informa. A diferença é calculada e fica
 * registrada — mesmo negativa, porque esconder quebra impede investigar.
 */
export function FecharCaixa({
  aberto, aoFechar, caixaId, resumo,
}: {
  aberto: boolean
  aoFechar: () => void
  caixaId: string
  resumo: ResumoCaixa | undefined
}) {
  const fechar = useFecharCaixa()
  const { sessao } = useSessao()
  const aviso = useAviso()

  const [contado, setContado] = useState('')
  const [observacoes, setObservacoes] = useState('')

  useEffect(() => {
    if (!aberto) return
    setContado('')
    setObservacoes('')
  }, [aberto])

  const esperado = resumo?.saldoEsperado ?? 0
  const informado = Number(contado || 0)
  const diferenca = contado === '' ? null : Number((informado - esperado).toFixed(2))

  const enviar = async () => {
    if (!sessao) return
    try {
      await fechar.executar({
        caixaId,
        valorInformado: informado,
        responsavelId: sessao.profissionalId,
        observacoes: observacoes.trim() || null,
      })
      aviso.sucesso('Caixa fechado', 'O resumo do dia ficou guardado no histórico.')
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível fechar', mensagemDeErro(falha))
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Fechar o caixa"
      descricao="Conte o dinheiro da gaveta e informe abaixo."
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Voltar</Botao>
          <Botao
            variante="principal"
            onClick={() => void enviar()}
            carregando={fechar.salvando}
            disabled={contado === ''}
          >
            Fechar caixa
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="tabular flex items-baseline justify-between rounded-xl border border-onix-100 bg-quartzo-50 px-3.5 py-3">
          <span className="text-[13px] text-onix-400">O sistema esperava</span>
          <span className="font-display text-[19px] font-light text-onix-900">
            {dinheiro(esperado)}
          </span>
        </div>

        <Campo rotulo="Dinheiro contado na gaveta" obrigatorio>
          <CampoMoeda value={contado} onChange={setContado} />
        </Campo>

        {diferenca !== null && (
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border p-3.5',
              diferenca === 0
                ? 'border-[#CFE0D5] bg-[#E8F0EA]'
                : 'border-ouro-200 bg-ouro-100/60',
            )}
          >
            <span
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white',
                diferenca === 0 ? 'text-sucesso' : 'text-ouro-600',
              )}
            >
              {diferenca === 0 ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-onix-800">
                {diferenca === 0
                  ? 'Bateu certinho'
                  : diferenca > 0
                    ? `Sobrando ${dinheiro(diferenca)}`
                    : `Faltando ${dinheiro(Math.abs(diferenca))}`}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-onix-400">
                {diferenca === 0
                  ? 'O contado confere com o esperado.'
                  : 'A diferença fica registrada para conferência depois.'}
              </p>
            </div>
          </div>
        )}

        <Campo rotulo="Observação" dica="Útil para explicar uma diferença.">
          <Entrada
            value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Opcional" maxLength={300}
          />
        </Campo>
      </div>
    </Modal>
  )
}
