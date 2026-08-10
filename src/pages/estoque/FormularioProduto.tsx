import { useEffect, useState } from 'react'
import { formatarMoedaBR, moedaOuZero } from '@/utils/moeda'
import { CampoMoeda, Botao, Campo, Entrada, Interruptor, Modal, Selecao } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useMovimentarEstoque, useSalvarProduto } from '@/hooks'
import { UNIDADES } from '@/constants'
import { limparNome } from '@/utils/sanitizar'
import { ErroDeRegra, mensagemDeErro } from '@/utils/erros'
import type { Produto } from '@/types'

export function FormularioProduto({
  aberto, aoFechar, produto,
}: {
  aberto: boolean
  aoFechar: () => void
  produto?: Produto | null
}) {
  const salvar = useSalvarProduto()
  const movimentar = useMovimentarEstoque()
  const aviso = useAviso()
  const editando = !!produto

  const [nome, setNome] = useState('')
  const [codigo, setCodigo] = useState('')
  const [marca, setMarca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unidade, setUnidade] = useState<string>(UNIDADES[0])
  const [quantidade, setQuantidade] = useState('0')
  const [minimo, setMinimo] = useState('1')
  const [custo, setCusto] = useState('')
  const [venda, setVenda] = useState('')
  const [validade, setValidade] = useState('')
  const [ativo, setAtivo] = useState(true)

  useEffect(() => {
    if (!aberto) return
    setNome(produto?.nome ?? '')
    setCodigo(produto?.codigo ?? '')
    setMarca(produto?.marca ?? '')
    setCategoria(produto?.categoria ?? '')
    setUnidade(produto?.unidade ?? UNIDADES[0])
    setQuantidade(String(produto?.quantidade ?? 0))
    setMinimo(String(produto?.quantidadeMinima ?? 1))
    setCusto(produto ? formatarMoedaBR(produto.precoCusto) : '')
    setVenda(produto ? formatarMoedaBR(produto.precoVenda) : '')
    setValidade(produto?.validade ?? '')
    setAtivo(produto?.ativo ?? true)
  }, [aberto, produto])

  const enviar = async () => {
    try {
      const nomeLimpo = limparNome(nome)
      if (nomeLimpo.length < 2) throw new ErroDeRegra('Informe o nome do produto.')

      /*
        Números do estoque, conferidos antes de gravar.

        Só o nome era validado. Quantidade negativa, estoque mínimo
        absurdo e preço de venda menor que o custo entravam sem
        reclamação — e o último é o que dói: o relatório de margem
        passa a mostrar prejuízo em cada venda, e ninguém liga o
        resultado ao dia em que o preço foi digitado errado.
      */
      const qtd = Number(quantidade) || 0
      if (qtd < 0) throw new ErroDeRegra('A quantidade não pode ser negativa.')

      const min = Number(minimo) || 0
      if (min < 0) throw new ErroDeRegra('O estoque mínimo não pode ser negativo.')

      const vCusto = moedaOuZero(custo)
      const vVenda = moedaOuZero(venda)
      if (vCusto < 0 || vVenda < 0) {
        throw new ErroDeRegra('Os preços não podem ser negativos.')
      }
      if (vVenda > 0 && vCusto > 0 && vVenda < vCusto) {
        throw new ErroDeRegra(
          'O preço de venda está abaixo do custo. Confira os dois valores.',
        )
      }

      await salvar.executar({
        id: produto?.id,
        dados: {
          fornecedorId: produto?.fornecedorId ?? null,
          codigo: codigo.trim() || null,
          nome: nomeLimpo,
          marca: marca.trim() || null,
          categoria: categoria.trim() || null,
          unidade,
          /*
            O saldo não é gravado direto na edição — mas o campo também
            não fica cinza.

            Bloquear era defensável no papel: o saldo é derivado das
            movimentações, e escrever por cima quebraria o histórico. Na
            prática, tirava a autonomia de quem faz a contagem física e
            encontra 8 onde o sistema diz 10. Ela via o número errado,
            não podia corrigir, e nada explicava o caminho.

            Agora ela digita o número certo e o sistema registra a
            diferença como um **ajuste** logo abaixo — o saldo passa a
            bater e o histórico continua contando a verdade sobre como
            chegou lá.
          */
          quantidade: produto ? produto.quantidade : Number(quantidade) || 0,
          quantidadeMinima: Number(minimo) || 0,
          precoCusto: moedaOuZero(custo),
          // O custo médio só é recalculado por entrada de estoque; aqui
          // apenas acompanha o cadastro inicial.
          precoMedio: produto?.precoMedio ?? moedaOuZero(custo),
          precoVenda: moedaOuZero(venda),
          validade: validade || null,
          ativo,
        },
      })

      /* Correção de saldo na contagem física: entra como ajuste. */
      if (produto) {
        const desejado = Number(quantidade) || 0
        const diferenca = Number((desejado - produto.quantidade).toFixed(3))

        if (diferenca !== 0) {
          await movimentar.executar({
            produtoId: produto.id,
            tipo: diferenca > 0 ? 'entrada' : 'saida',
            quantidade: Math.abs(diferenca),
            motivo: 'Ajuste de contagem',
          })
        }
      }

      aviso.sucesso(editando ? 'Produto atualizado' : 'Produto cadastrado', nomeLimpo)
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <Modal
      estadoDoFormulario={{ nome, codigo, marca, categoria, unidade, quantidade, minimo, custo, venda, validade, ativo }}
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar produto' : 'Novo produto'}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="ouro" onClick={() => void enviar()} carregando={salvar.salvando}>
            {editando ? 'Salvar' : 'Cadastrar'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Campo rotulo="Nome do produto" obrigatorio>
          <Entrada
            value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Shampoo hidratante 1L" autoFocus maxLength={120}
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Código" dica="Interno ou do fornecedor">
            <Entrada
              value={codigo} onChange={(e) => setCodigo(e.target.value)}
              placeholder="P0001" maxLength={40}
            />
          </Campo>
          <Campo rotulo="Marca">
            <Entrada value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={80} />
          </Campo>
          <Campo rotulo="Categoria">
            <Entrada
              value={categoria} onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex.: Coloração" maxLength={80}
            />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Unidade">
            <Selecao value={unidade} onChange={(e) => setUnidade(e.target.value)}>
              {UNIDADES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Selecao>
          </Campo>

          <Campo
            rotulo={editando ? 'Saldo atual' : 'Quantidade inicial'}
            dica={
              editando
                ? 'Pode corrigir aqui. A diferença entra como ajuste no histórico.'
                : undefined
            }
          >
            <Entrada
              type="number" min="0" step="0.001" inputMode="decimal"
              value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
            />
          </Campo>

          <Campo rotulo="Estoque mínimo" dica="Avisa quando chegar aqui">
            <Entrada
              type="number" min="0" step="0.001" inputMode="decimal"
              value={minimo} onChange={(e) => setMinimo(e.target.value)}
            />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Preço de custo">
            <CampoMoeda value={custo} onChange={setCusto} />
          </Campo>
          <Campo rotulo="Preço de venda">
            <CampoMoeda value={venda} onChange={setVenda} />
          </Campo>
          <Campo rotulo="Validade">
            <Entrada type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </Campo>
        </div>

        <div className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
          <Interruptor
            ligado={ativo} aoMudar={setAtivo}
            rotulo="Produto ativo"
            descricao="Desative para tirar da lista sem perder o histórico."
          />
        </div>
      </div>
    </Modal>
  )
}
