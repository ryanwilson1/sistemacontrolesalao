import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessao } from '@/contexts'
import { CarregandoTela } from '@/components/feedback'
import { ROTAS } from '@/constants'

/** Exige uma sessão aberta. */
export function Protegida({ children }: { children: ReactNode }) {
  const { carregando, sessao, erroDeConfiguracao } = useSessao()

  if (carregando) return <CarregandoTela mensagem="Abrindo o studio" />

  /*
    Sistema publicado sem as credenciais do banco.

    Vem antes da checagem de sessão de propósito: sem banco não existe
    login possível, e mandar para a tela de entrada faria a
    proprietária tentar a senha certa repetidamente sem entender por
    que não entra.
  */
  if (erroDeConfiguracao) return <TelaDeConfiguracao motivo={erroDeConfiguracao} />
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

/**
 * O que aparece quando o sistema sobe sem banco.
 *
 * Escrita para quem publicou o sistema, não para a proprietária — ela
 * nunca deveria ver esta tela. Por isso o texto diz exatamente onde
 * clicar em vez de pedir "tente novamente": nenhuma tentativa resolve,
 * e a causa é sempre a mesma.
 */
function TelaDeConfiguracao({ motivo }: { motivo: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-quartzo-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-onix-100 bg-white p-6 shadow-carta">
        <h1 className="font-display text-xl font-medium tracking-wide text-onix-900">
          Sistema não configurado
        </h1>

        <p className="mt-2 text-[14px] leading-relaxed text-onix-500">{motivo}</p>

        <div className="mt-5 rounded-xl bg-quartzo-50 p-4">
          <p className="text-[13px] font-medium text-onix-700">Para resolver:</p>
          <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-onix-500">
            <li>1. Vercel → Settings → Environment Variables</li>
            <li>
              2. Cadastre <code className="font-mono text-[12px]">VITE_SUPABASE_URL</code> e{' '}
              <code className="font-mono text-[12px]">VITE_SUPABASE_ANON_KEY</code>
            </li>
            <li>3. Deployments → Redeploy</li>
          </ol>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-onix-400">
          As variáveis entram no momento da compilação. Cadastrar sem publicar de novo
          não tem efeito.
        </p>
      </div>
    </div>
  )
}
