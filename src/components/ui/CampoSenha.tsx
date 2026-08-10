import { useRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { Entrada } from './Formulario'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  erro?: boolean
}

/**
 * Campo de senha com o botão de mostrar/ocultar.
 *
 * Parece detalhe e não é. Senha inicial vem do administrador — algo
 * como `St#9kLm2` —, e a proprietária digita aquilo num teclado de
 * celular, às cegas, com o campo mostrando bolinhas. Erra, tenta de
 * novo, erra, e conclui que a senha está errada quando o problema foi
 * o dedo no `k` em vez do `l`.
 *
 * ---------------------------------------------------------------
 * Os detalhes que fazem o botão funcionar de verdade
 * ---------------------------------------------------------------
 *
 * **`type="button"`.** Sem isso, o botão dentro do formulário vira
 * submit por padrão: tocar no olho tentaria entrar no sistema com a
 * senha pela metade.
 *
 * **`onMouseDown` com `preventDefault`.** O clique tira o foco do
 * campo antes de chegar ao botão — e num celular isso fecha o teclado.
 * A pessoa toca no olho, o teclado some, e ela precisa tocar no campo
 * de novo para continuar digitando.
 *
 * **O cursor volta para onde estava.** Trocar o `type` do input faz o
 * navegador jogar o cursor para o fim. Quem estava corrigindo o
 * terceiro caractere perdia o lugar.
 *
 * **44px de alvo.** O padrão seria um ícone de 16px, impossível de
 * acertar com o polegar.
 */
export function CampoSenha({ erro, ...resto }: Props) {
  const [visivel, setVisivel] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  const alternar = () => {
    const input = campo.current
    const posicao = input?.selectionStart ?? null

    setVisivel((antes) => !antes)

    // O `type` muda no próximo quadro; o cursor é reposto depois dele.
    requestAnimationFrame(() => {
      if (input && posicao !== null) {
        input.focus()
        input.setSelectionRange(posicao, posicao)
      }
    })
  }

  return (
    <Entrada
      {...resto}
      ref={campo}
      type={visivel ? 'text' : 'password'}
      erro={erro}
      prefixo={<KeyRound className="h-4 w-4" />}
      sufixo={
        <button
          type="button"
          onClick={alternar}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          className="-mr-1.5 grid h-11 w-11 place-items-center rounded-lg text-onix-400 transition-colors hover:text-onix-700"
        >
          {visivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  )
}
