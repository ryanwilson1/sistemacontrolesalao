import { useEffect, useState } from 'react'
import { Campo, Entrada, Interruptor, Modal, Botao, Selecao, SeletorDeCor } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useSalvarProfissional } from '@/hooks'
import { CORES_DISPONIVEIS, PAPEL } from '@/constants'
import { limparNome } from '@/utils/sanitizar'
import { ErroDeRegra, mensagemDeErro } from '@/utils/erros'
import type { Papel, Profissional } from '@/types'

/**
 * Cadastro e edição de quem trabalha no studio.
 *
 * Esta tela não existia. A aba Equipe sabia apenas *editar* quem já
 * estava no banco, e o único caminho para criar alguém era um texto
 * dizendo que o cadastro viria "na próxima etapa" — rascunho de
 * desenvolvimento que acabou publicado.
 *
 * O efeito prático: um salão com duas profissionais não conseguia
 * cadastrar a segunda por lugar nenhum do sistema.
 *
 * ---------------------------------------------------------------
 * Profissional ≠ conta de acesso
 * ---------------------------------------------------------------
 * São coisas separadas de propósito, e a tela diz isso em voz alta.
 *
 * Cadastrar alguém aqui coloca a pessoa na grade da agenda e no link
 * público. **Não** cria login. Quem entra no sistema é decidido no
 * painel do Supabase mais o comando `autorizar_conta` — duas barreiras
 * que vivem no servidor.
 *
 * Misturar as duas coisas seria transformar "a manicure atende às
 * terças" em "a manicure vê o faturamento do salão".
 */
export function FormularioProfissional({
  aberto, profissional, aoFechar,
}: {
  aberto: boolean
  profissional: Profissional | null
  aoFechar: () => void
}) {
  const salvar = useSalvarProfissional()
  const aviso = useAviso()
  const editando = !!profissional

  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState<Papel>('profissional')
  const [cor, setCor] = useState<string>(CORES_DISPONIVEIS[0])
  const [atende, setAtende] = useState(true)
  const [ativo, setAtivo] = useState(true)

  useEffect(() => {
    if (!aberto) return
    setNome(profissional?.nome ?? '')
    setPapel(profissional?.papel ?? 'profissional')
    setCor(profissional?.cor ?? CORES_DISPONIVEIS[0])
    setAtende(profissional?.atende ?? true)
    setAtivo(profissional?.ativo ?? true)
  }, [aberto, profissional])

  const enviar = async () => {
    try {
      const nomeLimpo = limparNome(nome)
      if (nomeLimpo.length < 2) throw new ErroDeRegra('Informe o nome da profissional.')

      await salvar.executar({
        id: profissional?.id,
        dados: {
          nome: nomeLimpo,
          papel,
          cor,
          atende,
          ativo,
        },
      })

      aviso.sucesso(editando ? 'Profissional atualizada' : 'Profissional cadastrada', nomeLimpo)
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar profissional' : 'Nova profissional'}
      descricao="Quem atende aparece como coluna na agenda e no link público."
      estadoDoFormulario={{ nome, papel, cor, atende, ativo }}
      largura="md"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="ouro" onClick={() => void enviar()} carregando={salvar.salvando}>
            {editando ? 'Salvar' : 'Cadastrar'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <Campo rotulo="Nome" obrigatorio>
          <Entrada
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            autoComplete="name"
          />
        </Campo>

        {/*
          Sem campo de telefone aqui, de propósito.

          A tabela `profissionais` não tem essa coluna, e acrescentá-la
          só para preencher um formulário criaria um dado que nenhuma
          tela lê — o tipo de campo que envelhece vazio e confunde quem
          vier depois. Se um dia o contato da equipe for necessário, ele
          nasce junto com o lugar que vai usá-lo.
        */}
        <Campo rotulo="Função">
          <Selecao value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
            {Object.entries(PAPEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </Selecao>
        </Campo>

        <Campo rotulo="Cor na agenda" dica="Distingue os atendimentos dela na grade.">
          <SeletorDeCor cores={CORES_DISPONIVEIS} valor={cor} aoMudar={setCor} />
        </Campo>

        <div className="space-y-3 rounded-xl border border-onix-100 p-3.5">
          <Interruptor
            ligado={atende}
            aoMudar={setAtende}
            rotulo="Atende clientes"
            descricao="Aparece na grade da agenda e no link público."
          />
          <div className="border-t border-onix-50 pt-3">
            <Interruptor
              ligado={ativo}
              aoMudar={setAtivo}
              rotulo="Cadastro ativo"
              descricao="Desative para tirar da lista sem perder o histórico de atendimentos."
            />
          </div>
        </div>

        {/*
          O aviso que evita a confusão mais cara desta tela.

          Sem ele, a proprietária cadastra a manicure aqui, entrega o
          endereço do sistema e espera que ela consiga entrar — o que
          não acontece. Ou pior: supõe que cadastrar alguém deu acesso
          ao faturamento, e deixa de cadastrar quem precisa aparecer na
          agenda.
        */}
        <p className="rounded-xl border border-ouro-200 bg-ouro-100/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ouro-700">
          Cadastrar aqui coloca a pessoa na agenda — não cria acesso ao sistema.
          Para dar login a alguém, o administrador cria a conta no Supabase.
        </p>
      </div>
    </Modal>
  )
}
