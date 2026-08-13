import { memo, Suspense, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, Menu, X } from 'lucide-react'
import { useSessao } from '@/contexts'
import { AvisoDeChegada, EstadoDaConexao, FaixaDeConexao, Monograma, Sino } from '@/components/common'
import { CarregandoTela } from '@/components/feedback'
import { Retrato } from '@/components/ui'
import { useQuantosEsperando, useQuantosPedidos } from '@/hooks'
import { diagnostico } from '@/services/diagnostico'
import { PAPEL } from '@/constants'
import { menuVisivel, type ItemMenu } from './navegacao'
import { cn } from '@/utils/cn'

const LARGURA_MENU = 268

/**
 * A entrada do marcador ativo — a mesma no menu e na barra inferior.
 *
 * ---------------------------------------------------------------
 * O que estava aqui antes, e por que saiu
 * ---------------------------------------------------------------
 * Os dois marcadores usavam `layoutId` com mola. `layoutId` é *shared
 * layout*: a cada navegação o Framer Motion mede o retângulo do marcador
 * que sai e o do que entra, calcula a diferença e anima o caminho.
 *
 * Medir significa `getBoundingClientRect`, e medir no meio de uma
 * navegação significa **forçar o navegador a calcular o layout antes de
 * ele estar pronto para isso** — exatamente no quadro em que a página
 * nova está montando. São dois marcadores, então são duas medições
 * forçadas por toque, dentro de duas barras `fixed` com vidro por cima.
 *
 * No iPhone é aí que a interface engasga: o toque foi registrado, a rota
 * já mudou, e o aparelho está ocupado medindo um filete de 3 pixels.
 *
 * O marcador continua existindo e continua entrando em cena. O que ele
 * não faz mais é perguntar onde estava antes — e ele não precisa saber:
 * quem olha vê o filete aparecer no item novo, não vê ele viajar.
 *
 * `opacity` e `scale` são as duas propriedades que o compositor resolve
 * sozinho, sem tocar em layout. 160ms é curto o bastante para parecer
 * imediato e longo o bastante para não parecer um piscar.
 */
const ENTRADA_DO_MARCADOR = { duration: 0.16, ease: 'easeOut' } as const

/**
 * Estrutura do painel.
 *
 * Desktop: menu lateral fixo. Celular: cabeçalho com menu deslizante e
 * barra inferior com os quatro destinos mais usados.
 */
