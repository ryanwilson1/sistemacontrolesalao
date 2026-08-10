import { useEffect, useState } from 'react'
import { formatarMoedaBR, moedaOuZero } from '@/utils/moeda'
import { CampoMoeda,
  AreaTexto, Botao, Campo, Entrada, Interruptor, Modal, Selecao, SeletorDeCor,
} from '@/components/ui'
import { useAviso } from '@/contexts'
import { useAtendentes, useCategorias, useCriarCategoria, useSalvarServico } from '@/hooks'
import { CORES_DISPONIVEIS } from '@/constants'
import { limparNome, limparTexto } from '@/utils/sanitizar'
import { cn } from '@/utils/cn'
import { ErroDeRegra, mensagemDeErro } from '@/utils/erros'
import type { Servico } from '@/types'

export function FormularioServico({
  aberto, aoFechar, servico,
}: {
  aberto: boolean
  aoFechar: () => void
  servico?: Servico | null
}) {
  const { dados: categorias } = useCategorias()
  const { dados: equipe } = useAtendentes()
  const salvar = useSalvarServico()
  const criarCategoria = useCriarCategoria()
  const aviso = useAviso()
  const editando = !!servico

  const [nome, setNome] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [duracao, setDuracao] = useState('40')
  const [intervalo, setIntervalo] = useState('0')
  const [preco, setPreco] = useState('')
  const [cor, setCor] = useState<string>(CORES_DISPONIVEIS[0])
  const [noLink, setNoLink] = useState(true)
  const [ativo, setAtivo] = useState(true)
  const [responsaveis, setResponsaveis] = useState<string[]>([])

  useEffect(() => {
    if (!aberto) return
    setNome(servico?.nome ?? '')
    setCategoriaId(servico?.categoriaId ?? '')
    setNovaCategoria('')
    setDescricao(servico?.descricao ?? '')
    setDuracao(String(servico?.duracaoMinutos ?? 40))
    setIntervalo(String(servico?.intervaloMinutos ?? 0))
    setPreco(servico ? formatarMoedaBR(servico.preco) : '')
    setCor(servico?.cor ?? CORES_DISPONIVEIS[0])
    setNoLink(servico?.noLinkPublico ?? true)
    setAtivo(servico?.ativo ?? true)
    setResponsaveis(servico?.profissionaisIds ?? [])
  }, [aberto, servico])

  const alternarResponsavel = (id: string) => {
    setResponsaveis((atuais) =>
      atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id],
    )
  }

  const enviar = async () => {
    try {
      const nomeLimpo = limparNome(nome)
      if (nomeLimpo.length < 2) throw new ErroDeRegra('Informe o nome do serviço.')

      /*
        O teto também é validado — não só o piso.

        `max="720"` no HTML impede a setinha de subir além disso e não
        impede ninguém de digitar. Um serviço de 900 minutos entrava
        sem reclamação: quinze horas, mais do que o salão fica aberto.
        O efeito é a agenda parar de oferecer horário para aquele
        serviço, sem que nada na tela explique por quê.

        A regra do teto vale mais do que a do piso: errar para baixo
        salta aos olhos no primeiro agendamento; errar para cima só
        aparece quando a cliente diz que não achou horário.
      */
      const minutos = Number(duracao)
      if (!minutos || minutos < 5) {
        throw new ErroDeRegra('A duração precisa ser de pelo menos 5 minutos.')
      }
      if (minutos > 720) {
        throw new ErroDeRegra(
          'A duração passou de 12 horas. Confira o valor — está em minutos.',
        )
      }

      const folga = Number(intervalo) || 0
      if (folga < 0 || folga > 120) {
        throw new ErroDeRegra('O intervalo deve ficar entre 0 e 120 minutos.')
      }

      const valor = moedaOuZero(preco)
      if (valor < 0) throw new ErroDeRegra('O preço não pode ser negativo.')

      let categoriaFinal = categoriaId || null
      if (novaCategoria.trim()) {
        const criada = await criarCategoria.executar(limparNome(novaCategoria))
        categoriaFinal = criada.id
      }

      await salvar.executar({
        id: servico?.id,
        dados: {
          nome: nomeLimpo,
          categoriaId: categoriaFinal,
          descricao: limparTexto(descricao, 1000) || null,
          duracaoMinutos: minutos,
          intervaloMinutos: Number(intervalo) || 0,
          preco: moedaOuZero(preco),
          cor,
          noLinkPublico: noLink,
          ativo,
          ordem: servico?.ordem ?? 99,
          profissionaisIds: responsaveis,
          produtos: servico?.produtos ?? [],
        },
      })

      aviso.sucesso(editando ? 'Serviço atualizado' : 'Serviço cadastrado', nomeLimpo)
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <Modal
      estadoDoFormulario={{ nome, categoriaId, novaCategoria, descricao, duracao, intervalo, preco, cor, noLink, ativo, responsaveis }}
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar serviço' : 'Novo serviço'}
      descricao="A duração e o intervalo definem quanto tempo a agenda reserva."
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="ouro"
            onClick={() => void enviar()}
            carregando={salvar.salvando || criarCategoria.salvando}
          >
            {editando ? 'Salvar' : 'Cadastrar'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Campo rotulo="Nome do serviço" obrigatorio>
          <Entrada
            value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Progressiva" autoFocus maxLength={120}
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Categoria">
            <Selecao
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              disabled={!!novaCategoria.trim()}
            >
              <option value="">Sem categoria</option>
              {categorias?.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Ou criar categoria">
            <Entrada
              value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)}
              placeholder="Ex.: Coloração" maxLength={60}
            />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Duração" obrigatorio dica="Em minutos">
            <Entrada
              type="number" min="5" max="720" step="5" inputMode="numeric"
              value={duracao} onChange={(e) => setDuracao(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Intervalo" dica="Limpeza e organização">
            <Entrada
              type="number" min="0" max="120" step="5" inputMode="numeric"
              value={intervalo} onChange={(e) => setIntervalo(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Preço" obrigatorio>
            <CampoMoeda value={preco} onChange={setPreco} />
          </Campo>
        </div>

        <Campo rotulo="Descrição" dica="Aparece para a cliente no link de agendamento.">
          <AreaTexto
            value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que está incluso no serviço" maxLength={1000} rows={2}
          />
        </Campo>

        <Campo
          rotulo="Quem faz este serviço"
          dica={
            responsaveis.length === 0
              ? 'Ninguém marcado: o portal oferece com qualquer pessoa da equipe.'
              : 'O portal só oferece horários de quem está marcada aqui.'
          }
        >
          <div className="flex flex-wrap gap-2">
            {equipe?.map((pessoa) => {
              const marcada = responsaveis.includes(pessoa.id)

              return (
                <button
                  key={pessoa.id}
                  type="button"
                  onClick={() => alternarResponsavel(pessoa.id)}
                  aria-pressed={marcada}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[13.5px] transition-colors',
                    marcada
                      ? 'border-transparent bg-onix-800 text-white'
                      : 'border-onix-200 bg-white text-onix-600 hover:border-marca',
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: marcada ? '#fff' : pessoa.cor }}
                  />
                  {pessoa.nome.split(' ')[0]}
                </button>
              )
            })}
          </div>
        </Campo>

        <Campo rotulo="Cor na agenda">
          <SeletorDeCor cores={CORES_DISPONIVEIS} valor={cor} aoMudar={setCor} />
        </Campo>

        <div className="space-y-3.5 rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
          <Interruptor
            ligado={noLink} aoMudar={setNoLink}
            rotulo="Disponível no link público"
            descricao="Clientes conseguem agendar este serviço sozinhas."
          />
          <div className="border-t border-onix-100 pt-3.5">
            <Interruptor
              ligado={ativo} aoMudar={setAtivo}
              rotulo="Serviço ativo"
              descricao="Desative para esconder sem apagar o histórico."
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
