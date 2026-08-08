import { CheckCircle2, CircleSlash, MessageCircle, XCircle } from 'lucide-react'
import { Botao } from '@/components/ui'
import { linkWhatsApp } from '@/utils/formato'
import { hora } from '@/utils/datas'
import type { SituacaoAgendamento } from '@/types'

/** Barra de ações rápidas de um agendamento já existente. */
export function AcoesDoAgendamento({
  inicio, nomeCliente, telefoneCliente, aoMudarSituacao, aoCancelar,
}: {
  inicio: string
  nomeCliente: string | null
  telefoneCliente: string | null
  aoMudarSituacao: (situacao: SituacaoAgendamento) => void
  aoCancelar: () => void
}) {
  const primeiroNome = nomeCliente?.split(' ')[0] ?? ''

  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-onix-100 bg-quartzo-50 p-2.5">
      <Botao variante="secundario" tamanho="sm" onClick={() => aoMudarSituacao('concluido')}>
        <CheckCircle2 className="h-3.5 w-3.5 text-sucesso" /> Concluir
      </Botao>
      <Botao variante="secundario" tamanho="sm" onClick={() => aoMudarSituacao('faltou')}>
        <CircleSlash className="h-3.5 w-3.5 text-onix-400" /> Não veio
      </Botao>
      <Botao variante="perigo" tamanho="sm" onClick={aoCancelar}>
        <XCircle className="h-3.5 w-3.5" /> Cancelar
      </Botao>

      {telefoneCliente && (
        <a
          href={linkWhatsApp(
            telefoneCliente,
            `Oi, ${primeiroNome}! Confirmando seu horário de ${hora(inicio)}. 💛`,
          )}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-onix-200 bg-white px-3.5 text-[13px] font-medium text-onix-700 transition-colors hover:bg-quartzo-50 sm:ml-auto"
        >
          <MessageCircle className="h-3.5 w-3.5 text-sucesso" /> WhatsApp
        </a>
      )}
    </div>
  )
}
