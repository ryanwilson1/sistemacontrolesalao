import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessao } from '@/contexts'
import { CarregandoTela } from '@/components/feedback'
import { ROTAS } from '@/constants'

/** Exige uma sessão aberta. */
export function Protegida({ children }: { children: ReactNode }) {
  const { carregando, sessao } = useSessao()

  if (carregando) return <CarregandoTela mensagem="Abrindo o studio" />
  if (!sessao) return <Navigate to={ROTAS.entrar} replace />

  return <>{children}</>
}

/**
 * Restringe a proprietária e gerente.
 *
 * Sem servidor, isto organiza a interface — não é barreira de segurança.
 * Quando houver backend, a mesma verificação passa a existir também lá.
 */
export function SomenteGestor({ children }: { children: ReactNode }) {
  const { ehGestor } = useSessao()
  if (!ehGestor) return <Navigate to={ROTAS.painel} replace />
  return <>{children}</>
}

/** Quem já entrou não vê a tela de acesso. */
export function SomenteVisitante({ children }: { children: ReactNode }) {
  const { carregando, sessao } = useSessao()

  if (carregando) return <CarregandoTela />
  if (sessao) return <Navigate to={ROTAS.painel} replace />

  return <>{children}</>
}
