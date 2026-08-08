import { lazy, Suspense } from 'react'
import {
  createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider,
} from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { LayoutApp } from '@/layouts'
import { CarregandoTela } from '@/components/feedback'
import { useTempoReal } from '@/hooks/useTempoReal'
import { Protegida, SomenteGestor, SomenteVisitante } from './guardas'

/**
 * Raiz de todas as rotas.
 *
 * Existe por um motivo prático do roteador de dados: `useBlocker`,
 * `useNavigate` e companhia só funcionam **dentro** da árvore de rotas.
 * Com `<BrowserRouter>` bastava envolver; aqui é preciso um elemento
 * que já esteja lá dentro.
 *
 * O tempo real subiu para cá pela mesma razão — ele precisa conviver
 * com o roteador, e este é o primeiro ponto em que isso é verdade.
 */
function Contorno() {
  // Um lugar só no sistema inteiro: daqui para baixo, qualquer gravação
  // — desta aba, de outra aba ou de outro aparelho — chega às telas
  // abertas sem ninguém recarregar nada.
  useTempoReal()

  return <Outlet />
}

/**
 * Cada página entra em seu próprio pacote.
 * O link público de agendamento não baixa uma linha do painel.
 */
const Entrar         = lazy(() => import('@/pages/acesso/Entrar'))
const NovaSenha      = lazy(() => import('@/pages/acesso/NovaSenha'))
const Painel         = lazy(() => import('@/pages/painel/Painel'))
const Agenda         = lazy(() => import('@/pages/agenda/Agenda'))
const Clientes       = lazy(() => import('@/pages/clientes/Clientes'))
const FichaCliente   = lazy(() => import('@/pages/clientes/FichaCliente'))
const Servicos       = lazy(() => import('@/pages/servicos/Servicos'))
const Estoque        = lazy(() => import('@/pages/estoque/Estoque'))
const Financeiro     = lazy(() => import('@/pages/financeiro/Financeiro'))
const Caixa          = lazy(() => import('@/pages/caixa/Caixa'))
const Cupons         = lazy(() => import('@/pages/cupons/Cupons'))
const Fidelidade     = lazy(() => import('@/pages/fidelidade/Fidelidade'))
const Relatorios     = lazy(() => import('@/pages/relatorios/Relatorios'))
const Configuracoes  = lazy(() => import('@/pages/configuracoes/Configuracoes'))
const Backup         = lazy(() => import('@/pages/backup/Backup'))
const Lembretes      = lazy(() => import('@/pages/lembretes/Lembretes'))
const Assistente     = lazy(() => import('@/pages/assistente/Assistente'))
const Portal         = lazy(() => import('@/pages/portal/Portal'))
const Agendamento    = lazy(() => import('@/pages/agendamento/Agendamento'))
const MeuHorario     = lazy(() => import('@/pages/agendamento/MeuHorario'))
const NaoEncontrada  = lazy(() => import('@/pages/NaoEncontrada'))

/**
 * As rotas.
 *
 * Declaradas em JSX e convertidas para o formato de dados do React
 * Router. A troca de `<BrowserRouter><Routes>` para `createBrowserRouter`
 * não é preferência de estilo: `useBlocker` — o que segura a navegação
 * quando há formulário preenchido e não salvo — **só existe no roteador
 * de dados**. Com o roteador antigo ele lança em tempo de execução.
 *
 * O desenho das rotas continua idêntico. Só o invólucro mudou.
 */
const rotas = createRoutesFromElements(
  <Route element={<Suspense fallback={<CarregandoTela />}><Contorno /></Suspense>}>
        {/* Portal da cliente — sem sessão, em pacote próprio */}
        <Route path="/agendar/:identificador" element={<Agendamento />} />
        <Route path="/agendar/:identificador/meu-horario" element={<MeuHorario />} />

        {/* Acesso */}
        <Route path="/entrar" element={<SomenteVisitante><Entrar /></SomenteVisitante>} />

        {/* Destino do link enviado por e-mail. Fora de `SomenteVisitante`
            de propósito: o link já abre sessão, e a guarda mandaria a
            pessoa para o painel sem deixá-la trocar a senha. */}
        <Route path="/nova-senha" element={<NovaSenha />} />

        {/* Painel */}
        <Route element={<Protegida><LayoutApp /></Protegida>}>
          <Route index element={<Painel />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/:id" element={<FichaCliente />} />
          <Route path="servicos" element={<Servicos />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="financeiro" element={<SomenteGestor><Financeiro /></SomenteGestor>} />
          <Route path="caixa" element={<Caixa />} />
          <Route path="cupons" element={<SomenteGestor><Cupons /></SomenteGestor>} />
          <Route path="fidelidade" element={<SomenteGestor><Fidelidade /></SomenteGestor>} />
          <Route path="relatorios" element={<SomenteGestor><Relatorios /></SomenteGestor>} />
          <Route path="configuracoes" element={<SomenteGestor><Configuracoes /></SomenteGestor>} />
          <Route path="backup" element={<SomenteGestor><Backup /></SomenteGestor>} />
          <Route path="lembretes" element={<Lembretes />} />
          <Route path="portal" element={<SomenteGestor><Portal /></SomenteGestor>} />
          <Route path="assistente" element={<Assistente />} />
          <Route path="*" element={<NaoEncontrada />} />
        </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>,
)

export const roteador = createBrowserRouter(rotas)

export function Rotas() {
  return <RouterProvider router={roteador} />
}
