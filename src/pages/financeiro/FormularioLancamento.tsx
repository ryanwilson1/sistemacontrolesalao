import { useEffect, useState } from 'react'
import { parseMoedaBR } from '@/utils/moeda'
import { CampoMoeda, Botao, Campo, Entrada, Modal, Selecao } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useSalvarLancamento } from '@/hooks'
import { FORMA_PAGAMENTO } from '@/constants'
import { isoData } from '@/utils/datas'
import { limparTexto } from '@/utils/sanitizar'
import { ErroDeRegra, mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { FormaPagamento, TipoLancamento } from '@/types'

export function FormularioLancamento({
  aberto, aoFechar, mesReferencia,
}: {
  aberto: boolean
  aoFechar: () => void
  mesReferencia: Date
}) {
  const salvar = useSalvarLancamento()
  const aviso = useAviso()

  const [tipo, setTipo] = useState<TipoLancamento>('despesa')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [jaQuitado, setJaQuitado] = useState(true)

  useEffect(() => {
    if (!aberto) return
    setTipo('despesa')
    setDescricao('')
    setCategoria('')
    setValor('')
    setVencimento(isoData(new Date()))
    setForma('pix')
    setJaQuitado(true)
  }, [aberto, mesReferencia])

  const enviar = async () => {
    try {
      const texto = limparTexto(descricao, 200)
      if (texto.length < 2) throw new ErroDeRegra('Descreva o lançamento.')

      const numero = parseMoedaBR(valor) ?? Number.NaN
      if (!numero || numero <= 0) throw new ErroDeRegra('Informe um valor maior que zero.')

      await salvar.executar({
        dados: {
          agendamentoId: null,
          clienteId: null,
          tipo,
          situacao: jaQuitado ? (tipo === 'receita' ? 'recebido' : 'pago') : 'previsto',
          categoria: categoria.trim() || null,
          descricao: texto,
          valor: numero,
          forma,
          vencimento,
          pagoEm: jaQuitado ? new Date().toISOString() : null,
        },
      })

      aviso.sucesso(tipo === 'receita' ? 'Receita lançada' : 'Despesa lançada', texto)
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível lançar', mensagemDeErro(falha))
    }
  }

  return (
    <Modal
      estadoDoFormulario={{ tipo, descricao, categoria, valor, vencimento, forma, jaQuitado }}
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo lançamento"
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="ouro" onClick={() => void enviar()} carregando={salvar.salvando}>
            Lançar
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="grid grid-cols-2 gap-2">
          {(['receita', 'despesa'] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              onClick={() => setTipo(opcao)}
              className={cn(
                'h-11 rounded-xl border text-sm font-medium transition-colors',
                tipo === opcao
                  ? opcao === 'receita'
                    ? 'border-transparent bg-[#E8F0EA] text-[#3D6250]'
                    : 'border-transparent bg-[#F7E9EA] text-[#8C3F45]'
                  : 'border-onix-200 bg-white text-onix-500 hover:border-onix-300',
              )}
            >
              {opcao === 'receita' ? 'Entrada' : 'Saída'}
            </button>
          ))}
        </div>

        <Campo rotulo="Descrição" obrigatorio>
          <Entrada
            value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder={tipo === 'receita' ? 'Ex.: venda de produto' : 'Ex.: aluguel do espaço'}
            autoFocus maxLength={200}
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Valor" obrigatorio>
            <CampoMoeda value={valor} onChange={setValor} />
          </Campo>
          <Campo rotulo="Data">
            <Entrada type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Categoria">
            <Entrada
              value={categoria} onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex.: Fixas, Produtos" maxLength={60}
            />
          </Campo>
          <Campo rotulo="Forma de pagamento">
            <Selecao value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
              {Object.entries(FORMA_PAGAMENTO).map(([valorForma, rotulo]) => (
                <option key={valorForma} value={valorForma}>{rotulo}</option>
              ))}
            </Selecao>
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { valor: true, rotulo: tipo === 'receita' ? 'Já recebi' : 'Já paguei' },
            { valor: false, rotulo: 'Ainda em aberto' },
          ].map((opcao) => (
            <button
              key={String(opcao.valor)}
              type="button"
              onClick={() => setJaQuitado(opcao.valor)}
              className={cn(
                'h-10 rounded-xl border text-[13px] font-medium transition-colors',
                jaQuitado === opcao.valor
                  ? 'border-transparent bg-onix-800 text-white'
                  : 'border-onix-200 bg-white text-onix-500 hover:border-onix-300',
              )}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
