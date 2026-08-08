import { Globe, MessageSquareQuote, Phone } from 'lucide-react'
import { Etiqueta } from '@/components/ui'
import { SITUACAO } from '@/constants'
import { telefone as formatarTelefone, linkWhatsApp } from '@/utils/formato'
import { dataRelativa, hora } from '@/utils/datas'
import type { AgendamentoDetalhado } from '@/types'

/**
 * Ficha rápida de um agendamento que veio do portal.
 *
 * Reúne o que a proprietária precisa antes de decidir qualquer coisa:
 * quem marcou, por onde, com que protocolo e o que a cliente escreveu.
 *
 * O protocolo aparece porque é por ele que a cliente fala do próprio
 * horário — "é o ABC123" resolve um telefonema que sem código viraria
 * "aquele de terça, acho que às três".
 */
export function OrigemDoAgendamento({
  agendamento,
}: {
  agendamento: AgendamentoDetalhado
}) {
  const veioDoPortal = agendamento.origem === 'link'
  const situacao = SITUACAO[agendamento.situacao]

  const telefone = agendamento.cliente?.whatsapp
    ?? agendamento.cliente?.telefone
    ?? agendamento.telefoneAvulso

  const nome = agendamento.cliente?.nome ?? agendamento.nomeAvulso ?? 'Cliente'

  return (
    <div className="space-y-3 rounded-2xl border border-onix-100 bg-quartzo-50 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Etiqueta className={situacao.classe} ponto={situacao.ponto}>
          {situacao.rotulo}
        </Etiqueta>

        {veioDoPortal && (
          <Etiqueta className="border-ouro-200 bg-ouro-100 text-ouro-700">
            <Globe className="h-3 w-3" /> Portal
          </Etiqueta>
        )}

        {agendamento.protocolo && (
          <span className="tabular ml-auto text-[12px] tracking-[0.14em] text-onix-400">
            {agendamento.protocolo}
          </span>
        )}
      </div>

      <dl className="space-y-1.5 text-[13px]">
        <Linha rotulo="Cliente" valor={nome} />
        <Linha
          rotulo="Quando"
          valor={`${dataRelativa(agendamento.inicio)} · ${hora(agendamento.inicio)} às ${hora(agendamento.fim)}`}
        />
        {agendamento.profissional && (
          <Linha rotulo="Com" valor={agendamento.profissional.nome} />
        )}
        {telefone && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-onix-400">Telefone</dt>
            <dd className="truncate text-right">
              <a
                href={linkWhatsApp(telefone)}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-onix-800 underline decoration-marca decoration-2 underline-offset-4"
              >
                <Phone className="h-3 w-3 text-sucesso" />
                {formatarTelefone(telefone)}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {agendamento.observacao && (
        <div className="rounded-xl border border-onix-100 bg-white p-3">
          <p className="eyebrow flex items-center gap-1.5 text-onix-400">
            <MessageSquareQuote className="h-3 w-3" /> Observação da cliente
          </p>
          <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-onix-600">
            {agendamento.observacao}
          </p>
        </div>
      )}

      {agendamento.remarcacoes.length > 0 && (
        <p className="text-[12px] leading-snug text-onix-400">
          Já foi remarcado {agendamento.remarcacoes.length}{' '}
          {agendamento.remarcacoes.length === 1 ? 'vez' : 'vezes'}.
        </p>
      )}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-onix-400">{rotulo}</dt>
      <dd className="truncate text-right font-medium text-onix-800">{valor}</dd>
    </div>
  )
}
