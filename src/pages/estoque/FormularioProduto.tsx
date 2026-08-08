import { useEffect, useState } from 'react'
import { Botao, Campo, Entrada, Interruptor, Modal, Selecao } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useSalvarProduto } from '@/hooks'
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
    setCusto(produto ? String(produto.precoCusto) : '')
    setVenda(produto ? String(produto.precoVenda) : '')
    setValidade(produto?.validade ?? '')
    setAtivo(produto?.ativo ?? true)
  }, [aberto, produto])

  const enviar = async () => {
    try {
      const nomeLimpo = limparNome(nome)
      if (nomeLimpo.length < 2) throw new ErroDeRegra('Informe o nome do produto.')

      await salvar.executar({
        id: produto?.id,
        dados: {
          fornecedorId: produto?.fornecedorId ?? null,
          codigo: codigo.trim() || null,
          nome: nomeLimpo,
          marca: marca.trim() || null,
          categoria: categoria.trim() || null,
          unidade,
          // Ao editar, o saldo só muda por movimentação — nunca no formulário.
          quantidade: produto ? produto.quantidade : Number(quantidade) || 0,
          quantidadeMinima: Number(minimo) || 0,
          precoCusto: Number(custo) || 0,
          // O custo médio só é recalculado por entrada de estoque; aqui
          // apenas acompanha o cadastro inicial.
          precoMedio: produto?.precoMedio ?? (Number(custo) || 0),
          precoVenda: Number(venda) || 0,
          validade: validade || null,
          ativo,
        },
      })

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
            dica={editando ? 'Altere por movimentação' : undefined}
          >
            <Entrada
              type="number" min="0" step="0.001" inputMode="decimal"
              value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
              disabled={editando}
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
            <Entrada
              type="number" min="0" step="0.01" inputMode="decimal"
              value={custo} onChange={(e) => setCusto(e.target.value)}
              prefixo={<span className="text-[13px]">R$</span>}
            />
          </Campo>
          <Campo rotulo="Preço de venda">
            <Entrada
              type="number" min="0" step="0.01" inputMode="decimal"
              value={venda} onChange={(e) => setVenda(e.target.value)}
              prefixo={<span className="text-[13px]">R$</span>}
            />
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
