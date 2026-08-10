import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ErroDeConfiguracao } from '@/utils/erros'
import {
  aoMudarSessao, iniciarSistema, sessaoServico, studioRepo, tempoReal, type Sessao,
} from '@/services'
import { PAPEIS_GESTORES } from '@/constants'
import { useTema } from './TemaContext'
import type { Studio } from '@/types'

/**
 * Quem está usando o sistema e em qual studio.
 *
 * O papel serve para decidir quais telas aparecem. Como não há servidor,
 * isto não é uma barreira de segurança — é organização de interface.
 * A troca por autenticação real acontece aqui dentro, sem tocar em tela
 * nenhuma.
 */

interface ContextoSessao {
  /** Sistema publicado sem credenciais do banco. */
  erroDeConfiguracao: string | null
  carregando: boolean
  sessao: Sessao | null
  studio: Studio | null
  nome: string
  ehGestor: boolean
  entrar: (profissionalId: string) => Promise<void>
  /** Só existe com banco: entra com e-mail e senha. */
  entrarComConta: (email: string, senha: string) => Promise<void>
  /** A autenticação de verdade está ligada? */
  exigeSenha: boolean
  sair: () => Promise<void>
  recarregarStudio: () => Promise<void>
}

const Contexto = createContext<ContextoSessao | null>(null)

export function SessaoProvider({ children }: { children: ReactNode }) {
  const { aplicar, aplicarCorPropria } = useTema()
  const [carregando, setCarregando] = useState(true)
  const [erroDeConfiguracao, setErroDeConfiguracao] = useState<string | null>(null)
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [studio, setStudio] = useState<Studio | null>(null)

  const carregarStudio = useCallback(async () => {
    // Sem sessão — portal público, token vencido — a leitura é recusada
    // pelo RLS. Isso é o esperado, não um defeito: quem precisa do
    // studio aqui é o painel, e o painel exige login.
    try {
      const atual = await studioRepo.ler()
      setStudio(atual)

      /*
        A ordem importa: a paleta primeiro, a cor própria depois.

        `aplicarCorPropria` recebe nulo quando não há cor escolhida, e
        nesse caso devolve a paleta que acabou de ser aplicada. Se as
        duas chamadas trocassem de lugar, a paleta sobrescreveria a cor
        do salão a cada carregamento — e a proprietária veria a cor
        dela sumir toda vez que abrisse o sistema.
      */
      if (atual?.tema) aplicar(atual.tema)
      aplicarCorPropria(atual?.corPrincipal ?? null)
    } catch {
      setStudio(null)
    }
  }, [aplicar, aplicarCorPropria])

  useEffect(() => {
    let ativo = true

    void (async () => {
      try {
        await iniciarSistema()
        const [sessaoAtual] = await Promise.all([sessaoServico.atual(), carregarStudio()])
        if (!ativo) return
        setSessao(sessaoAtual)
      } catch (falha) {
        /*
          Falhar aqui não pode travar a tela.

          A versão anterior deixava a exceção escapar, e o `carregando`
          nunca virava `false` — o sistema ficava para sempre na tela de
          abertura. Acontecia de verdade em dois casos comuns: banco fora
          do ar e visitante do portal público, que não tem sessão e
          recebe erro de permissão ao ler `studio`.

          Sem sessão, as guardas mandam para a entrada; o portal público
          carrega os próprios dados pelas funções do banco.
        */
        /*
          Falta de configuração é caso à parte.

          Os outros erros aqui são passageiros — banco fora do ar,
          visitante sem sessão — e mandar para a tela de entrada é a
          resposta certa. Já um sistema publicado sem as credenciais do
          banco não melhora com o tempo nem com login: alguém precisa
          cadastrar as variáveis e publicar de novo.

          Sem esta distinção, a proprietária ficaria batendo na tela de
          login com a senha certa, sem entender por que não entra.
        */
        if (falha instanceof ErroDeConfiguracao) {
          if (ativo) setErroDeConfiguracao(falha.message)
        }
        if (ativo) setSessao(null)
      } finally {
        if (ativo) setCarregando(false)
      }
    })()

    return () => {
      ativo = false
    }
  }, [carregarStudio])

  /*
    Ouve a autenticação depois da abertura.

    Sem isto, um token vencido só aparecia como erro de permissão no meio
    de uma tela — "sem permissão para acessar clientes", que parece
    defeito do sistema e é só sessão expirada. Pior: a proprietária
    continuava clicando em salvar, e cada clique falhava em silêncio.

    Também cobre o logout feito em outra aba: as duas caem juntas, como
    deveriam.
  */
  useEffect(() => {
    return aoMudarSessao((dentro) => {
      /*
        O canal de tempo real segue a sessão.

        Ele só abre com token guardado, e essa verificação acontecia uma
        vez só, na montagem. Quem abrisse o sistema deslogado ficava sem
        tempo real **mesmo depois de entrar**: a agenda parava de se
        atualizar sozinha até recarregar a página, e nada indicava o
        motivo — que é a pior forma de falhar, porque parece funcionar.

        Encerrar no logout importa pelo motivo oposto: um canal vivo com
        token revogado fica tentando reconectar para sempre.

        `iniciar()` é idempotente (sai cedo se o canal existe), então
        TOKEN_REFRESHED não cria um segundo canal.
      */
      if (dentro) tempoReal.iniciar()
      else tempoReal.encerrar()

      if (!dentro) {
        setSessao(null)
        return
      }
      void (async () => {
        const atual = await sessaoServico.atual()
        setSessao(atual)
      })()
    })
  }, [])

  const entrar = useCallback(async (profissionalId: string) => {
    setSessao(await sessaoServico.entrar(profissionalId))
  }, [])

  const entrarComConta = useCallback(async (email: string, senha: string) => {
    setSessao(await sessaoServico.entrarComConta(email, senha))
  }, [])

  const sair = useCallback(async () => {
    await sessaoServico.sair()
    setSessao(null)
  }, [])

  const valor = useMemo<ContextoSessao>(
    () => ({
      erroDeConfiguracao,
      carregando,
      sessao,
      studio,
      nome: sessao?.nome ?? '',
      ehGestor: sessao ? PAPEIS_GESTORES.includes(sessao.papel) : false,
      entrar,
      entrarComConta,
      exigeSenha: sessaoServico.exigeSenha,
      sair,
      recarregarStudio: carregarStudio,
    }),
    [erroDeConfiguracao, carregando, sessao, studio, entrar, entrarComConta, sair, carregarStudio],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSessao() {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useSessao precisa estar dentro de SessaoProvider')
  return contexto
}
