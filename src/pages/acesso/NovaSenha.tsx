import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { LayoutAcesso } from '@/layouts'
import { Botao, Campo, Entrada } from '@/components/ui'
import { CarregandoTela } from '@/components/feedback'
import { useAviso } from '@/contexts'
import { definirNovaSenha, sessaoDeRecuperacao } from '@/services'
import { ROTAS } from '@/constants'
import { mensagemDeErro } from '@/utils/erros'

/**
 * Definir a nova senha.
 *
 * Esta tela não existia, e a falta dela quebrava o fluxo inteiro de
 * "Esqueci minha senha":
 *
 *   1. a proprietária pedia o link;
 *   2. o e-mail chegava e ela clicava;
 *   3. o Supabase criava a sessão e devolvia em `/entrar`;
 *   4. a guarda `SomenteVisitante` via sessão aberta e mandava para o
 *      painel.
 *
 * Ela entrava — e nunca trocava a senha. Na vez seguinte, a senha
 * antiga continuava sendo a única que funcionava, e o link do e-mail já
 * tinha sido gasto. O sistema parecia ter recuperado o acesso sem ter
 * recuperado nada.
 *
 * Agora o link do e-mail vem para cá, e a sessão que ele abre serve
 * para uma coisa só: gravar a senha nova.
 */
export default function NovaSenha() {
  const navegar = useNavigate()
  const aviso = useAviso()

  const [conferindo, setConferindo] = useState(true)
  const [valido, setValido] = useState(false)
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true

    void (async () => {
      const temSessao = await sessaoDeRecuperacao()
      if (!ativo) return
      setValido(temSessao)
      setConferindo(false)
    })()

    return () => {
      ativo = false
    }
  }, [])

  if (conferindo) return <CarregandoTela mensagem="Conferindo o link" />

  if (!valido) {
    return (
      <LayoutAcesso
        titulo="Link expirado"
        subtitulo="Este link de recuperação não vale mais."
      >
        <p className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5 text-[13px] leading-relaxed text-onix-500">
          Links de recuperação valem por pouco tempo e só podem ser usados uma
          vez. Peça um novo na tela de entrada.
        </p>
        <Botao
          variante="ouro"
          tamanho="lg"
          bloco
          className="mt-4"
          onClick={() => navegar(ROTAS.entrar, { replace: true })}
        >
          Voltar para a entrada
        </Botao>
      </LayoutAcesso>
    )
  }

  const salvar = async () => {
    if (senha.length < 8) {
      aviso.erro('Senha curta demais', 'Use pelo menos 8 caracteres.')
      return
    }
    if (senha !== repetida) {
      aviso.erro('As senhas não conferem', 'Digite a mesma senha nos dois campos.')
      return
    }

    setSalvando(true)
    try {
      await definirNovaSenha(senha)
      aviso.sucesso('Senha alterada', 'Use a nova senha da próxima vez que entrar.')
      navegar(ROTAS.painel, { replace: true })
    } catch (falha) {
      aviso.erro('Não foi possível alterar', mensagemDeErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <LayoutAcesso
      titulo="Criar uma senha nova"
      subtitulo="Escolha uma senha que só você saiba."
    >
      <div className="space-y-4">
        <Campo rotulo="Nova senha" obrigatorio dica="No mínimo 8 caracteres.">
          <Entrada
            type="password"
            value={senha}
            autoFocus
            autoComplete="new-password"
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            prefixo={<KeyRound className="h-4 w-4" />}
          />
        </Campo>

        <Campo rotulo="Repita a senha" obrigatorio>
          <Entrada
            type="password"
            value={repetida}
            autoComplete="new-password"
            onChange={(e) => setRepetida(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void salvar()}
            placeholder="••••••••"
            prefixo={<ShieldCheck className="h-4 w-4" />}
          />
        </Campo>

        <Botao
          variante="ouro"
          tamanho="lg"
          bloco
          carregando={salvando}
          onClick={() => void salvar()}
        >
          Salvar nova senha
        </Botao>

        <p className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5 text-[12.5px] leading-relaxed text-onix-500">
          Depois de salvar, esta senha passa a ser a única que abre o studio.
          Guarde-a em lugar seguro — o sistema não consegue mostrá-la de volta.
        </p>
      </div>
    </LayoutAcesso>
  )
}
