import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, RefreshCw, type LucideIcon } from 'lucide-react'
import { Botao } from '@/components/ui/Botao'
import { cn } from '@/utils/cn'

/**
 * Tela vazia. É um convite para agir, não um lamento — por isso sempre
 * carrega a próxima ação possível.
 */
export function EstadoVazio({
  icone: Icone, titulo, descricao, acao, compacto,
}: {
  icone: LucideIcon
  titulo: string
  descricao?: string
  acao?: ReactNode
  compacto?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col items-center justify-center px-5 text-center',
        compacto ? 'py-10' : 'py-14 sm:py-16',
      )}
    >
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-quartzo-100 text-quartzo-600">
        <Icone className="h-6 w-6" strokeWidth={1.6} />
      </span>
      <h3 className="mt-4 font-display text-[15px] font-medium tracking-wide text-onix-800">
        {titulo}
      </h3>
      {descricao && (
        <p className="mt-1.5 max-w-xs text-[13.5px] leading-relaxed text-onix-400">{descricao}</p>
      )}
      {acao && <div className="mt-5">{acao}</div>}
    </motion.div>
  )
}

/** Erro: diz o que houve e oferece o caminho de volta. */
export function EstadoErro({
  titulo = 'Não foi possível carregar', descricao, aoTentarNovamente,
}: {
  titulo?: string
  descricao?: string
  aoTentarNovamente?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#F7E9EA] text-perigo">
        <AlertCircle className="h-6 w-6" strokeWidth={1.6} />
      </span>
      <h3 className="mt-4 font-display text-[15px] font-medium tracking-wide text-onix-800">
        {titulo}
      </h3>
      {descricao && (
        <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-onix-400">{descricao}</p>
      )}
      {aoTentarNovamente && (
        <Botao variante="secundario" tamanho="sm" className="mt-5" onClick={aoTentarNovamente}>
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </Botao>
      )}
    </div>
  )
}

/** Carregamento de tela inteira, com o pulso da marca. */
export function CarregandoTela({ mensagem = 'Carregando' }: { mensagem?: string }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <span className="relative flex h-10 w-10">
          <span className="absolute inset-0 animate-ping rounded-full bg-marca/20" />
          <span className="relative m-auto h-2.5 w-2.5 rounded-full bg-marca" />
        </span>
        <p className="eyebrow">{mensagem}</p>
      </div>
    </div>
  )
}
