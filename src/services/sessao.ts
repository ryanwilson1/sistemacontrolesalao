import { armazenamento } from './storage'
import { profissionaisRepo } from './repositorios/equipe'
import { contaDaEquipe, entrarComSenha, pessoaAtual, sairDaConta, temSupabase } from './supabase'
import { ErroDeRegra } from '@/utils/erros'
import type { Papel, Profissional } from '@/types'

/**
 * Sessão.
 *
 * Duas naturezas, escolhidas pelo mesmo interruptor do armazenamento:
 *
 * **Sem banco** — escolha de perfil. NÃO é autenticação, e o sistema
 * nunca fingiu que fosse: sem servidor não existe segredo que o
 * navegador guarde, e uma senha aqui daria só a sensação de segurança.
 *
 * **Com banco** — autenticação de verdade, com e-mail e senha. A
 * fronteira deixa de ser a interface e passa a ser o Postgres: quem não
 * tem token não lê tabela alguma, mesmo digitando o endereço direto.
 *
 * As telas não sabem em qual dos dois estão. É por isso que esta camada
 * existia desde o começo.
 */

export interface Sessao {
  profissionalId: string
  nome: string
  papel: Papel
  /**
   * A conta consta na lista da casa?
   *
   * Falso só quando o banco respondeu e não havia linha (ou ela estava
   * desativada). Quando não dá para perguntar — projeto sem o
   * 02-seguranca.sql, rede fora — vem verdadeiro, para não trancar
   * ninguém para fora por causa de uma checagem que não aconteceu.
   */
  autorizada: boolean
  iniciadaEm: string
}

class ServicoDeSessao {
  /** Autenticação de verdade está ligada? */
  get exigeSenha(): boolean {
    return temSupabase()
  }

  async atual(): Promise<Sessao | null> {
    if (!temSupabase()) {
      const registros = await armazenamento.listar<Sessao>('sessao')
      return registros[0] ?? null
    }

    // Com banco, quem manda é o token — não o que ficou guardado no
    // aparelho. Um registro local sem token válido é resquício de
    // sessão expirada, e tratá-lo como sessão mostraria um painel que
    // não consegue carregar nada.
    const pessoa = await pessoaAtual()
    if (!pessoa) return null

    return this.montarDeConta(pessoa.profissionalId, pessoa.email)
  }

  /**
   * Entra com e-mail e senha. Só existe com banco.
   */
  async entrarComConta(email: string, senha: string): Promise<Sessao> {
    const pessoa = await entrarComSenha(email, senha)
    return this.montarDeConta(pessoa.profissionalId, pessoa.email)
  }

  /**
   * Liga a conta ao cadastro da equipe.
   *
   * A ordem das fontes é a ordem da confiança:
   *
   *   1. `contas_equipe` — a mesma tabela que o RLS consulta. Enquanto
   *      as duas leituras vinham de lugares diferentes, tela e banco
   *      discordavam em silêncio (ver `contaDaEquipe`).
   *   2. os metadados do usuário — caminho antigo, mantido para conta
   *      configurada à mão no painel do Supabase.
   *   3. `'proprietaria'` — só quando não foi possível PERGUNTAR.
   *
   * A diferença entre \"não há linha\" e \"não deu para checar\" decide
   * o passo 3, e é a correção mais importante deste método. Conta
   * ausente da lista não recebe mais o papel de proprietária por
   * omissão: ela volta como não autorizada, e a tela diz isso em vez de
   * abrir um painel completo que o banco vai recusar inteiro.
   */
  private async montarDeConta(profissionalId: string | null, email: string): Promise<Sessao> {
    const resultado = await contaDaEquipe()
    const conta = resultado.situacao === 'autorizada' ? resultado.conta : null

    const idEfetivo = conta?.profissionalId ?? profissionalId
    const profissional = idEfetivo ? await profissionaisRepo.buscar(idEfetivo) : null

    /*
      O papel de `contas_equipe` vence o do cadastro na Equipe.

      Os dois deveriam concordar — `conceder_acesso_agenda` grava nos
      dois de propósito. Quando divergirem, quem manda é o que o banco
      obedece: adiantaria pouco a tela liberar uma aba que o Postgres
      vai recusar, e enganaria muito a tela liberar uma que ele *não*
      vai recusar.
    */
    const papel = (conta?.papel || profissional?.papel || 'proprietaria') as Papel

    /*
      Conta desativada conta como não autorizada.

      `revogar_conta` marca `ativo = false` em vez de apagar a linha,
      para preservar o histórico de quem fez o quê. A tela precisa
      tratar isso como \"sem acesso\", senão alguém que teve o acesso
      revogado continuaria vendo o painel montado.
    */
    const autorizada =
      resultado.situacao === 'indisponivel' ||
      (resultado.situacao === 'autorizada' && resultado.conta.ativo)

    return {
      profissionalId: profissional?.id ?? '',
      nome: profissional?.nome ?? email.split('@')[0] ?? 'Equipe',
      papel,
      autorizada,
      iniciadaEm: new Date().toISOString(),
    }
  }

  async entrar(profissionalId: string): Promise<Sessao> {
    if (temSupabase()) {
      throw new ErroDeRegra('Entre com e-mail e senha.')
    }

    const profissional = await profissionaisRepo.buscar(profissionalId)
    if (!profissional) throw new ErroDeRegra('Perfil não encontrado.')
    if (!profissional.ativo) throw new ErroDeRegra('Este perfil está desativado.')

    const sessao: Sessao = {
      profissionalId: profissional.id,
      nome: profissional.nome,
      papel: profissional.papel,
      // Sem banco não existe lista da casa para consultar.
      autorizada: true,
      iniciadaEm: new Date().toISOString(),
    }

    await armazenamento.gravar('sessao', [sessao])
    return sessao
  }

  async sair(): Promise<void> {
    await sairDaConta()
    if (!temSupabase()) await armazenamento.gravar('sessao', [])
  }

  /** Perfis disponíveis para entrar. */
  async perfis(): Promise<Profissional[]> {
    return profissionaisRepo.ativos()
  }
}

export const sessaoServico = new ServicoDeSessao()
