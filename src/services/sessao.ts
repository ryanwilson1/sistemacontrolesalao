import { armazenamento } from './storage'
import { profissionaisRepo } from './repositorios/equipe'
import { entrarComSenha, pessoaAtual, sairDaConta, temSupabase } from './supabase'
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
   * O vínculo é o `profissional_id` nos metadados. Sem ele — conta
   * criada direto no painel do Supabase, por exemplo — a pessoa entra
   * como proprietária, porque quem tem acesso ao banco já tem acesso a
   * tudo e fingir o contrário seria teatro.
   */
  private async montarDeConta(profissionalId: string | null, email: string): Promise<Sessao> {
    const profissional = profissionalId
      ? await profissionaisRepo.buscar(profissionalId)
      : null

    return {
      profissionalId: profissional?.id ?? '',
      nome: profissional?.nome ?? email.split('@')[0] ?? 'Equipe',
      papel: profissional?.papel ?? 'proprietaria',
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
