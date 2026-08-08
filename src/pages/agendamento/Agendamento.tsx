import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { CarregandoTela } from '@/components/feedback'
import { usarFluxoDoPortal } from './usarFluxoDoPortal'
import {
  CabecalhoDoPortal, Progresso, RecadoDoStudio, RelogioDaReserva,
  RodapeDoPortal, TelaSimples,
} from './componentes/Moldura'
import { EscolhaProfissional, EscolhaServico } from './passos/EscolhaServico'
import { EscolhaHorario } from './passos/EscolhaHorario'
import { DadosDaCliente, Reservado } from './passos/Confirmacao'
import { EntrarNaEspera, NaEspera } from './passos/ListaDeEspera'

/**
 * Portal de Agendamento.
 *
 * Roda sem sessão, em pacote próprio: não baixa uma linha do painel.
 * Mostra só o que a cliente precisa — serviços liberados para o portal,
 * quem sabe fazer cada um e horários realmente livres.
 *
 * A agenda que ela vê é a mesma da proprietária. Não existe cópia,
 * espelho nem sincronização entre duas listas: é o mesmo repositório,
 * as mesmas regras de conflito, o mesmo motor de horários.
 */
export default function Agendamento() {
  const { identificador } = useParams<{ identificador: string }>()
  const fluxo = usarFluxoDoPortal(identificador)

  if (fluxo.carregando) return <CarregandoTela mensagem="Abrindo agenda" />

  const { studio } = fluxo

  if (!studio || !studio.agendamentoAtivo) {
    return (
      <TelaSimples
        titulo="Agendamento indisponível"
        texto="No momento não estamos recebendo marcações por aqui. Fale com o studio pelo WhatsApp."
      />
    )
  }

  if (fluxo.servicos.length === 0 || fluxo.profissionais.length === 0) {
    return (
      <TelaSimples
        titulo="Agenda em preparação"
        texto="Os serviços ainda estão sendo configurados. Volte em instantes."
      />
    )
  }

  const { etapa } = fluxo
  const finalizado = etapa === 'pronto' || etapa === 'na_espera'
  const podeVoltar = !finalizado && etapa !== 'servico'

  return (
    <div className="min-h-dvh bg-quartzo pb-12">
      <CabecalhoDoPortal studio={studio} />

      <main className="mx-auto w-full max-w-lg px-5 pt-6">
        {!finalizado && <RecadoDoStudio texto={studio.recadoDoPortal} />}

        {podeVoltar && (
          <button
            onClick={fluxo.voltar}
            className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-onix-400 transition-colors hover:text-onix-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
        )}

        {!finalizado && etapa !== 'espera' && <Progresso etapaAtual={etapa} />}

        <AnimatePresence mode="wait">
          <motion.div
            key={etapa}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            {etapa === 'servico' && (
              <EscolhaServico servicos={fluxo.servicos} aoEscolher={fluxo.escolherServico} />
            )}

            {etapa === 'profissional' && fluxo.servico && (
              <EscolhaProfissional
                profissionais={fluxo.profissionais.filter(
                  (p) =>
                    fluxo.servico!.profissionaisIds.length === 0 ||
                    fluxo.servico!.profissionaisIds.includes(p.id),
                )}
                resumo={fluxo.servico.nome}
                aoEscolher={fluxo.escolherProfissional}
              />
            )}

            {etapa === 'horario' && (
              <>
                <EscolhaHorario
                  resumo={`${fluxo.servico?.nome ?? ''}${
                    fluxo.profissional ? ` · ${fluxo.profissional.nome}` : ' · qualquer profissional'
                  }`}
                  datas={fluxo.datasDisponiveis}
                  dataEscolhida={fluxo.data}
                  aoTrocarData={fluxo.trocarData}
                  horarios={fluxo.grade.dados ?? []}
                  horarioEscolhido={fluxo.reserva?.inicio ?? null}
                  aoEscolherHorario={(opcao) => void fluxo.escolherHorario(opcao)}
                  carregando={fluxo.grade.carregando}
                  reservando={fluxo.reservando}
                  aoContinuar={() => fluxo.setEtapa('dados')}
                  aoEntrarNaFila={() => fluxo.setEtapa('espera')}
                  ofereceEspera={studio.listaEsperaAtiva}
                />

                {fluxo.erro && (
                  <p className="mt-4 rounded-xl border border-[#EBD2D4] bg-[#FBF3F4] px-3.5 py-2.5 text-[13px] text-perigo">
                    {fluxo.erro}
                  </p>
                )}
              </>
            )}

            {etapa === 'dados' && (
              <DadosDaCliente
                resumo={{
                  servico: fluxo.servico?.nome ?? '',
                  profissional:
                    fluxo.profissionais.find((p) => p.id === fluxo.reserva?.profissionalId)?.nome ??
                    fluxo.profissional?.nome ?? '',
                  quando: fluxo.reserva ? new Date(fluxo.reserva.inicio) : null,
                  valor: fluxo.servico?.preco ?? 0,
                }}
                nome={fluxo.nome} aoMudarNome={fluxo.setNome}
                telefone={fluxo.telefone} aoMudarTelefone={fluxo.setTelefone}
                observacao={fluxo.observacao} aoMudarObservacao={fluxo.setObservacao}
                armadilha={fluxo.armadilha} aoMudarArmadilha={fluxo.setArmadilha}
                erro={fluxo.erro} enviando={fluxo.enviando}
                aoConfirmar={() => void fluxo.enviarAgendamento()}
              />
            )}

            {etapa === 'espera' && (
              <EntrarNaEspera
                servico={fluxo.servico?.nome ?? ''}
                data={new Date(`${fluxo.data}T12:00:00`)}
                periodo={fluxo.periodo} aoMudarPeriodo={fluxo.setPeriodo}
                nome={fluxo.nome} aoMudarNome={fluxo.setNome}
                telefone={fluxo.telefone} aoMudarTelefone={fluxo.setTelefone}
                observacao={fluxo.observacao} aoMudarObservacao={fluxo.setObservacao}
                erro={fluxo.erro} enviando={fluxo.entrandoNaFila}
                aoEnviar={() => void fluxo.enviarEspera()}
                aoVoltar={() => fluxo.setEtapa('horario')}
              />
            )}

            {etapa === 'pronto' && (
              <Reservado
                quando={fluxo.confirmado ? new Date(fluxo.confirmado.inicio) : null}
                servico={fluxo.servico?.nome ?? ''}
                profissional={
                  fluxo.profissionais.find((p) => p.id === fluxo.confirmado?.profissionalId)?.nome ??
                  'a equipe'
                }
                protocolo={fluxo.confirmado?.protocolo ?? '------'}
                confirmacaoManual={studio.confirmacaoManual}
                telefoneDigitado={fluxo.telefone}
                evento={
                  fluxo.confirmado
                    ? {
                        titulo: `${fluxo.servico?.nome ?? 'Horário'} · ${studio.nome}`,
                        inicio: new Date(fluxo.confirmado.inicio),
                        fim: new Date(fluxo.confirmado.fim),
                        descricao: `Protocolo ${fluxo.confirmado.protocolo}`,
                        local: studio.endereco ?? undefined,
                      }
                    : null
                }
              />
            )}

            {etapa === 'na_espera' && (
              <NaEspera nome={fluxo.nome} servico={fluxo.servico?.nome ?? ''} />
            )}
          </motion.div>
        </AnimatePresence>

        {identificador && <RodapeDoPortal identificador={identificador} />}
      </main>

      {/*
        O relógio só aparece quando há um horário preso. É um contrato à
        vista: a cliente sabe que tem pressa, e sabe quanta.
      */}
      {fluxo.reserva && etapa !== 'pronto' && (
        <RelogioDaReserva
          texto={fluxo.relogio}
          urgente={fluxo.urgente}
          aoDesistir={fluxo.desistirDaReserva}
        />
      )}
    </div>
  )
}
