import { useEffect, useState } from 'react'
import { Botao, Campo, Entrada, Interruptor, Modal } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useSalvarCupom, useServicos } from '@/hooks'
import { normalizar } from '@/services'
import { addDays, isoData } from '@/utils/datas'
import { dinheiro } from '@/utils/formato'
import { limparTexto } from '@/utils/sanitizar'
import { ErroDeRegra, mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { Cupom, TipoDesconto } from '@/types'

export function FormularioCupom({
  aberto, aoFechar, cupom,
}: {
  aberto: boolean
  aoFechar: () => void
  cupom?: Cupom | null
}) {
  const salvar = useSalvarCupom()
  const { dados: servicos } = useServicos()
  const aviso = useAviso()
  const editando = !!cupom

  const [codigo, setCodigo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<TipoDesconto>('percentual')
  const [valor, setValor] = useState('10')
  const [validoDe, setValidoDe] = useState('')
  const [validoAte, setValidoAte] = useState('')
  const [limiteUsos, setLimiteUsos] = useState('0')
  const [valorMinimo, setValorMinimo] = useState('0')
  const [descontoMaximo, setDescontoMaximo] = useState('0')
  const [servicosIds, setServicosIds] = useState<string[]>([])
  const [ativo, setAtivo] = useState(true)

  useEffect(() => {
    if (!aberto) return
    setCodigo(cupom?.codigo ?? '')
    setDescricao(cupom?.descricao ?? '')
    setTipo(cupom?.tipo ?? 'percentual')
    setValor(String(cupom?.valor ?? 10))
    setValidoDe(cupom?.validoDe ?? isoData(new Date()))
    setValidoAte(cupom?.validoAte ?? isoData(addDays(new Date(), 30)))
    setLimiteUsos(String(cupom?.limiteUsos ?? 0))
    setValorMinimo(String(cupom?.valorMinimo ?? 0))
    setDescontoMaximo(String(cupom?.descontoMaximo ?? 0))
    setServicosIds(cupom?.servicosIds ?? [])
    setAtivo(cupom?.ativo ?? true)
  }, [aberto, cupom])

  const alternarServico = (id: string) => {
    setServicosIds((atuais) =>
      atuais.includes(id) ? atuais.filter((s) => s !== id) : [...atuais, id],
    )
  }

  const enviar = async () => {
    try {
      const texto = limparTexto(descricao, 200)
      if (texto.length < 3) throw new ErroDeRegra('Descreva o cupom.')

      const numero = Number(valor)
      if (!numero || numero <= 0) throw new ErroDeRegra('O desconto precisa ser maior que zero.')
      if (tipo === 'percentual' && numero > 100) {
        throw new ErroDeRegra('O desconto percentual não pode passar de 100%.')
      }
      if (validoAte < validoDe) throw new ErroDeRegra('A data final precisa ser depois da inicial.')

      await salvar.executar({
        id: cupom?.id,
        dados: {
          codigo,
          descricao: texto,
          tipo,
          valor: numero,
          validoDe,
          validoAte,
          limiteUsos: Number(limiteUsos) || 0,
          servicosIds,
          valorMinimo: Number(valorMinimo) || 0,
          descontoMaximo: Number(descontoMaximo) || 0,
          ativo,
        },
      })

      aviso.sucesso(editando ? 'Cupom atualizado' : 'Cupom criado', normalizar(codigo))
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  /** Exemplo com um atendimento de R$ 200, para a regra ficar tangível. */
  const exemplo = () => {
    const base = 200
    const bruto = tipo === 'percentual' ? (base * Number(valor || 0)) / 100 : Number(valor || 0)
    const teto = Number(descontoMaximo) > 0 ? Math.min(bruto, Number(descontoMaximo)) : bruto
    const desconto = Math.min(teto, base)
    return `Em um atendimento de ${dinheiro(base)}, desconta ${dinheiro(desconto)} — fica ${dinheiro(base - desconto)}.`
  }

  return (
    <Modal
      estadoDoFormulario={{ codigo, descricao, tipo, valor, validoDe, validoAte, limiteUsos, valorMinimo, descontoMaximo, servicosIds, ativo }}
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar cupom' : 'Novo cupom'}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="ouro" onClick={() => void enviar()} carregando={salvar.salvando}>
            {editando ? 'Salvar' : 'Criar cupom'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Código" obrigatorio dica="Só letras e números.">
            <Entrada
              value={codigo}
              onChange={(e) => setCodigo(normalizar(e.target.value))}
              placeholder="VOLTA10" autoFocus className="tabular tracking-wider"
            />
          </Campo>
          <Campo rotulo="Descrição" obrigatorio>
            <Entrada
              value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: retorno em 30 dias" maxLength={200}
            />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['percentual', 'fixo'] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              onClick={() => setTipo(opcao)}
              className={cn(
                'h-11 rounded-xl border text-sm font-medium transition-colors',
                tipo === opcao
                  ? 'border-transparent bg-onix-800 text-white'
                  : 'border-onix-200 bg-white text-onix-500 hover:border-onix-300',
              )}
            >
              {opcao === 'percentual' ? 'Desconto em %' : 'Desconto em R$'}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo={tipo === 'percentual' ? 'Percentual' : 'Valor'} obrigatorio>
            <Entrada
              type="number" min="0" step={tipo === 'percentual' ? '1' : '0.01'}
              max={tipo === 'percentual' ? '100' : undefined} inputMode="decimal"
              value={valor} onChange={(e) => setValor(e.target.value)}
              prefixo={<span className="text-[13px]">{tipo === 'percentual' ? '%' : 'R$'}</span>}
            />
          </Campo>
          <Campo
            rotulo="Desconto máximo"
            dica={tipo === 'percentual' ? 'Teto em reais. Zero é sem teto.' : 'Não se aplica.'}
          >
            <Entrada
              type="number" min="0" step="0.01" inputMode="decimal"
              value={descontoMaximo} onChange={(e) => setDescontoMaximo(e.target.value)}
              disabled={tipo === 'fixo'}
              prefixo={<span className="text-[13px]">R$</span>}
            />
          </Campo>
        </div>

        <p className="rounded-xl border border-ouro-200 bg-ouro-100/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ouro-700">
          {exemplo()}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Válido de">
            <Entrada type="date" value={validoDe} onChange={(e) => setValidoDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Válido até">
            <Entrada type="date" value={validoAte} min={validoDe} onChange={(e) => setValidoAte(e.target.value)} />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Limite de usos" dica="Zero é ilimitado.">
            <Entrada
              type="number" min="0" step="1" inputMode="numeric"
              value={limiteUsos} onChange={(e) => setLimiteUsos(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Valor mínimo" dica="Do atendimento, para o cupom valer.">
            <Entrada
              type="number" min="0" step="0.01" inputMode="decimal"
              value={valorMinimo} onChange={(e) => setValorMinimo(e.target.value)}
              prefixo={<span className="text-[13px]">R$</span>}
            />
          </Campo>
        </div>

        <Campo
          rotulo="Serviços incluídos"
          dica={servicosIds.length === 0 ? 'Nenhum marcado: vale para todos.' : `${servicosIds.length} selecionado(s)`}
        >
          <div className="scroll-fino flex max-h-[136px] flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-onix-100 p-2.5">
            {servicos?.map((servico) => (
              <button
                key={servico.id}
                type="button"
                onClick={() => alternarServico(servico.id)}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
                  servicosIds.includes(servico.id)
                    ? 'border-transparent bg-onix-800 text-white'
                    : 'border-onix-200 bg-white text-onix-500 hover:border-marca',
                )}
              >
                {servico.nome}
              </button>
            ))}
          </div>
        </Campo>

        <div className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
          <Interruptor
            ligado={ativo} aoMudar={setAtivo}
            rotulo="Cupom ativo"
            descricao="Desative para suspender sem apagar o histórico de usos."
          />
        </div>
      </div>
    </Modal>
  )
}
