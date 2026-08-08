import { useMemo, useState } from 'react'
import { Download, QrCode as IconeQr } from 'lucide-react'
import { Botao } from '@/components/ui/Botao'
import { Modal } from '@/components/ui/Modal'
import { qrCodeSvg } from '@/utils/qrcode'

/**
 * QR Code do link do salão.
 *
 * Gerado no navegador. O endereço não sai daqui para lugar nenhum — nem
 * para um serviço de terceiro, nem para o nosso próprio servidor.
 *
 * O download sai em SVG de propósito: é o formato que a gráfica aceita
 * para imprimir num cartaz de dois metros sem serrilhar, e continua
 * abrindo no celular para mandar por WhatsApp.
 */
export function BotaoQrCode({ endereco, nome }: { endereco: string; nome: string }) {
  const [aberto, setAberto] = useState(false)

  const svg = useMemo(() => {
    try {
      return qrCodeSvg(endereco, 320)
    } catch {
      return null
    }
  }, [endereco])

  const baixar = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `qrcode-${nome || 'agendamento'}.svg`
    link.rel = 'noopener'
    link.click()

    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <Botao variante="fantasma" tamanho="sm" onClick={() => setAberto(true)}>
        <IconeQr className="h-3.5 w-3.5" /> QR Code
      </Botao>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="QR Code do agendamento"
        largura="sm"
        rodape={
          <Botao variante="principal" onClick={baixar} disabled={!svg}>
            <Download className="h-4 w-4" /> Baixar
          </Botao>
        }
      >
        {svg ? (
          <div className="space-y-3">
            <div
              className="mx-auto w-fit rounded-2xl border border-onix-100 bg-white p-3 shadow-carta"
              // O SVG é montado por `qrCodeSvg` a partir de números —
              // não há texto da usuária dentro dele, só coordenadas.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="text-center text-[12.5px] leading-relaxed text-onix-400">
              Imprima e deixe no balcão, ou cole no story.
              <br />A cliente aponta a câmera e cai direto no agendamento.
            </p>
          </div>
        ) : (
          <p className="text-[13.5px] text-onix-500">
            Não foi possível gerar o QR Code para este endereço.
          </p>
        )}
      </Modal>
    </>
  )
}
