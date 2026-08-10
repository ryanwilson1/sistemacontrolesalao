import { useState } from 'react'
import { LogIn, Mail } from 'lucide-react'
import { CampoSenha, Botao, Campo, Entrada } from '@/components/ui'
import { useAviso, useSessao } from '@/contexts'
import { recuperarSenha } from '@/services'
import { ErroDeEspera, mensagemDeErro } from '@/utils/erros'

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
  const [enviandoLink, setEnviandoLink] = useState(false)

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

    setEnviandoLink(true)
    try {
      await recuperarSenha(email)
      confirmarPedido()
    } catch (falha) {
      /*
        Duas famílias de erro, dois tratamentos.

        O 429 é o servidor pedindo tempo — e precisa ser dito. Sem
        isso a pessoa clica de novo, e cada clique renova o bloqueio:
        ela fica presa num ciclo que alimenta sozinha. Aqui o botão
        volta a ficar disponível, porque ela vai querer tentar depois.

        Qualquer outro erro vira a MESMA mensagem de sucesso, de
        propósito. Avisar "este e-mail não está cadastrado"
        transformaria a tela num verificador de contas: alguém testa
        endereços até achar o do salão, e daí parte para adivinhar
        senha. Quem tem conta recebe o link; quem não tem, não recebe
        nada — e ninguém aprende nada pela tela.
      */
      if (falha instanceof ErroDeEspera) {
        aviso.erro('Aguarde um instante', mensagemDeErro(falha))
      } else {
        confirmarPedido()
      }
    } finally {
      setEnviandoLink(false)
    }
  }

  /** A resposta é a mesma exista ou não conta com aquele e-mail. */
  const confirmarPedido = () => {
    setEsquecida(true)
    aviso.sucesso(
      'Verifique seu e-mail',
      'Se houver uma conta com este endereço, o link de nova senha chega em instantes.',
    )
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
        <CampoSenha
          value={senha} autoComplete="current-password"
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void enviar()}
          placeholder="••••••••"
        />
      </Campo>

      <Botao variante="ouro" tamanho="lg" bloco carregando={entrando} onClick={() => void enviar()}>
        <LogIn className="h-4 w-4" /> Entrar
      </Botao>

      <button
        type="button"
        onClick={() => void recuperar()}
        disabled={enviandoLink || esquecida}
        className="min-h-[44px] w-full text-center text-[13px] text-onix-400 transition-colors hover:text-onix-800 disabled:cursor-default disabled:text-onix-300"
      >
        {enviandoLink
          ? 'Enviando…'
          : esquecida
            ? 'Link enviado — confira seu e-mail'
            : 'Esqueci minha senha'}
      </button>

      <p className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5 text-[12.5px] leading-relaxed text-onix-500">
        Os dados do studio ficam no servidor e acompanham você em qualquer
        aparelho. Sem entrar, ninguém enxerga a agenda nem a ficha das
        clientes — nem digitando o endereço direto.
      </p>
    </div>
  )
}
