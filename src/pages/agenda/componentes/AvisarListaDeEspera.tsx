import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, Users, X } from 'lucide-react'
import { Botao } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useAvisarInteressadas } from '@/hooks'
import { telefone as formatarTelefone } from '@/utils/formato'
import { dataRelativa, hora } from '@/utils/datas'
import type { EntradaListaEspera } from '@/types'

/**
 * Oferta de aviso à lista de espera.
 *
 * Aparece logo depois de um cancelamento, e só quando existe alguém
 * esperando por aquele horário. É o momento certo: a vaga acabou de
 * abrir e ainda dá tempo de preencher.
 *
 * Perguntar em vez de disparar sozinho é deliberado. Um horário
 * cancelado às vezes é um horário que a proprietária quer para si — um
 * atraso a recuperar, um almoço que não aconteceu. Mandar mensagem para
 * doze clientes sem perguntar transformaria essa pausa em compromisso.
 */
export function AvisarListaDeEspera({
  aberto, aoFechar, interessadas, vaga,
}: {
  aberto: boolean
  aoFechar: () => void
  interessadas: EntradaListaEspera[]
  vaga: { servicoId: string; profissionalId: string; inicio: string; fim: string } | null
}) {
  const avisar = useAvisarInteressadas()
  const aviso = useAviso()

  const enviar = async () => {
    if (!vaga) return

    try {
      const resultado = await avisar.executar({ vaga, entradas: interessadas })

      if (resultado.avisadas === 0) {
        aviso.info('Ninguém foi avisado', 'As clientes da fila estão sem telefone cadastrado.')
      } else {
        aviso.sucesso(
          `${resultado.avisadas} cliente(s) avisada(s)`,
          'As mensagens entraram na fila de lembretes. A primeira que confirmar fica com a vaga.',
        )
      }
      aoFechar()
    } catch {
      aviso.erro('Não foi possível avisar', 'Tente novamente pela tela do Portal.')
    }
  }

  return (
    <AnimatePresence>
      {aberto && interessadas.length > 0 && (
        <div className="fixed inset-0 z-[70] grid place-items-end p-4 sm:place-items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={aoFechar}
            className="absolute inset-0 bg-onix-900/35 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-alta"
            role="dialog"
            aria-modal="true"
          >
            <button
              onClick={aoFechar}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-onix-300 transition-colors hover:bg-onix-50 hover:text-onix-600"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-6 pb-5 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ouro-100 text-ouro-600">
                <Users className="h-6 w-6" strokeWidth={1.6} />
              </span>

              <h2 className="mt-4 font-display text-[19px] font-light tracking-tight text-onix-900">
                {interessadas.length === 1
                  ? 'Uma cliente aguarda este horário'
                  : `${interessadas.length} clientes aguardam este horário`}
              </h2>

              {vaga && (
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-onix-400">
                  {dataRelativa(vaga.inicio)} às {hora(vaga.inicio)} — a vaga acabou de abrir.
                </p>
              )}
            </div>

            <ul className="scroll-fino max-h-[220px] overflow-y-auto border-y border-onix-100 bg-quartzo-50">
              {interessadas.map((entrada) => (
                <li
                  key={entrada.id}
                  className="flex items-center gap-3 border-b border-onix-100/60 px-5 py-2.5 last:border-0"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white font-display text-[13px] text-onix-500 shadow-carta">
                    {entrada.nome.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-onix-800">
                      {entrada.nome}
                    </span>
                    <span className="block text-[12px] text-onix-400">
                      {formatarTelefone(entrada.telefone)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-3 p-5">
              <Botao
                variante="ouro" tamanho="lg" bloco
                onClick={() => void enviar()}
                carregando={avisar.salvando}
              >
                <BellRing className="h-4 w-4" /> Avisar todas
              </Botao>

              <Botao variante="fantasma" bloco onClick={aoFechar}>
                Agora não
              </Botao>

              <p className="text-center text-[12px] leading-relaxed text-onix-400">
                A primeira que confirmar fica com a vaga. As demais continuam na fila.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
