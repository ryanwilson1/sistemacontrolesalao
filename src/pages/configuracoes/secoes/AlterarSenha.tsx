import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Botao, Campo, CampoSenha, Carta, CartaTitulo } from '@/components/ui'
import { useAviso, useSessao } from '@/contexts'
import { definirNovaSenha } from '@/services'
import { ErroDeRegra, mensagemDeErro } from '@/utils/erros'

/**
 * Trocar a própria senha, já dentro do sistema.
 *
 * Faltava. O único caminho para mudar de senha era sair, clicar em
 * "esqueci minha senha" e esperar um e-mail — para alguém que está
 * logado e só quer trocar a senha provisória que o administrador
 * entregou.
 *
 * O efeito prático é que ninguém troca. A senha inicial, que passou
 * por WhatsApp e ficou no histórico da conversa, continua valendo por
 * meses.
 *
 * ---------------------------------------------------------------
 * Sem campo de "senha atual"
 * ---------------------------------------------------------------
 * O Supabase Auth não pede a senha antiga para trocar a senha de uma
 * sessão já autenticada — quem tem sessão válida já provou quem é.
 *
 * Poderíamos exigir mesmo assim, conferindo por um login extra. Não
 * faz aqui: acrescentaria um campo, uma chamada de rede e uma chance a
 * mais de erro, para reproduzir uma verificação que a sessão ativa já
 * cumpre. Um campo que existe só para parecer seguro cansa e não
 * protege.
 */
export function AlterarSenha() {
  const { nome } = useSessao()
  const aviso = useAviso()

  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [salvando, setSalvando] = useState(false)

  const naoCoincidem = repetida.length > 0 && senha !== repetida
  const curta = senha.length > 0 && senha.length < 8

  const salvar = async () => {
    try {
      if (senha.length < 8) {
        throw new ErroDeRegra('A senha precisa de pelo menos 8 caracteres.')
      }
      if (senha !== repetida) {
        throw new ErroDeRegra('As senhas não coincidem. Confira as duas.')
      }

      setSalvando(true)
      await definirNovaSenha(senha)

      // Só limpa depois que o servidor confirmou. Se falhar, o que ela
      // digitou continua na tela para uma segunda tentativa.
      setSenha('')
      setRepetida('')
      aviso.sucesso('Senha alterada', 'Use a nova senha no próximo acesso.')
    } catch (falha) {
      aviso.erro('Não foi possível alterar', mensagemDeErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Carta>
      <CartaTitulo
        titulo="Minha senha"
        descricao={nome ? `Conta de ${nome}` : 'Trocar a senha de acesso'}
      />

      <div className="space-y-4">
        <Campo
          rotulo="Nova senha"
          obrigatorio
          erro={curta ? 'Use pelo menos 8 caracteres.' : undefined}
          dica={curta ? undefined : 'No mínimo 8 caracteres.'}
        >
          <CampoSenha
            value={senha}
            autoComplete="new-password"
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            erro={curta}
          />
        </Campo>

        <Campo
          rotulo="Repita a senha"
          obrigatorio
          erro={naoCoincidem ? 'As senhas não coincidem.' : undefined}
        >
          <CampoSenha
            value={repetida}
            autoComplete="new-password"
            onChange={(e) => setRepetida(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void salvar()}
            placeholder="••••••••"
            erro={naoCoincidem}
          />
        </Campo>

        <Botao
          variante="ouro"
          onClick={() => void salvar()}
          carregando={salvando}
          disabled={salvando || senha.length < 8 || senha !== repetida}
        >
          <ShieldCheck className="h-4 w-4" /> Alterar senha
        </Botao>

        <p className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5 text-[12.5px] leading-relaxed text-onix-500">
          A senha fica guardada pelo servidor de autenticação, cifrada. Nem o
          sistema nem quem administra conseguem lê-la — se você esquecer, o
          caminho é o link de nova senha por e-mail.
        </p>
      </div>
    </Carta>
  )
}
