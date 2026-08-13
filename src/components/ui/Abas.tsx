import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

export interface Aba<T extends string> {
  valor: T
  rotulo: string
  contador?: number
}

/**
 * Abas com marcador deslizante.
 *
 * `idAnimacao` mantém instâncias diferentes independentes — sem isso,
 * duas abas na mesma tela disputam o marcador.
 *
 * ---------------------------------------------------------------
 * Por que existe todo o cuidado com o corte à direita
 * ---------------------------------------------------------------
 * Num celular estreito, quatro abas não cabem. A lista rolava desde
 * sempre — mas rolava **sem parecer que rolava**: a última aba
 * aparecia cortada no meio da palavra ("Conf…"), sem barra, sem
 * sombra, sem nada.
 *
 * Quem olha aquilo não conclui "preciso arrastar". Conclui que a tela
 * travou. Foi exatamente o relato que recebemos: *"está tudo travado
 * neste campo"* — e o campo estava funcionando.
 *
 * Duas correções, as duas sobre percepção e não sobre comportamento:
 *
 *   1. uma sombra suave na borda quando há mais conteúdo, que aparece
 *      e some conforme a rolagem;
 *   2. a aba ativa entra em cena sozinha ao ser escolhida, para nunca
 *      ficar escondida fora da área visível.
 */
export function Abas<T extends string>({
  abas, ativa, aoTrocar, idAnimacao: _idAnimacao, className,
}: {
  abas: Aba<T>[]
  ativa: T
  aoTrocar: (valor: T) => void
  /**
   * Sobra da era do marcador compartilhado, mantida na assinatura de
   * propósito: as telas continuam passando o valor, e removê-lo daqui
   * obrigaria a tocar em cada chamador nesta rodada final — risco sem
   * ganho. Sem `layoutId`, instâncias diferentes já não disputam nada.
   */
  idAnimacao?: string
  className?: string
}) {
  const trilho = useRef<HTMLDivElement>(null)
  const [cortaNoInicio, setCortaNoInicio] = useState(false)
  const [cortaNoFim, setCortaNoFim] = useState(false)

  /** Há conteúdo escondido de algum lado? */
  const medir = () => {
    const el = trilho.current
    if (!el) return
    setCortaNoInicio(el.scrollLeft > 4)
    setCortaNoFim(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    medir()
    const el = trilho.current
    if (!el) return

    // `ResizeObserver` cobre a virada de tela do celular, em que a
    // largura muda sem nenhuma rolagem acontecer.
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    window.addEventListener('resize', medir)

    return () => {
      observador.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [abas.length])

  /*
    A aba escolhida vem para a área visível — mas não na montagem.

    ---------------------------------------------------------------
    A rolagem que brigava com a navegação
    ---------------------------------------------------------------
    O efeito rodava também na primeira renderização, ou seja, **toda vez
    que uma tela com abas era aberta**. E `html` tem
    `scroll-behavior: smooth`, então `scrollIntoView` ali não era um
    ajuste: era uma animação de rolagem começando no exato quadro em que
    a página estava montando.

    Pior, `block: 'nearest'` sobe pelos ancestrais até achar quem rola —
    e num celular quem rola é a página inteira. Abrir a Agenda podia
    empurrar a tela alguns pixels sozinha, competindo com a montagem da
    grade e com a animação de entrada. Tocar em duas telas com abas em
    sequência rápida deixava duas rolagens animadas disputando a mesma
    página.

    Na montagem não há o que corrigir: a aba ativa é a primeira, e ela já
    está visível. O ajuste só é útil quando a pessoa TROCA de aba — e aí
    é resposta a um toque dela, no momento certo.
  */
  const jaMontou = useRef(false)

  useEffect(() => {
    if (!jaMontou.current) {
      jaMontou.current = true
      return
    }

    const el = trilho.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!el) return

    // Quem pediu menos movimento não recebe rolagem animada — e a
    // rolagem instantânea custa um quadro em vez de vinte.
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    el.scrollIntoView({
      behavior: suave ? 'smooth' : 'auto',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [ativa])

  return (
    <div className={cn('relative', className)}>
      <div
        ref={trilho}
        role="tablist"
        onScroll={medir}
        className="scroll-fino -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5"
      >
        {abas.map((aba) => {
          const selecionada = aba.valor === ativa
          return (
            <button
              key={aba.valor}
              role="tab"
              aria-selected={selecionada}
              onClick={() => aoTrocar(aba.valor)}
              className={cn(
                'relative shrink-0 whitespace-nowrap rounded-lg px-3.5 text-[13.5px] font-medium transition-colors',
                // 44px de altura: alvo de toque confortável no celular.
                'min-h-[44px] py-2',
                selecionada ? 'text-onix-900' : 'text-onix-400 hover:text-onix-700',
              )}
            >
              {selecionada && (
                <motion.span
                  /*
                    Sem `layoutId` — o mesmo raciocínio do LayoutApp.

                    O marcador compartilhado obrigava o Framer a medir a
                    pílula que sai e a que entra (`getBoundingClientRect`
                    dos dois lados) para animar a viagem entre elas. Nas
                    abas isso acontece no pior momento: a troca de aba
                    costuma montar conteúdo novo logo abaixo — as seções
                    do Portal, as visões da Agenda — e a medição forçada
                    cai exatamente no quadro dessa montagem.

                    Agora a pílula nasce no destino: opacity + scale,
                    resolvidos pelo compositor, 160ms. O olho vê o fundo
                    assentar na aba nova; o que ele não vê — a viagem —
                    era o que custava caro.
                  */
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="absolute inset-0 rounded-lg bg-quartzo-100"
                />
              )}
              <span className="relative">
                {aba.rotulo}
                {aba.contador !== undefined && (
                  <span className={cn('tabular ml-1.5', selecionada ? 'text-onix-500' : 'text-onix-300')}>
                    {aba.contador}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/*
        As sombras das bordas. `pointer-events-none` é essencial: sem
        isso elas roubariam o toque justamente na região que a pessoa
        precisa arrastar para ver o resto.
      */}
      {cortaNoInicio && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-quartzo-50 to-transparent"
        />
      )}
      {cortaNoFim && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-quartzo-50 to-transparent"
        />
      )}
    </div>
  )
}
