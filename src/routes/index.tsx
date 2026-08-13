import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react'
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
 * ---------------------------------------------------------------
 * Por que o `Suspense` saiu daqui
 * ---------------------------------------------------------------
 * Havia **um único** `Suspense` neste ponto, envolvendo `Contorno` e,
 * por consequência, o `LayoutApp` inteiro. Toda navegação para uma
 * página ainda não baixada suspendia a árvore toda:
 *
 *   1. o app inteiro sumia e virava um spinner de tela cheia;
 *   2. o cabeçalho, o menu e a barra inferior **deixavam de existir** —
 *      tocar neles não fazia nada, porque não havia neles o que tocar;
 *   3. quando o pedaço chegava, o layout **remontava do zero**: duas
 *      conferências de conexão, a sincronia do sino, a varredura de
 *      chegadas do portal e os contadores do menu, tudo de novo;
 *   4. `useTempoReal` mora aqui — então a inscrição do Realtime era
 *      destruída e recriada a cada troca de tela.
 *
 * Era a explicação de "o botão não responde no primeiro toque". O
 * botão respondia; ele apenas não estava mais na tela.
 *
 * Agora `Contorno` não suspende. Quem suspende é o miolo: o `<Outlet />`
 * dentro do `LayoutApp` (a moldura fica de pé enquanto a página carrega)
 * e cada rota pública, que não tem moldura para preservar.
 */
function Contorno() {
  // Um lugar só no sistema inteiro: daqui para baixo, qualquer gravação
  // — desta aba, de outra aba ou de outro aparelho — chega às telas
  // abertas sem ninguém recarregar nada.
  useTempoReal()

  return <Outlet />
}

