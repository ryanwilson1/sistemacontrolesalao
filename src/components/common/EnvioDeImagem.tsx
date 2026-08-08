import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react'
import { Botao } from '@/components/ui'
import { Confirmar } from '@/components/feedback'
import { useAviso } from '@/contexts'
import { conferirImagem, LIMITE_DE_IMAGEM_MB } from '@/utils/imagem'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'

/**
 * Escolher, ver e trocar uma imagem.
 *
 * O preview aparece **antes** do envio, a partir do arquivo local. É a
 * diferença entre "escolhi, esperei, e não era essa" e "escolhi, vi, e
 * confirmei" — num celular com rede ruim, essa espera são vinte
 * segundos que a proprietária passa sem saber o que vai receber.
 *
 * A validação também roda antes: um arquivo grande demais é recusado
 * na hora, sem gastar a rede dela para descobrir isso no servidor.
 */
export function EnvioDeImagem({
  valor,
  aoEnviar,
  aoRemover,
  rotulo,
  descricao,
  formato = 'quadrado',
}: {
  valor: string | null
  /** Recebe o arquivo já conferido. Deve devolver a URL final. */
  aoEnviar: (arquivo: File) => Promise<void>
  aoRemover: () => Promise<void>
  rotulo: string
  descricao?: string
  formato?: 'quadrado' | 'faixa'
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const aviso = useAviso()

  const [previa, setPrevia] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)

  const mostrando = previa ?? valor

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return

    try {
      // Confere antes de gastar rede. Se o arquivo não presta, a
      // proprietária descobre agora — não depois do envio.
      await conferirImagem(arquivo)
    } catch (falha) {
      aviso.erro('Imagem não aceita', mensagemDeErro(falha))
      if (entrada.current) entrada.current.value = ''
      return
    }

    const local = URL.createObjectURL(arquivo)
    setPrevia(local)
    setEnviando(true)

    try {
      await aoEnviar(arquivo)
      aviso.sucesso('Imagem salva')
    } catch (falha) {
      // A prévia sai junto: deixá-la faria a tela mostrar uma imagem
      // que o servidor não tem.
      setPrevia(null)
      aviso.erro('Não foi possível enviar', mensagemDeErro(falha))
    } finally {
      setEnviando(false)
      URL.revokeObjectURL(local)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const remover = async () => {
    setConfirmandoRemocao(false)
    setEnviando(true)
    try {
      await aoRemover()
      setPrevia(null)
      aviso.sucesso('Imagem removida')
    } catch (falha) {
      aviso.erro('Não foi possível remover', mensagemDeErro(falha))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <p className="text-[13px] font-medium text-onix-600">{rotulo}</p>
      {descricao && (
        <p className="mt-0.5 text-[12.5px] leading-snug text-onix-400">{descricao}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <div
          className={cn(
            'relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-onix-200 bg-quartzo-50',
            formato === 'quadrado' ? 'h-20 w-20' : 'h-20 w-full max-w-[240px] sm:w-40',
          )}
        >
          {mostrando ? (
            <img
              src={mostrando}
              alt={`${rotulo} do salão`}
              className="h-full w-full object-contain"
            />
          ) : (
            <ImagePlus className="h-6 w-6 text-onix-300" strokeWidth={1.6} aria-hidden />
          )}

          {enviando && (
            <span className="absolute inset-0 grid place-items-center bg-white/70">
              <Loader2 className="h-5 w-5 animate-spin text-marca" />
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Botao
            variante="secundario"
            tamanho="sm"
            onClick={() => entrada.current?.click()}
            disabled={enviando}
          >
            <Upload className="h-3.5 w-3.5" />
            {mostrando ? 'Trocar' : 'Escolher imagem'}
          </Botao>

          {mostrando && (
            <Botao
              variante="fantasma"
              tamanho="sm"
              onClick={() => setConfirmandoRemocao(true)}
              disabled={enviando}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </Botao>
          )}
        </div>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-onix-300">
        PNG, JPG ou WEBP · até {LIMITE_DE_IMAGEM_MB} MB
      </p>

      <input
        ref={entrada}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void escolher(e.target.files?.[0])}
      />

      <Confirmar
        aberto={confirmandoRemocao}
        aoFechar={() => setConfirmandoRemocao(false)}
        aoConfirmar={() => void remover()}
        titulo={`Remover ${rotulo.toLowerCase()}?`}
        descricao="O salão volta a aparecer sem imagem. Você pode enviar outra quando quiser."
        rotuloConfirmar="Remover"
        destrutivo
      />
    </div>
  )
}
