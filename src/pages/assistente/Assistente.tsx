import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Send, Sparkles } from 'lucide-react'
import { CabecalhoPagina } from '@/components/common'
import { Botao, Carta, Entrada } from '@/components/ui'
import { usePerguntar } from '@/hooks'
import { SUGESTOES, interpretador } from '@/services'
import { novoId } from '@/utils/id'
import { hora } from '@/utils/datas'
import { cn } from '@/utils/cn'
import type { Mensagem } from '@/services'

/**
 * Assistente do studio.
 *
 * Responde a partir dos dados reais — os mesmos serviços que alimentam
 * as telas. Por isso nunca contradiz o painel, e por isso também só
 * responde sobre o que existe aqui dentro.
 */
export default function Assistente() {
  const perguntar = usePerguntar()
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens, perguntar.salvando])

  const enviar = async (pergunta: string) => {
    const limpa = pergunta.trim()
    if (!limpa || perguntar.salvando) return

    const agora = new Date().toISOString()
    setMensagens((atuais) => [
      ...atuais,
      { id: novoId(), autor: 'pessoa', texto: limpa, em: agora },
    ])
    setTexto('')

    const resposta = await perguntar.executar(limpa)

    setMensagens((atuais) => [
      ...atuais,
      {
        id: novoId(),
        autor: 'assistente',
        texto: resposta.texto,
        resposta,
        em: new Date().toISOString(),
      },
    ])
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Assistente"
        titulo="Como posso ajudar?"
        descricao="Pergunte como quiser. Respondo com os dados reais do seu salão."
      />

      <div className="mx-auto flex max-w-2xl flex-col">
        {/* Conversa */}
        <div className="min-h-[42vh] space-y-3">
          {mensagens.length === 0 && (
            <Carta>
              <div className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ouro-100 text-ouro-600">
                  <Sparkles className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] leading-relaxed text-onix-700">
                    Oi! 😊 Posso te ajudar com a agenda, as clientes, os serviços
                    e as contas do salão. Escolha uma pergunta abaixo ou escreva
                    a sua — respondo com os números de verdade daqui.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3.5">
                {SUGESTOES.map((grupo) => (
                  <div key={grupo.grupo}>
                    <p className="eyebrow mb-1.5">{grupo.grupo}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {grupo.perguntas.map((pergunta) => (
                        <button
                          key={pergunta}
                          onClick={() => void enviar(pergunta)}
                          className="rounded-lg border border-onix-200 bg-white px-2.5 py-1.5 text-[12.5px] text-onix-600 transition-colors hover:border-marca hover:text-onix-900"
                        >
                          {pergunta}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Carta>
          )}

          <AnimatePresence initial={false}>
            {mensagens.map((mensagem) => (
              <motion.div
                key={mensagem.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
                className={cn('flex', mensagem.autor === 'pessoa' ? 'justify-end' : 'justify-start')}
              >
                {mensagem.autor === 'pessoa' ? (
                  <p className="max-w-[80%] rounded-2xl rounded-br-md bg-onix-800 px-4 py-2.5 text-[14px] leading-relaxed text-white">
                    {mensagem.texto}
                  </p>
                ) : (
                  <div className="w-full max-w-[92%] rounded-2xl rounded-bl-md border border-onix-100 bg-white p-4 shadow-carta">
                    <div className="flex gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ouro-100 text-ouro-600">
                        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </span>
                      <p className="min-w-0 text-[14px] leading-relaxed text-onix-700">
                        {mensagem.texto}
                      </p>
                    </div>

                    {!!mensagem.resposta?.destaques.length && (
                      <ul className="mt-3.5 space-y-1.5 border-t border-onix-50 pt-3.5">
                        {mensagem.resposta.destaques.map((destaque, indice) => (
                          <li
                            key={`${destaque.rotulo}-${indice}`}
                            className="flex items-baseline justify-between gap-3 text-[13px]"
                          >
                            <span className="min-w-0 truncate text-onix-600">{destaque.rotulo}</span>
                            <span className="shrink-0 text-right">
                              <span className="tabular font-medium text-onix-900">
                                {destaque.valor}
                              </span>
                              {destaque.detalhe && (
                                <span className="ml-1.5 text-[11.5px] text-onix-300">
                                  {destaque.detalhe}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {mensagem.resposta?.destino && (
                      <Link
                        to={mensagem.resposta.destino}
                        className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-onix-600 transition-colors hover:text-onix-900"
                      >
                        {mensagem.resposta.rotuloDestino}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}

                    <p className="tabular mt-3 text-[11px] text-onix-300">{hora(mensagem.em)}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {perguntar.salvando && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-onix-100 bg-white px-4 py-3 shadow-carta">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-onix-300"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={fim} />
        </div>

        {/* Campo de pergunta */}
        <div className="sticky bottom-[76px] mt-4 lg:bottom-4">
          <div className="flex gap-2 rounded-2xl border border-onix-100 bg-white p-2 shadow-carta">
            <Entrada
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void enviar(texto)
              }}
              placeholder="Ex.: quanto vendi hoje?"
              className="border-0 shadow-none focus:ring-0"
            />
            <Botao
              variante="ouro"
              tamanho="icone"
              onClick={() => void enviar(texto)}
              disabled={!texto.trim() || perguntar.salvando}
              aria-label="Enviar pergunta"
            >
              <Send className="h-4 w-4" />
            </Botao>
          </div>

          <p className="mt-2 text-center text-[11.5px] text-onix-300">
            Interpretação {interpretador.remoto ? 'remota' : 'local'} · as respostas vêm
            dos dados deste aparelho
          </p>
        </div>
      </div>
    </>
  )
}
