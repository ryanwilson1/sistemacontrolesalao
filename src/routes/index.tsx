import { lazy, Suspense, type ComponentType } from 'react'
import {
  createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider,
} from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { LayoutApp } from '@/layouts'
import { CarregandoTela } from '@/components/feedback'
import { useTempoReal } from '@/hooks/useTempoReal'
import { ExigeAcessoCompleto, Protegida, SomenteGestor, SomenteVisitante } from './guardas'

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
 * `lazy` que sobrevive a uma publicação nova.
 *
 * ---------------------------------------------------------------
 * O problema
 * ---------------------------------------------------------------
 * Cada página vira um arquivo com o conteúdo no nome —
 * `Assistente-D4L5MxzY.js`. Publicar de novo gera nomes novos e apaga
 * os antigos.
 *
 * Quem estava com o sistema aberto durante a publicação continua com o
 * `index.html` velho na memória, apontando para arquivos que não
 * existem mais. Clicar em Assistente ou Financeiro devolve 404, e o
 * React Router mostra a tela de erro:
 *
 *   Failed to fetch dynamically imported module
 *
 * Não é falha do código nem do servidor. É o preço de ter cada página
 * em seu próprio pacote — e acontece TODA vez que se publica com
 * alguém usando. A proprietária ia ver isso, sem entender, e concluir
 * que o sistema quebrou.
 *
 * ---------------------------------------------------------------
 * A correção
 * ---------------------------------------------------------------
 * Falhou ao buscar o pedaço? Recarrega a página uma vez. O
 * `index.html` novo chega, aponta para os arquivos certos, e a pessoa
 * cai na tela que pediu.
 *
 * A marca no `sessionStorage` é o que impede o laço infinito: se a
 * recarga não resolver — servidor fora, rede caída —, o erro sobe
 * normalmente e o `LimiteDeErro` mostra a mensagem. Recarregar duas
 * vezes seria trocar um erro visível por uma tela piscando para
 * sempre, que é pior.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyComRecarga<T extends { default: ComponentType<any> }>(
  importar: () => Promise<T>,
) {
  return lazy(() =>
    importar().catch((falha) => {
      const CHAVE = 'studio:recarregou-por-pacote-ausente'
      const jaTentou = sessionStorage.getItem(CHAVE)

      if (!jaTentou) {
        sessionStorage.setItem(CHAVE, '1')
        window.location.reload()
        // A recarga não é instantânea; esta promessa nunca resolve, e
        // é o certo: resolver mostraria a tela de erro por um instante
        // antes de a página trocar.
        return new Promise<T>(() => {})
      }

      sessionStorage.removeItem(CHAVE)
      throw falha
    }),
  )
}

/**
 * Cada página entra em seu próprio pacote.
 * O link público de agendamento não baixa uma linha do painel.
 */
const Entrar         = lazyComRecarga(() => import('@/pages/acesso/Entrar'))
const NovaSenha      = lazyComRecarga(() => import('@/pages/acesso/NovaSenha'))
const Painel         = lazyComRecarga(() => import('@/pages/painel/Painel'))
const Agenda         = lazyComRecarga(() => import('@/pages/agenda/Agenda'))
const Clientes       = lazyComRecarga(() => import('@/pages/clientes/Clientes'))
const FichaCliente   = lazyComRecarga(() => import('@/pages/clientes/FichaCliente'))
const Servicos       = lazyComRecarga(() => import('@/pages/servicos/Servicos'))
const Estoque        = lazyComRecarga(() => import('@/pages/estoque/Estoque'))
const Financeiro     = lazyComRecarga(() => import('@/pages/financeiro/Financeiro'))
const Caixa          = lazyComRecarga(() => import('@/pages/caixa/Caixa'))
const Cupons         = lazyComRecarga(() => import('@/pages/cupons/Cupons'))
const Fidelidade     = lazyComRecarga(() => import('@/pages/fidelidade/Fidelidade'))
const Relatorios     = lazyComRecarga(() => import('@/pages/relatorios/Relatorios'))
const Configuracoes  = lazyComRecarga(() => import('@/pages/configuracoes/Configuracoes'))
const Backup         = lazyComRecarga(() => import('@/pages/backup/Backup'))
const Lembretes      = lazyComRecarga(() => import('@/pages/lembretes/Lembretes'))
const Assistente     = lazyComRecarga(() => import('@/pages/assistente/Assistente'))
const Portal         = lazyComRecarga(() => import('@/pages/portal/Portal'))
const Agendamento    = lazyComRecarga(() => import('@/pages/agendamento/Agendamento'))
const MeuHorario     = lazyComRecarga(() => import('@/pages/agendamento/MeuHorario'))
const NaoEncontrada  = lazyComRecarga(() => import('@/pages/NaoEncontrada'))

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
          {/*
            A agenda fica fora da guarda seguinte de propósito: é a
            única tela que o acesso restrito enxerga, e é para cá que
            ele é mandado quando tenta qualquer outra.
          */}
          <Route path="agenda" element={<Agenda />} />

          {/*
            Tudo o mais exige acesso completo.

            Agrupado numa rota-mãe em vez de repetir a guarda em quinze
            linhas. A diferença não é de estilo: com a guarda repetida,
            a tela nova que alguém acrescentar amanhã nasce **aberta**,
            e ninguém percebe até a pessoa errada abri-la. Aqui ela
            nasce fechada, que é o padrão certo para uma decisão de
            acesso.
          */}
          <Route element={<ExigeAcessoCompleto><Outlet /></ExigeAcessoCompleto>}>
            <Route index element={<Painel />} />
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
          </Route>

          <Route path="*" element={<NaoEncontrada />} />
        </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>,
)

export const roteador = createBrowserRouter(rotas)

export function Rotas() {
  return <RouterProvider router={roteador} />
}
