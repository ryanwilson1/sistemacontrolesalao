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

  /*
    Entrou, mas não está na lista da casa.

    Acontece na janela entre criar a conta no Supabase e rodar
    `autorizar_conta` / `conceder_acesso_agenda` — e também depois de
    `revogar_conta`, que desativa sem apagar.

    Antes desta tela, o desfecho era o pior possível: sem linha em
    `contas_equipe`, a sessão caía no papel de proprietária por omissão
    e a pessoa via o menu completo — Financeiro, Backup, Ajustes — com
    cada clique devolvendo erro de permissão. Parece sistema quebrado, e
    é só cadastro que falta.
  */
  if (!sessao.autorizada) return <TelaSemAutorizacao />

  return <>{children}</>
}

/** Conta criada, acesso ainda não concedido. */
function TelaSemAutorizacao() {
  const { sair } = useSessao()

  return (
    <div className="flex min-h-dvh items-center justify-center bg-quartzo-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-onix-100 bg-white p-6 shadow-carta">
        <h1 className="font-display text-xl font-medium tracking-wide text-onix-900">
          Acesso ainda não liberado
        </h1>

        <p className="mt-2 text-[14px] leading-relaxed text-onix-500">
          Sua conta existe, mas ainda não foi autorizada a usar o sistema.
          Peça para quem administra o studio liberar o seu acesso.
        </p>

        <div className="mt-5 rounded-xl bg-quartzo-50 p-4">
          <p className="text-[13px] font-medium text-onix-700">
            Para quem administra:
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-onix-500">
            No Supabase, SQL Editor, rode{' '}
            <code className="font-mono text-[12px]">conceder_acesso_agenda</code>{' '}
            (acesso só à agenda) ou{' '}
            <code className="font-mono text-[12px]">autorizar_conta</code>{' '}
            (acesso completo). O passo a passo está em{' '}
            <code className="font-mono text-[12px]">docs/ACESSO-SAMARA.md</code>.
          </p>
        </div>

        <button
          onClick={() => void sair()}
          className="mt-5 text-[13px] font-medium text-onix-400 transition-colors hover:text-onix-800"
        >
          Sair e entrar com outra conta
        </button>
      </div>
    </div>
  )
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

/**
 * Fecha tudo que não é a agenda.
 *
 * O contrário de `SomenteGestor`: aquela abre telas para quem manda,
 * esta fecha para quem foi convidado a ver só um pedaço. É a guarda da
 * profissional parceira — a manicure que divide o espaço e precisa dos
 * horários sem alcançar o caixa nem a ficha das clientes do salão.
 *
 * O destino é a agenda, não o painel: mandar para `/` daria uma volta —
 * o painel também é fechado para ela — e a pessoa veria a tela piscar
 * duas vezes antes de parar onde deveria ter chegado direto.
 *
 * **Isto continua sendo interface.** Quem digitar o endereço com a
 * ferramenta certa passa por aqui; o que ele não passa é pelo RLS do
 * Postgres, e é lá que a restrição vale de fato (10-acesso-agenda.sql).
 * As duas camadas existem porque servem a coisas diferentes: esta evita
 * que a pessoa se perca, aquela evita que ela leia.
 */
export function ExigeAcessoCompleto({ children }: { children: ReactNode }) {
  const { soAgenda } = useSessao()
  if (soAgenda) return <Navigate to={ROTAS.agenda} replace />
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
