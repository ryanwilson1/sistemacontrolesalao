import { Link } from 'react-router-dom'
import { AreaTexto, Botao, Campo, CampoMoeda, Entrada, Modal, Selecao } from '@/components/ui'
import { Confirmar } from '@/components/feedback'
import { useSessao } from '@/contexts'
import { ROTAS } from '@/constants'
import { dinheiro, duracao } from '@/utils/formato'
import { dataRelativa, hora, isoData } from '@/utils/datas'
import { SeletorDeCliente } from './componentes/SeletorDeCliente'
import { SeletorDeHorario } from './componentes/SeletorDeHorario'
import { AcoesDoAgendamento } from './componentes/AcoesDoAgendamento'
import { AvisarListaDeEspera } from './componentes/AvisarListaDeEspera'
import { OrigemDoAgendamento } from './componentes/OrigemDoAgendamento'
import { usarFormularioDeAgendamento } from './usarFormularioDeAgendamento'
import type { AgendamentoDetalhado } from '@/types'

interface Props {
  aberto: boolean
  aoFechar: () => void
  agendamento?: AgendamentoDetalhado | null
  inicioSugerido?: Date
  profissionalSugerido?: string
}

/** Criar e editar agendamento. Todo o estado mora no hook ao lado. */
export function FormularioAgendamento(props: Props) {
  const { aberto, aoFechar, agendamento } = props
  const formulario = usarFormularioDeAgendamento(props)
  const { soAgenda } = useSessao()

  return (
    <>
      <Modal
        aberto={aberto}
        aoFechar={aoFechar}
        titulo={formulario.editando ? 'Agendamento' : 'Novo agendamento'}
        descricao={
          formulario.editando && agendamento
            ? `${dataRelativa(agendamento.inicio)} · ${hora(agendamento.inicio)}`
            : 'Escolha o serviço e o horário disponível.'
        }
        rodape={
          <>
            <Botao variante="fantasma" onClick={aoFechar}>Fechar</Botao>
            <Botao variante="ouro" onClick={() => void formulario.enviar()} carregando={formulario.salvando}>
              {formulario.editando ? 'Salvar alterações' : 'Confirmar agendamento'}
            </Botao>
          </>
        }
      >
        <div className="space-y-5 pb-1">
          {formulario.editando && agendamento && <OrigemDoAgendamento agendamento={agendamento} />}

          {formulario.editando && agendamento && !formulario.encerrado && (
            <AcoesDoAgendamento
              inicio={agendamento.inicio}
              nomeCliente={formulario.cliente?.nome ?? agendamento.nomeAvulso}
              telefoneCliente={formulario.cliente?.telefone ?? agendamento.telefoneAvulso}
              aoMudarSituacao={(situacao) => void formulario.alterarSituacao(situacao)}
              aoCancelar={() => formulario.setConfirmandoCancelamento(true)}
            />
          )}

          <SeletorDeCliente
            cliente={formulario.cliente}
            aoEscolher={formulario.setCliente}
            busca={formulario.busca}
            aoBuscar={formulario.setBusca}
            sugestoes={formulario.sugestoes}
            buscando={formulario.buscando}
            modoNovo={formulario.modoNovoCliente}
            aoAlternarModo={formulario.setModoNovoCliente}
            nome={formulario.novoNome}
            aoMudarNome={formulario.setNovoNome}
            fone={formulario.novoFone}
            aoMudarFone={formulario.setNovoFone}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Serviço"
              obrigatorio
              dica={formulario.servico ? `${duracao(formulario.servico.duracaoMinutos)} de atendimento` : undefined}
            >
              <Selecao
                value={formulario.servicoId}
                onChange={(e) => { formulario.setServicoId(e.target.value); formulario.setHorario('') }}
              >
                <option value="">Escolha o serviço</option>
                {formulario.servicos?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome} · {duracao(item.duracaoMinutos)}
                    {soAgenda ? '' : ` · ${dinheiro(item.preco)}`}
                  </option>
                ))}
              </Selecao>
            </Campo>

            <Campo rotulo="Profissional" obrigatorio>
              <Selecao
                value={formulario.profissionalId}
                onChange={(e) => { formulario.setProfissionalId(e.target.value); formulario.setHorario('') }}
              >
                <option value="">Escolha quem atende</option>
                {formulario.atendentes?.map((item) => (
                  <option key={item.id} value={item.id}>{item.nome}</option>
                ))}
              </Selecao>
            </Campo>
          </div>

          <Campo rotulo="Data" obrigatorio>
            <Entrada
              type="date" value={formulario.data} min={isoData(new Date())}
              onChange={(e) => { formulario.setData(e.target.value); formulario.setHorario('') }}
            />
          </Campo>

          <SeletorDeHorario
            horarios={formulario.listaHorarios}
            valor={formulario.horario}
            aoEscolher={formulario.setHorario}
            carregando={formulario.carregandoHorarios}
            pronto={!!formulario.servicoId && !!formulario.profissionalId}
          />

          {/*
            Valor e desconto só para quem cuida do dinheiro.

            Escondidos, o preço continua vindo do cadastro do serviço —
            é o que `usarFormularioDeAgendamento` já faz ao escolher o
            serviço. Ou seja: ela marca o horário, o valor entra
            correto, e ninguém precisa conferir depois.

            Deixar os campos visíveis e apenas travados seria pior:
            mostraria a tabela de preços a quem não deve vê-la, e ainda
            pareceria defeito.
          */}
          {!soAgenda && (
            <div className="grid gap-4 sm:grid-cols-2">
              {/*
                `CampoMoeda`, não `type="number"`.

                O formulário guarda o preço em formato brasileiro —
                `formatarMoedaBR` grava "100,00" — e o campo numérico do
                navegador **recusa a vírgula**. O estrago era duplo e
                silencioso:

                  · abrir um agendamento existente mostrava o campo de
                    valor VAZIO, como se não houvesse preço;
                  · `Number("100,00")` é NaN, então o "Total" ao lado do
                    desconto sumia.

                O console acusava "The specified value '100,00' cannot
                be parsed", que ninguém vê. A proprietária via o campo
                em branco e concluía que o sistema tinha perdido o
                valor.

                Este componente já existia e é usado nos outros dez
                formulários financeiros. Estes dois campos ficaram para
                trás.
              */}
              <Campo rotulo="Valor">
                <CampoMoeda value={formulario.preco} onChange={formulario.setPreco} />
              </Campo>
              <Campo rotulo="Desconto" dica={formulario.total > 0 ? `Total: ${dinheiro(formulario.total)}` : undefined}>
                <CampoMoeda value={formulario.desconto} onChange={formulario.setDesconto} />
              </Campo>
            </div>
          )}

          <Campo rotulo="Observação" dica="Preferências, alergias, combinados do atendimento.">
            <AreaTexto
              value={formulario.observacao} onChange={(e) => formulario.setObservacao(e.target.value)}
              placeholder="Ex.: prefere tom mais frio, alérgica a amônia" maxLength={2000}
            />
          </Campo>

          {formulario.editando && agendamento?.clienteId && (
            <Link
              to={ROTAS.cliente(agendamento.clienteId)}
              onClick={aoFechar}
              className="inline-block text-[13px] font-medium text-onix-600 underline decoration-marca decoration-2 underline-offset-4"
            >
              Abrir ficha completa da formulario.cliente
            </Link>
          )}
        </div>
      </Modal>

      <Confirmar
        aberto={formulario.confirmandoCancelamento}
        aoFechar={() => formulario.setConfirmandoCancelamento(false)}
        aoConfirmar={() => void formulario.alterarSituacao('cancelado')}
        titulo="Cancelar este agendamento?"
        descricao="O horário volta a ficar livre para outras clientes. A ficha da formulario.cliente guarda o registro."
        rotuloConfirmar="Cancelar agendamento"
        destrutivo
        carregando={formulario.mudandoSituacao}
      />

      <AvisarListaDeEspera
        aberto={!!formulario.vagaAberta}
        aoFechar={formulario.fecharAviso}
        interessadas={formulario.interessadas}
        vaga={
          formulario.vagaAberta
            ? {
                servicoId: formulario.vagaAberta.servicoId,
                profissionalId: formulario.vagaAberta.profissionalId,
                inicio: formulario.vagaAberta.inicio,
                fim: formulario.vagaAberta.fim,
              }
            : null
        }
      />
    </>
  )
}
