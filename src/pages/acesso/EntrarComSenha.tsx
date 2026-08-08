import { useState } from 'react'
import { KeyRound, LogIn, Mail } from 'lucide-react'
import { Botao, Campo, Entrada } from '@/components/ui'
import { useAviso, useSessao } from '@/contexts'
import { recuperarSenha } from '@/services'
import { mensagemDeErro } from '@/utils/erros'

/**
 * Entrada com e-mail e senha.
 *
 * Aparece quando há banco. Aqui a senha protege de verdade: quem não
 * tem token não lê tabela alguma no Postgres, mesmo digitando o endereço
 * do painel direto no navegador. Sem banco, a tela de escolha de perfil
 * continua sendo a honesta — e o sistema nunca chamou aquilo de senha.
 */
export function EntrarComSenha() {
  const { entrarComConta } = useSessao()
  const aviso = useAviso()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [esquecida, setEsquecida] = useState(false)

  const enviar = async () => {
    if (!email.includes('@') || senha.length < 6) {
      aviso.erro('Faltam informações', 'Informe o e-mail e a senha.')
      return
    }

    setEntrando(true)
    try {
      await entrarComConta(email, senha)
    } catch (falha) {
      aviso.erro('Não foi possível entrar', mensagemDeErro(falha))
    } finally {
      setEntrando(false)
    }
  }

  const recuperar = async () => {
    if (!email.includes('@')) {
      aviso.erro('Informe o e-mail', 'Precisamos dele para enviar o link.')
      return
    }

    try {
      await recuperarSenha(email)
      setEsquecida(true)
      aviso.sucesso('Link enviado', 'Confira sua caixa de entrada.')
    } catch (falha) {
      aviso.erro('Não foi possível enviar', mensagemDeErro(falha))
    }
  }

  return (
    <div className="space-y-4">
      <Campo rotulo="E-mail" obrigatorio>
        <Entrada
          type="email" value={email} autoFocus autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void enviar()}
          placeholder="voce@studio.com.br" inputMode="email"
          prefixo={<Mail className="h-4 w-4" />}
        />
      </Campo>

      <Campo rotulo="Senha" obrigatorio>
        <Entrada
          type="password" value={senha} autoComplete="current-password"
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void enviar()}
          placeholder="••••••••"
          prefixo={<KeyRound className="h-4 w-4" />}
        />
      </Campo>

      <Botao variante="ouro" tamanho="lg" bloco carregando={entrando} onClick={() => void enviar()}>
        <LogIn className="h-4 w-4" /> Entrar
      </Botao>

      <button
        onClick={() => void recuperar()}
        className="w-full text-center text-[13px] text-onix-400 transition-colors hover:text-onix-800"
      >
        {esquecida ? 'Link enviado — confira seu e-mail' : 'Esqueci minha senha'}
      </button>

      <p className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5 text-[12.5px] leading-relaxed text-onix-500">
        Os dados do studio ficam no servidor e acompanham você em qualquer
        aparelho. Sem entrar, ninguém enxerga a agenda nem a ficha das
        clientes — nem digitando o endereço direto.
      </p>
    </div>
  )
}
