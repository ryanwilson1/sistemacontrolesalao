import { AvisoProvider, SessaoProvider, TemaProvider } from '@/contexts'
import { LimiteDeErro } from '@/components/feedback'
import { Rotas } from '@/routes'

/**
 * Árvore de provedores.
 *
 * Ordem importa: o tema precisa existir antes da sessão (que aplica a
 * identidade visual do studio), e ambos antes das rotas.
 *
 * O tempo real saiu daqui e foi para dentro do roteador (`Contorno`, em
 * `routes/index.tsx`). Não foi arrumação: os ganchos do React Router só
 * funcionam dentro da árvore de rotas, e o roteador de dados — que a
 * guarda de formulário não salvo exige — não aceita mais ser envolvido
 * por fora como o `<BrowserRouter>` aceitava.
 */
export function App() {
  return (
    <LimiteDeErro>
      <TemaProvider>
        <AvisoProvider>
          <SessaoProvider>
            <Rotas />
          </SessaoProvider>
        </AvisoProvider>
      </TemaProvider>
    </LimiteDeErro>
  )
}
