import { Botao } from '@/components/ui/Botao'
import { Modal } from '@/components/ui/Modal'

/** Confirmação antes de uma ação difícil de desfazer. */
export function Confirmar({
  aberto, aoFechar, aoConfirmar, titulo, descricao,
  rotuloConfirmar = 'Confirmar', destrutivo, carregando,
}: {
  aberto: boolean
  aoFechar: () => void
  aoConfirmar: () => void
  titulo: string
  descricao?: string
  rotuloConfirmar?: string
  destrutivo?: boolean
  carregando?: boolean
}) {
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar} disabled={carregando}>
            Voltar
          </Botao>
          <Botao
            variante={destrutivo ? 'perigo' : 'principal'}
            onClick={aoConfirmar}
            carregando={carregando}
          >
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      {descricao && <p className="text-[14px] leading-relaxed text-onix-500">{descricao}</p>}
    </Modal>
  )
}
