import { useEffect, useState, useRef } from 'react'
import { moedaOuZero } from '@/utils/moeda'
import { Wallet } from 'lucide-react'
import { CampoMoeda, Botao, Campo, Carta, Entrada } from '@/components/ui'
import { useAviso, useSessao } from '@/contexts'
import { useAbrirCaixa } from '@/hooks'
import { dataLonga } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'
import { novoId } from '@/utils/id'

/** Tela de abertura: o único dado que importa é o troco inicial. */
export function AbrirCaixa({ aoAbrir }: { aoAbrir: () => void }) {
  const abrir = useAbrirCaixa()
  const { sessao } = useSessao()
  const aviso = useAviso()

  /*
    O id da gravação nasce AQUI, no primeiro toque em salvar — e
    sobrevive à tentativa seguinte.

    É a metade do formulário no contrato de idempotência: se o servidor
    gravou mas a resposta se perdeu (timeout), a nova tentativa repete
    o MESMO id, bate na chave primária, e o adaptador devolve a linha
    já gravada como sucesso. Uma operação no banco, nunca duas — não
    importa quantas vezes a pessoa toque.

    Zera no sucesso (o próximo envio é OUTRA operação) e quando o
    formulário abre de novo.
  */
  const idDoEnvio = useRef<string | null>(null)

  const [valor, setValor] = useState('0')
  const [observacoes, setObservacoes] = useState('')

  useEffect(() => {
    setValor('0')
    setObservacoes('')
  }, [])

  const enviar = async () => {
    if (!sessao) return
    try {
      idDoEnvio.current ??= novoId()

      await abrir.executar({
        idIdempotencia: idDoEnvio.current,
        valorAbertura: moedaOuZero(valor),
        responsavelId: sessao.profissionalId,
        observacoes: observacoes.trim() || null,
      })
      idDoEnvio.current = null
      aviso.sucesso('Caixa aberto', 'Agora as entradas e saídas do dia ficam registradas.')
      aoAbrir()
    } catch (falha) {
      aviso.erro('Não foi possível abrir', mensagemDeErro(falha))
    }
  }

  return (
    <Carta className="mx-auto max-w-md">
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-quartzo-100 text-quartzo-600">
          <Wallet className="h-6 w-6" strokeWidth={1.6} />
        </span>
        <h2 className="mt-4 font-display text-[19px] font-light tracking-tight text-onix-900">
          Abrir o caixa de hoje
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-onix-400">
          {dataLonga(new Date())}
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <Campo
          rotulo="Troco inicial"
          dica="Quanto há em dinheiro na gaveta agora. É a base da conferência no fechamento."
        >
          <CampoMoeda value={valor} onChange={setValor} />
        </Campo>

        <Campo rotulo="Observação">
          <Entrada
            value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Opcional" maxLength={200}
          />
        </Campo>

        <Botao
          variante="ouro" tamanho="lg" bloco
          onClick={() => void enviar()}
          carregando={abrir.salvando}
        >
          Abrir caixa
        </Botao>
      </div>
    </Carta>
  )
}
