import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { APP } from '@/constants'
import { FileteDeOuro, Monograma } from '@/components/common'

/**
 * Moldura das telas de acesso.
 *
 * O painel esquerdo é o quartzo da fachada, visto uma vez por sessão.
 * No celular ele some e vira só o monograma — a tela pequena não tem
 * espaço para ornamento.
 */
export function LayoutAcesso({
  titulo, subtitulo, children, rodape,
}: {
  titulo: string
  subtitulo?: string
  children: ReactNode
  rodape?: ReactNode
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-quartzo lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_20%,rgba(255,255,255,.55),transparent_60%)]" />

        <div className="relative flex h-full flex-col justify-between p-12">
          <span className="font-display text-[11px] uppercase tracking-[0.32em] text-onix-500">
            {APP.nome}
          </span>

          <div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              className="font-assinatura text-[92px] italic leading-none text-ouro-500 drop-shadow-[0_1px_0_rgba(255,255,255,.6)]"
            >
              {APP.monograma}
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
              className="mt-6 font-display text-[15px] uppercase leading-relaxed tracking-[0.3em] text-onix-700"
            >
              Emely Barbosa
              <span className="mt-2 block text-[11px] tracking-[0.4em] text-onix-500">
                Studio de beleza
              </span>
            </motion.h2>
          </div>

          <FileteDeOuro className="w-24" />
        </div>
      </aside>

      <main className="flex flex-col justify-center bg-white px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <Monograma tamanho="lg" />
            <span>
              <span className="block font-display text-[12px] uppercase tracking-[0.18em] text-onix-800">
                Emely Barbosa
              </span>
              <span className="block text-[10px] uppercase tracking-[0.22em] text-onix-300">
                Studio de beleza
              </span>
            </span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <h1 className="font-display text-[26px] font-light leading-tight tracking-tight text-onix-900 sm:text-[28px]">
              {titulo}
            </h1>
            {subtitulo && (
              <p className="mt-2 text-[14px] leading-relaxed text-onix-400">{subtitulo}</p>
            )}

            <div className="mt-8">{children}</div>

            {rodape && <div className="mt-7 text-center text-[13.5px] text-onix-400">{rodape}</div>}
          </motion.div>
        </div>
      </main>
    </div>
  )
}