export function LayoutApp() {
  const [menuAberto, setMenuAberto] = useState(false)
  const { pathname } = useLocation()
  const { ehGestor, soAgenda } = useSessao()

  diagnostico.contar('rendersDoLayout')

  /*
    As listas do menu não mudam entre navegações.

    `menuVisivel` filtra quinze itens e devolve um array novo a cada
    render — e o layout redesenha a cada troca de tela, a cada evento do
    tempo real e a cada contador que muda. Sem a memoização, `Navegacao`
    recebia um array com identidade nova toda vez e redesenhava os
    quinze `NavLink` com seus ícones, mesmo quando nada neles mudou.

    A dependência é o papel de quem está usando, e ele não muda enquanto
    a sessão vive.
  */
  const itens = useMemo(() => menuVisivel(ehGestor, soAgenda), [ehGestor, soAgenda])
  const itensCelular = useMemo(
    () => itens.filter((item) => item.destaque).slice(0, 4),
    [itens],
  )
  const tituloAtual = useMemo(
    () => itens.find((item) => item.para === pathname)?.rotulo ?? '',
    [itens, pathname],
  )

  // Os contadores leem pedidos e lista de espera — telas que o acesso
  // restrito não abre. Pedi-los seria erro de permissão a cada minuto.
  const contadores = useContadoresDoMenu(ehGestor && !soAgenda)

  /**
   * O toque que não deve virar navegação.
   *
   * ---------------------------------------------------------------
   * Os dois problemas que isto resolve
   * ---------------------------------------------------------------
   * **1. Tocar no item onde já se está.** O React Router aceita: empurra
   * uma entrada nova no histórico, monta a rota de novo e redesenha o
   * layout. Nada muda na tela, e todo o custo acontece. A proprietária
   * faz isso o tempo todo — é o gesto natural de quem acha que o sistema
   * não respondeu ao primeiro toque.
   *
   * **2. Tocar quatro vezes no mesmo item.** Cada toque era uma entrada
   * no histórico. Depois de uma manhã, o botão "voltar" do iPhone
   * precisava de trinta toques para sair da Agenda — e cada um deles
   * redesenhava tudo no caminho.
   *
   * `aria-current="page"` é o próprio `NavLink` quem põe, então a
   * verificação lê o estado real do roteador, não uma cópia nossa que
   * poderia divergir.
   *
   * Repare no que isto NÃO faz: não bloqueia navegação para outro
   * destino, não espera nada e não põe carregamento em lugar nenhum. Um
   * toque em Clientes durante a animação da Agenda passa direto e vence.
   */
  const aoTocarNoItem = useCallback((evento: MouseEvent<HTMLAnchorElement>) => {
    // O menu deslizante fecha AGORA, no mesmo instante do toque.
    // Deixar isso para o efeito de `pathname` custava um render extra
    // depois da navegação — o pior momento possível para pedir um.
    setMenuAberto(false)

    if (evento.currentTarget.getAttribute('aria-current') === 'page') {
      evento.preventDefault()
      diagnostico.contar('navegacoesDescartadas')
      return
    }

    diagnostico.contar('navegacoes')
  }, [])

  /*
    Rede de segurança para as navegações que não passam pelo menu — um
    aviso de chegada, um item do sino, um botão dentro da página.

    A comparação evita o render à toa: `setMenuAberto(false)` com o menu
    já fechado é descartado pelo React, mas o efeito ainda roda a cada
    navegação, e o `if` o torna literalmente gratuito.
  */
  useEffect(() => {
    if (menuAberto) setMenuAberto(false)
    // O menu não entra nas dependências de propósito: o efeito reage à
    // navegação, e reagir também à abertura o faria fechar o menu no
    // instante em que a proprietária o abriu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <div className="min-h-dvh bg-quartzo-50">
      {/* Chegou agendamento pelo portal? O aviso se anuncia sozinho. */}
      <AvisoDeChegada />

      {/* Menu lateral — desktop */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-onix-100 bg-white lg:flex"
        style={{ width: LARGURA_MENU }}
      >
        <div className="flex items-center gap-2 px-4 py-5">
          <MarcaDoStudio />
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <EstadoDaConexao />
            <Sino />
          </span>
        </div>
        <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-3">
          <Navegacao itens={itens} contadores={contadores} aoTocar={aoTocarNoItem} />
        </div>
        <div className="p-3">
          <CartaoDaSessao />
        </div>
      </aside>

      {/* Menu deslizante — celular */}
      <AnimatePresence>
        {menuAberto && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMenuAberto(false)}
              className="absolute inset-0 bg-onix-900/30 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              /*
                Mola trocada por curva.

                A mola de 380/36 leva ~450ms para assentar, e durante
                esse tempo o Framer escreve `transform` no painel a cada
                quadro. Não é caro por si — é caro por acontecer junto
                com a montagem da tela nova, que é o que a proprietária
                está de fato esperando.

                240ms com desaceleração dá a mesma sensação de peso do
                painel e devolve o processador para a página.
              */
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
              className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-white"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-5 pt-safe">
                <MarcaDoStudio />
                <button
                  onClick={() => setMenuAberto(false)}
                  className="-mr-1.5 rounded-lg p-1.5 text-onix-300"
                  aria-label="Fechar menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-3">
                <Navegacao itens={itens} contadores={contadores} aoTocar={aoTocarNoItem} />
              </div>
              <div className="p-3 pb-safe">
                <CartaoDaSessao />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Conteúdo */}
      <div className="lg:pl-[268px]">
        <FaixaDeConexao />

        <header className="vidro-barra sticky top-0 z-20 flex items-center gap-3 border-b border-onix-100 px-4 py-3 pt-safe lg:hidden">
          <button
            onClick={() => setMenuAberto(true)}
            className="relative -ml-1.5 rounded-xl p-1.5 text-onix-600 transition-colors active:bg-onix-50"
            aria-label={
              contadores.portal > 0
                ? `Abrir menu — ${contadores.portal} pedido(s) do portal`
                : 'Abrir menu'
            }
          >
            <Menu className="h-5 w-5" />
            {/* No celular o menu fica fechado: sem este ponto, um pedido
                do portal ficaria invisível até alguém abrir por acaso. */}
            {contadores.portal > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-marca ring-2 ring-white" />
            )}
          </button>
          <MarcaDoStudio compacta />
          <span className="ml-auto truncate font-display text-[12px] uppercase tracking-[0.16em] text-onix-400">
            {tituloAtual}
          </span>
          <EstadoDaConexao />
          <Sino />
        </header>

        <main className="mx-auto w-full max-w-[1320px] px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
          {/*
            A fronteira de carregamento é AQUI, e não na raiz das rotas.

            Enquanto o pedaço de uma página baixa, só este miolo mostra
            o carregamento. O cabeçalho com o botão do menu, a barra
            inferior e o menu lateral continuam montados e clicáveis —
            que é a diferença entre "a tela está carregando" e "o
            aplicativo sumiu".

            Antes, com a fronteira na raiz, o layout inteiro desmontava
            a cada navegação: os botões deixavam de existir, e tocá-los
            não fazia nada. Era a causa de a proprietária precisar
            tocar duas, três, quatro vezes.
          */}
          <Suspense fallback={<CarregandoTela />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Barra inferior — celular */}
      <nav className="vidro-barra fixed inset-x-0 bottom-0 z-30 border-t border-onix-100 pb-safe lg:hidden">
        <div className="flex items-stretch">
          {itensCelular.map(({ para, rotulo, icone: Icone }) => (
            <NavLink
              key={para}
              to={para}
              end={para === '/'}
              onClick={aoTocarNoItem}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors',
                  isActive ? 'text-onix-900' : 'text-onix-400',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      /*
                        Sem `layoutId`: o filete aparece no destino em vez
                        de viajar até ele. `scaleX` cresce do centro, o
                        que dá o mesmo ar de "assentou aqui" sem pedir ao
                        navegador que meça coisa alguma.
                      */
                      initial={{ opacity: 0, scaleX: 0.4 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={ENTRADA_DO_MARCADOR}
                      className="filete-ouro absolute inset-x-6 top-0 h-[2px] rounded-full"
                    />
                  )}
                  <Icone className={cn('h-[21px] w-[21px]', isActive && 'text-marca')} strokeWidth={1.8} />
                  {rotulo}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function MarcaDoStudio({ compacta }: { compacta?: boolean }) {
  const { studio } = useSessao()

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Monograma />
      {!compacta && (
        <span className="min-w-0">
          <span className="block truncate whitespace-nowrap font-display text-[12px] font-medium uppercase tracking-[0.06em] text-onix-800">
            {studio?.nome.split(' ').slice(0, 2).join(' ') ?? 'Studio'}
          </span>
          <span className="block truncate whitespace-nowrap text-[9.5px] uppercase tracking-[0.1em] text-onix-300">
            Studio de beleza
          </span>
        </span>
      )}
    </div>
  )
}

/**
 * Números do menu.
 *
 * Ficam num hook só para as consultas acontecerem uma vez por render do
 * layout, e não uma vez por item — o menu redesenha a cada navegação.
 */
function useContadoresDoMenu(ehGestor: boolean) {
  const { dados: pedidos } = useQuantosPedidos({ ativa: ehGestor })
  const { dados: esperando } = useQuantosEsperando({ ativa: ehGestor })

  /*
    O objeto precisa ser estável.

    Ele é a única propriedade de `Navegacao` que muda de identidade, e
    sem a memoização ele mudava a **cada render do layout** — o que
    anularia o `memo` abaixo e faria os quinze itens redesenharem em toda
    navegação, que é justamente o que estamos evitando.
  */
  return useMemo(
    () => ({ portal: (pedidos ?? 0) + (esperando ?? 0) }),
    [pedidos, esperando],
  )
}

/**
 * A lista do menu.
 *
 * `memo` aqui tem benefício medível, ao contrário de memoizar por
 * hábito: são quinze `NavLink`, cada um com um ícone SVG do Lucide e uma
 * função de classe avaliada por item. Antes ela redesenhava inteira
 * sempre que qualquer coisa mexia no layout — um contador do portal, um
 * evento do tempo real, a faixa de conexão aparecendo.
 *
 * Agora só redesenha quando os itens ou os contadores mudam de verdade.
 * O item ativo continua acompanhando a rota porque o `NavLink` assina o
 * roteador por conta própria, por baixo do `memo`.
 */
const Navegacao = memo(function Navegacao({
  itens, contadores, aoTocar,
}: {
  itens: ItemMenu[]
  contadores: Record<string, number>
  aoTocar: (evento: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <nav className="space-y-0.5 pb-2">
      {itens.map(({ para, rotulo, icone: Icone, contador }) => (
        <NavLink
          key={para}
          to={para}
          end={para === '/'}
          onClick={aoTocar}
          className={({ isActive }) =>
            cn(
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors duration-150',
              isActive
                ? 'bg-quartzo-100 font-medium text-onix-900'
                : 'text-onix-500 hover:bg-onix-50 hover:text-onix-800',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  /*
                    `y: '-50%'` está no motion, e não como `-translate-y-1/2`
                    do Tailwind, por necessidade: o Framer escreve
                    `transform` inline e apagaria a classe, deixando o
                    filete fora do centro. Aqui as duas coisas — centrar e
                    animar — moram na mesma propriedade.
                  */
                  initial={{ opacity: 0, y: '-50%', scaleY: 0.5 }}
                  animate={{ opacity: 1, y: '-50%', scaleY: 1 }}
                  transition={ENTRADA_DO_MARCADOR}
                  className="filete-ouro absolute left-0 top-1/2 h-6 w-[3px] rounded-full"
                />
              )}
              <Icone
                className={cn(
                  'h-[18px] w-[18px] shrink-0',
                  isActive ? 'text-marca' : 'text-onix-300 group-hover:text-onix-500',
                )}
                strokeWidth={1.8}
              />
              {rotulo}

              {contador && (contadores[contador] ?? 0) > 0 && (
                <span className="tabular ml-auto grid h-5 min-w-[20px] place-items-center rounded-full bg-marca px-1.5 text-[11px] font-medium text-marca-contraste">
                  {contadores[contador]! > 99 ? '99+' : contadores[contador]}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
})

function CartaoDaSessao() {
  const { nome, sessao, sair } = useSessao()

  return (
    <div className="flex items-center gap-3 rounded-xl border border-onix-100 bg-quartzo-50 p-2.5">
      <Retrato nome={nome} tamanho="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight text-onix-800">{nome || 'Você'}</p>
        <p className="truncate text-[11px] leading-tight text-onix-400">
          {sessao ? PAPEL[sessao.papel] : ''}
        </p>
      </div>
      <button
        onClick={() => void sair()}
        className="shrink-0 rounded-lg p-1.5 text-onix-300 transition-colors hover:bg-white hover:text-perigo"
        aria-label="Sair"
        title="Sair"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}