/** Fronteira de carregamento para as telas sem moldura (portal, acesso). */
function Tela({ children }: { children: ReactNode }) {
  return <Suspense fallback={<CarregandoTela />}>{children}</Suspense>
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
 * alguém usando.
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
 * normalmente e o `LimiteDeErro` mostra a mensagem.
 *
 * O `importar` é devolvido junto para o pré-carregamento abaixo poder
 * chamá-lo sem duplicar a lista de páginas — duas listas divergem, e a
 * que divergisse deixaria uma tela de fora sem ninguém notar.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyComRecarga<T extends { default: ComponentType<any> }>(
  importar: () => Promise<T>,
) {
  const componente = lazy(() =>
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

  return Object.assign(componente, { precarregar: importar })
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
 * As quatro telas do dia a dia, baixadas logo depois do login.
 *
 * ---------------------------------------------------------------
 * Por que pré-carregar em vez de desligar o `lazy`
 * ---------------------------------------------------------------
 * Desligar devolveria um pacote único que o portal público também
 * teria de baixar — a cliente que abre o link do Instagram pagaria por
 * Relatórios, Backup e Estoque para escolher um horário.
 *
 * Pré-carregar tem o efeito prático que interessa (a troca de tela é
 * instantânea porque o pedaço já está na memória) sem o custo. E
 * acontece **depois** da primeira tela pintar, então não atrasa nada
 * do que a proprietária está esperando.
 *
 * O resto das telas continua sob demanda: Relatórios e Backup são
 * visitados uma vez por semana, e baixá-los na abertura seria gastar a
 * franquia de dados dela por nada.
 */
/**
 * A fila, em ordem de utilidade.
 *
 * A tela atual não está aqui, e é de propósito: ela já está sendo
 * baixada pelo caminho normal, com prioridade máxima do navegador.
 * Pré-carregá-la seria disputar banda consigo mesma.
 *
 * O Painel fica por último porque, logo depois do login, ele **é** a
 * tela atual — pedi-lo primeiro é o único item da lista com chance de
 * ser puro desperdício.
 */
const PRINCIPAIS = [Agenda, Clientes, Caixa, Painel]

/** Quanto a tela atual tem para se acomodar antes de pensarmos em fila. */
const ESPERA_INICIAL_MS = 1_800

/** Se o navegador nunca ficar ocioso, o pedaço desce assim mesmo. */
const TETO_DE_ESPERA_MS = 4_000

/** Aba escondida: adia sem descartar. Volta a tentar daqui a pouco. */
const ESPERA_ESCONDIDA_MS = 3_000

type Janela = typeof window & {
  requestIdleCallback?: (cb: () => void, opcoes?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

/** O que o navegador conta sobre a rede, quando conta. */
type Conexao = { saveData?: boolean; effectiveType?: string }

/**
 * Pré-carregamento em fila, um pedaço por vez.
 *
 * ---------------------------------------------------------------
 * O que havia aqui antes
 * ---------------------------------------------------------------
 * Quatro `import()` disparados no mesmo `requestIdleCallback`. O nome
 * do gancho enganava: ele espera o navegador ficar ocioso **uma vez**,
 * e depois disso os quatro downloads correm juntos, do começo ao fim,
 * sem mais nenhuma checagem.
 *
 * No iPhone da proprietária isso acontece exatamente no pior instante —
 * logo após o login, com o Painel montando dez consultas ao Supabase. As
 * quatro conexões extras entram na mesma fila HTTP e nas mesmas antenas.
 * O resultado que ela descreve como \"trava ao entrar\" é banda dela
 * competindo com ela mesma.
 *
 * ---------------------------------------------------------------
 * O desenho agora
 * ---------------------------------------------------------------
 *   1. espera a tela atual assentar;
 *   2. espera o navegador ficar realmente ocioso;
 *   3. baixa UM pedaço;
 *   4. volta ao passo 2 para o próximo.
 *
 * E desiste inteiro quando não vale a pena: dados limitados ligados,
 * rede 2G, ou a saída da tela — porque toda a fila é descartável por
 * definição. Nada aqui é necessário; tudo aqui é adiantamento.
 */
function usarPreCarregamento(): void {
  useEffect(() => {
    const janela = window as Janela

    /*
      Economia de dados e rede fraca cancelam a ideia inteira.

      Pré-carregar é gastar a franquia da proprietária hoje para
      economizar meio segundo dela amanhã. Em 2G, o gasto é certo e a
      economia não existe: o download não termina antes de ela abrir a
      tela de qualquer forma.
    */
    const rede = (navigator as Navigator & { connection?: Conexao }).connection
    if (rede?.saveData) return
    if (typeof rede?.effectiveType === 'string' && /2g/i.test(rede.effectiveType)) return

    let cancelado = false
    let idOcioso: number | null = null
    let idRelogio: number | null = null

    const fila = [...PRINCIPAIS]

    /** Espera o navegador não ter nada melhor para fazer. */
    const quandoOcioso = (tarefa: () => void) => {
      if (cancelado) return

      if (janela.requestIdleCallback) {
        idOcioso = janela.requestIdleCallback(tarefa, { timeout: TETO_DE_ESPERA_MS })
        return
      }

      /*
        Safari em muitos iPhones ainda não expõe `requestIdleCallback`.
        O relógio é a aproximação possível — e o intervalo entre pedaços
        é o que impede que a aproximação vire uma rajada.
      */
      idRelogio = window.setTimeout(tarefa, 900)
    }

    const proxima = () => {
      if (cancelado) return

      const pagina = fila.shift()
      if (!pagina) return

      /*
        Aba escondida não baixa nada.

        No celular, \"escondida\" é o estado normal: a proprietária troca
        para o WhatsApp para responder a cliente. Baixar ali gasta bateria
        e dados por uma tela que ninguém está esperando — e o iOS ainda
        pode suspender a requisição no meio, deixando um pedaço pela
        metade que terá de ser baixado de novo.
      */
      if (document.visibilityState !== 'visible') {
        fila.unshift(pagina)
        idRelogio = window.setTimeout(proxima, ESPERA_ESCONDIDA_MS)
        return
      }

      void pagina
        .precarregar()
        .catch(() => {
          // Falhar aqui não custa nada: a página será baixada de novo
          // quando alguém a abrir, e aí com uma tela de carregamento
          // para acompanhar. Avisar seria assustar sem motivo.
        })
        .then(() => {
          // Um de cada vez, e só depois de o navegador respirar de novo.
          quandoOcioso(proxima)
        })
    }

    idRelogio = window.setTimeout(() => quandoOcioso(proxima), ESPERA_INICIAL_MS)

    return () => {
      cancelado = true
      if (idOcioso !== null) janela.cancelIdleCallback?.(idOcioso)
      if (idRelogio !== null) window.clearTimeout(idRelogio)
    }
  }, [])
}

/** O painel, com a moldura de pé e o miolo suspendendo sozinho. */
function Painelzinho() {
  usarPreCarregamento()
  return <LayoutApp />
}

/**
 * As rotas.
 *
 * Declaradas em JSX e convertidas para o formato de dados do React
 * Router. A troca de `<BrowserRouter><Routes>` para `createBrowserRouter`
 * não é preferência de estilo: `useBlocker` — o que segura a navegação
 * quando há formulário preenchido e não salvo — **só existe no roteador
 * de dados**. Com o roteador antigo ele lança em tempo de execução.
 *
 * O desenho das rotas continua idêntico. O que mudou foi onde cada
 * fronteira de carregamento fica.
 */
const rotas = createRoutesFromElements(
  <Route element={<Contorno />}>
        {/* Portal da cliente — sem sessão, em pacote próprio */}
        <Route path="/agendar/:identificador" element={<Tela><Agendamento /></Tela>} />
        <Route path="/agendar/:identificador/meu-horario" element={<Tela><MeuHorario /></Tela>} />

        {/* Acesso */}
        <Route path="/entrar" element={<SomenteVisitante><Tela><Entrar /></Tela></SomenteVisitante>} />

        {/* Destino do link enviado por e-mail. Fora de `SomenteVisitante`
            de propósito: o link já abre sessão, e a guarda mandaria a
            pessoa para o painel sem deixá-la trocar a senha. */}
        <Route path="/nova-senha" element={<Tela><NovaSenha /></Tela>} />

        {/* Painel */}
        <Route element={<Protegida><Painelzinho /></Protegida>}>
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
