import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TEMAS, TEMA_PADRAO, type Tema } from '@/constants/tema'
import { clarear, paraCanaisCss, textoSobre } from '@/utils/contraste'

/**
 * Identidade visual trocável em tempo de execução.
 *
 * As cores viram variáveis CSS lidas pelo Tailwind (`bg-marca`,
 * `text-marca`). Trocar o tema é reescrever três variáveis — nenhuma
 * classe precisa mudar.
 */

interface ContextoTema {
  tema: Tema
  /** Aplica uma das paletas prontas. */
  aplicar: (chave: string) => void
  /**
   * Aplica a cor livre escolhida pela proprietária.
   *
   * Vazio ou nulo volta para a paleta de `tema`. As outras duas cores
   * — o tom suave e a cor do texto por cima — são **derivadas**, nunca
   * escolhidas: é assim que a promessa de "nenhuma cor deixa texto
   * ilegível" se sustenta sem depender do olho de quem escolheu.
   */
  aplicarCorPropria: (cor: string | null) => void
  temas: typeof TEMAS
}

const Contexto = createContext<ContextoTema | null>(null)

/**
 * Monta um tema completo a partir de uma cor só.
 *
 * A proprietária escolhe um valor; o sistema precisa de três. Deduzir
 * os outros dois em vez de perguntar evita a combinação que quebra a
 * tela — texto branco sobre amarelo — sem transformar a escolha de cor
 * num formulário de três campos que ninguém entende.
 */
function temaDaCor(cor: string): Tema {
  return {
    chave: 'propria',
    nome: 'Cor do salão',
    acento: cor,
    acentoSuave: clarear(cor, 0.86),
    acentoContraste: textoSobre(cor),
  }
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(TEMA_PADRAO)

  const aplicar = useCallback((chave: string) => {
    setTema(TEMAS[chave] ?? TEMA_PADRAO)
  }, [])

  const aplicarCorPropria = useCallback((cor: string | null) => {
    setTema((atual) => {
      if (!cor) {
        // Sem cor própria, volta para a paleta que estava valendo.
        return TEMAS[atual.chave] ?? TEMA_PADRAO
      }
      return temaDaCor(cor)
    })
  }, [])

  useEffect(() => {
    const raiz = document.documentElement
    raiz.style.setProperty('--marca', paraCanaisCss(tema.acento, TEMA_PADRAO.acento))
    raiz.style.setProperty('--marca-suave', paraCanaisCss(tema.acentoSuave, TEMA_PADRAO.acentoSuave))
    raiz.style.setProperty(
      '--marca-contraste',
      paraCanaisCss(tema.acentoContraste, TEMA_PADRAO.acentoContraste),
    )
  }, [tema])

  const valor = useMemo(
    () => ({ tema, aplicar, aplicarCorPropria, temas: TEMAS }),
    [tema, aplicar, aplicarCorPropria],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useTema() {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useTema precisa estar dentro de TemaProvider')
  return contexto
}
