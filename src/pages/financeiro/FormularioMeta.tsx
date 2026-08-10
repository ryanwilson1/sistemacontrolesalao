import { useEffect, useState } from 'react'
import { moedaOuZero } from '@/utils/moeda'
import { Botao, Campo, CampoMoeda, Modal } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useDefinirMeta } from '@/hooks'
import { mesAno } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'

export function FormularioMeta({
  aberto, aoFechar, mesReferencia, valorAtual,
}: {
  aberto: boolean
  aoFechar: () => void
  mesReferencia: Date
  valorAtual: number | null
}) {
  const definir = useDefinirMeta()
  const aviso = useAviso()
  const [valor, setValor] = useState('')

  useEffect(() => {
    if (aberto) setValor(valorAtual ? String(valorAtual) : '')
  }, [aberto, valorAtual])

  const enviar = async () => {
    try {
      await definir.executar({ referencia: mesReferencia, valor: moedaOuZero(valor) })
      aviso.sucesso('Meta definida', mesAno(mesReferencia))
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível definir a meta', mensagemDeErro(falha))
    }
  }

  return (
    <Modal
      estadoDoFormulario={{ valor }}
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Meta do mês"
      descricao={mesAno(mesReferencia)}
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="ouro" onClick={() => void enviar()} carregando={definir.salvando}>
            Definir meta
          </Botao>
        </>
      }
    >
      <Campo rotulo="Quanto você quer faturar" dica="Aparece como barra de progresso no painel.">
        <CampoMoeda value={valor} onChange={setValor} />
      </Campo>
    </Modal>
  )
}
