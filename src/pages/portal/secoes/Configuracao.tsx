import { AreaTexto, Campo, Carta, CartaTitulo, Entrada, Interruptor, Selecao } from '@/components/ui'
import { CompartilharLink } from '@/components/common'
import { useAviso } from '@/contexts'
import { useAtendentes, useSalvarStudio, useStudio } from '@/hooks'
import { ROTAS } from '@/constants'
import { mensagemDeErro } from '@/utils/erros'
import type { Studio } from '@/types'

/**
 * Configuração do portal.
 *
 * Tudo que muda o comportamento do link fica aqui, num lugar só. Antes
 * estava espalhado entre Ajustes e o código — e o que está no código a
 * proprietária não consegue mudar sozinha.
 */
export function Configuracao() {
  const { dados: studio, recarregar } = useStudio()
  const { dados: equipe } = useAtendentes()
  const salvar = useSalvarStudio()
  const aviso = useAviso()

  if (!studio) return null

  const endereco = `${window.location.origin}${ROTAS.agendamentoPublico(studio.identificador)}`

  const aplicar = async (mudancas: Partial<Studio>, texto?: string) => {
    try {
      await salvar.executar(mudancas)
      recarregar()
      if (texto) aviso.sucesso(texto)
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <div className="space-y-4">
      <Carta>
        <CartaTitulo
          titulo="O link da sua cliente"
          descricao="Envie no WhatsApp ou coloque na bio do Instagram"
        />

        <CompartilharLink
          endereco={endereco}
          nomeDoSalao={studio.nomeFantasia?.trim() || studio.nome}
        />

        <Campo
          className="mt-4"
          rotulo="Recado no topo do portal"
          dica="Aparece para toda cliente que abrir o link. Deixe vazio para não mostrar nada."
        >
          <AreaTexto
            defaultValue={studio.recadoDoPortal ?? ''}
            onBlur={(e) => void aplicar({ recadoDoPortal: e.target.value.trim() || null })}
            placeholder="Ex.: chegue com 10 minutinhos de antecedência"
            maxLength={280} rows={2}
          />
        </Campo>
      </Carta>

      <Carta>
        <CartaTitulo titulo="Como o portal se comporta" />

        <div className="space-y-3.5">
          <Interruptor
            ligado={studio.agendamentoAtivo}
            aoMudar={(v) => void aplicar({ agendamentoAtivo: v }, v ? 'Portal aberto' : 'Portal pausado')}
            rotulo="Portal aberto"
            descricao="Desligue para pausar as marcações sem tirar o link do ar."
          />

          <div className="border-t border-onix-50 pt-3.5">
            <Interruptor
              ligado={studio.confirmacaoManual}
              aoMudar={(v) => void aplicar({ confirmacaoManual: v })}
              rotulo="Eu confirmo cada agendamento"
              descricao="Os pedidos chegam aguardando seu aval em vez de já entrarem confirmados."
            />
          </div>

          <div className="border-t border-onix-50 pt-3.5">
            <Interruptor
              ligado={studio.escolhaDeProfissional}
              aoMudar={(v) => void aplicar({ escolhaDeProfissional: v })}
              rotulo="A cliente escolhe com quem"
              descricao="Desligado, o sistema distribui sozinho entre quem está livre."
            />
          </div>

          <div className="border-t border-onix-50 pt-3.5">
            <Interruptor
              ligado={studio.aceitaSolicitacoes}
              aoMudar={(v) => void aplicar({ aceitaSolicitacoes: v })}
              rotulo="Aceitar pedidos de mudança"
              descricao="A cliente pede alteração ou cancelamento pelo portal. Quem decide continua sendo você."
            />
          </div>

          <div className="border-t border-onix-50 pt-3.5">
            <Interruptor
              ligado={studio.listaEsperaAtiva}
              aoMudar={(v) => void aplicar({ listaEsperaAtiva: v })}
              rotulo="Oferecer lista de espera"
              descricao="Quando o dia está cheio, o portal pergunta se ela quer ser avisada de vagas."
            />
          </div>
        </div>
      </Carta>

      <Carta>
        <CartaTitulo
          titulo="Limites da agenda"
          descricao="Valem para o portal e para a agenda interna"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Atendimentos ao mesmo tempo"
            dica="Quantas clientes cabem no espaço de uma vez. 0 = só o limite da equipe."
          >
            <Selecao
              defaultValue={String(studio.atendimentosSimultaneos)}
              onChange={(e) => void aplicar({ atendimentosSimultaneos: Number(e.target.value) })}
            >
              <option value="0">Sem limite além da equipe</option>
              {Array.from({ length: Math.max(equipe?.length ?? 1, 6) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} ao mesmo tempo</option>
              ))}
            </Selecao>
          </Campo>

          <Campo
            rotulo="Tempo para concluir"
            dica="Quanto o horário fica guardado enquanto a cliente preenche."
          >
            <Selecao
              defaultValue={String(studio.reservaMinutos)}
              onChange={(e) => void aplicar({ reservaMinutos: Number(e.target.value) })}
            >
              {[3, 5, 8, 10, 15].map((n) => (
                <option key={n} value={n}>{n} minutos</option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Antecedência mínima" dica="Quanto tempo antes ela ainda consegue marcar.">
            <Selecao
              defaultValue={String(studio.antecedenciaMinutos)}
              onChange={(e) => void aplicar({ antecedenciaMinutos: Number(e.target.value) })}
            >
              <option value="0">Sem antecedência</option>
              <option value="60">1 hora antes</option>
              <option value="120">2 horas antes</option>
              <option value="360">6 horas antes</option>
              <option value="1440">1 dia antes</option>
            </Selecao>
          </Campo>

          <Campo rotulo="Até quantos dias à frente" dica="O horizonte que o portal mostra.">
            <Entrada
              type="number" min="1" max="180" inputMode="numeric"
              defaultValue={studio.horizonteDias}
              onBlur={(e) => void aplicar({ horizonteDias: Number(e.target.value) || 30 })}
            />
          </Campo>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-onix-400">
          Dias de funcionamento, abertura, fechamento e almoço ficam em{' '}
          <span className="font-medium text-onix-600">Ajustes → Horários</span>. Folgas,
          feriados e bloqueios pontuais entram pela própria agenda.
        </p>
      </Carta>
    </div>
  )
}
