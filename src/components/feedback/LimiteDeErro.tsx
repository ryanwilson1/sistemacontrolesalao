import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { registrarErro } from '@/services/diario-de-erros'

/**
 * Rede de proteção da árvore de componentes.
 *
 * Uma falha de renderização não pode derrubar o sistema inteiro nem
 * exibir a pilha de erro — isso entregaria a estrutura interna do código.
 */
export class LimiteDeErro extends Component<{ children: ReactNode }, { falhou: boolean }> {
  override state = { falhou: false }

  static getDerivedStateFromError() {
    return { falhou: true }
  }

  override componentDidCatch(erro: Error, info: ErrorInfo) {
    /*
      O registro roda em TODO ambiente — produção principalmente.

      A versão anterior logava só em DEV, e "em produção, envie para o
      monitoramento aqui" ficou como comentário: quando a tela travava
      no celular da proprietária, não sobrava mensagem, pilha, rota nem
      versão. Cada relato de "travou" era investigado do zero.

      Agora fica tudo no diário (`studio:diario-de-erros` no
      localStorage — sobrevive ao recarregar) e no console. A TELA
      continua sem pilha nenhuma: o que muda é o diagnóstico, não o que
      a cliente vê.
    */
    registrarErro({ erro, componente: info.componentStack ?? null })
  }

  override render() {
    if (!this.state.falhou) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center bg-quartzo-50 px-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#F7E9EA] text-perigo">
            <AlertCircle className="h-6 w-6" strokeWidth={1.6} />
          </span>
          <h1 className="mt-5 font-display text-xl font-light tracking-tight text-onix-900">
            A tela travou
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-onix-400">
            Recarregue a página para continuar. O problema ficou registrado
            para o suporte.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 h-11 rounded-xl bg-onix-800 px-5 text-sm font-medium text-white transition-colors hover:bg-onix-900"
          >
            Recarregar
          </button>
        </div>
      </div>
    )
  }
}
