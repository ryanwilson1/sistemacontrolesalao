import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, Menu, X } from 'lucide-react'
import { useSessao } from '@/contexts'
import { AvisoDeChegada, EstadoDaConexao, FaixaDeConexao, Monograma, Sino } from '@/components/common'
import { Retrato } from '@/components/ui'
import { useQuantosEsperando, useQuantosPedidos } from '@/hooks'
import { PAPEL } from '@/constants'
import { menuVisivel, type ItemMenu } from './navegacao'
import { cn } from '@/utils/cn'

const LARGURA_MENU = 268

/**
 * Estrutura do painel.
 *
 * Desktop: menu lateral fixo. Celular: cabeçalho com menu deslizante e
 * barra inferior com os quatro destinos mais usados.
 */
export function LayoutApp() {
  const [menuAberto, setMenuAberto] = useState(false)
  const { pathname } = useLocation()
  const { ehGestor } = useSessao()

  const itens = menuVisivel(ehGestor)
  const contadores = useContadoresDoMenu(ehGestor)
  const itensCelular = itens.filter((item) => item.destaque).slice(0, 4)
  const tituloAtual = itens.find((item) => item.para === pathname)?.rotulo ?? ''

  // Navegou? O menu deslizante fecha sozinho.
  useEffect(() => setMenuAberto(false), [pathname])

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
          <Navegacao itens={itens} contadores={contadores} />
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
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
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
                <Navegacao itens={itens} contadores={contadores} />
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

        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-onix-100 bg-white/85 px-4 py-3 pt-safe backdrop-blur-lg lg:hidden">
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
          <Outlet />
        </main>
      </div>

      {/* Barra inferior — celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-onix-100 bg-white/92 pb-safe backdrop-blur-lg lg:hidden">
        <div className="flex items-stretch">
          {itensCelular.map(({ para, rotulo, icone: Icone }) => (
            <NavLink
              key={para}
              to={para}
              end={para === '/'}
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
                      layoutId="marcador-celular"
                      className="filete-ouro absolute inset-x-6 top-0 h-[2px] rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
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

  return { portal: (pedidos ?? 0) + (esperando ?? 0) }
}

function Navegacao({
  itens, contadores,
}: {
  itens: ItemMenu[]
  contadores: Record<string, number>
}) {
  return (
    <nav className="space-y-0.5 pb-2">
      {itens.map(({ para, rotulo, icone: Icone, contador }) => (
        <NavLink
          key={para}
          to={para}
          end={para === '/'}
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
                  layoutId="marcador-menu"
                  className="filete-ouro absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
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
}

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
