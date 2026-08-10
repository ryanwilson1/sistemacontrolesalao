import { useState, type InputHTMLAttributes } from 'react'
import { Entrada } from './Formulario'
import { digitandoMoeda, formatarMoedaBR, parseMoedaBR } from '@/utils/moeda'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  /** Texto cru do formulário. Quem chama guarda a string, não o número. */
  value: string
  onChange: (valor: string) => void
  erro?: boolean
}

/**
 * Campo de dinheiro no padrão brasileiro.
 *
 * Substitui `<input type="number">` nos dez formulários financeiros do
 * sistema, e o motivo é direto: o campo numérico do navegador **recusa
 * a vírgula**. A proprietária digita `50,00` e nada acontece. Ela
 * tenta `1.250,00` e o campo esvazia — em alguns navegadores, sem
 * aviso nenhum, salvando zero.
 *
 * Aqui o `inputMode="decimal"` abre o teclado numérico do celular com
 * vírgula, e a interpretação do que foi digitado é nossa.
 *
 * ---------------------------------------------------------------
 * Por que só formata ao sair do campo
 * ---------------------------------------------------------------
 * Formatar a cada tecla parece mais caprichado e atrapalha de verdade:
 * reescrever `1,2` para `1,20` enquanto se digita joga o cursor para o
 * fim, e o próximo dígito cai no lugar errado. Quem estava escrevendo
 * `1,25` termina com `1,205`.
 *
 * Durante a digitação, só sai o que não é número. Quando o campo perde
 * o foco, o valor aparece bonito — `1.250,50` — e a pessoa confere o
 * que gravou.
 */
export function CampoMoeda({ value, onChange, erro, ...resto }: Props) {
  const [focado, setFocado] = useState(false)

  const aoSair = () => {
    setFocado(false)
    const numero = parseMoedaBR(value)
    // Campo vazio continua vazio: "sem preço" e "de graça" são coisas
    // diferentes, e escrever 0,00 aqui apagaria a distinção.
    if (numero !== null) onChange(formatarMoedaBR(numero))
  }

  return (
    <Entrada
      {...resto}
      type="text"
      inputMode="decimal"
      value={value}
      erro={erro}
      onFocus={() => setFocado(true)}
      onBlur={aoSair}
      onChange={(e) => onChange(digitandoMoeda(e.target.value))}
      placeholder={resto.placeholder ?? (focado ? '' : '0,00')}
      prefixo={<span className="text-[13px] text-onix-400">R$</span>}
    />
  )
}
