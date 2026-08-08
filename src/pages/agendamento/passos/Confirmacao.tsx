import { CalendarCheck, CheckCircle2, Copy, Check } from 'lucide-react'
import { Botao, Campo, Entrada, AreaTexto } from '@/components/ui'
import { useCopiar } from '@/hooks/useCopiar'
import { dinheiro, mascaraTelefone } from '@/utils/formato'
import { dataRelativa, hora } from '@/utils/datas'
import { AdicionarAoCalendario } from '../componentes/AdicionarAoCalendario'
import { Passo } from '../componentes/Moldura'
import type { EventoDeCalendario } from '@/utils/calendario'

interface DadosResumo {
  servico: string
  profissional: string
  quando: Date | null
  valor: number
}

/** Última etapa: confere o resumo e coleta nome, telefone e observações. */
export function DadosDaCliente({
  resumo, nome, aoMudarNome, telefone, aoMudarTelefone, observacao, aoMudarObservacao,
  armadilha, aoMudarArmadilha, erro, enviando, aoConfirmar,
}: {
  resumo: DadosResumo
  nome: string
  aoMudarNome: (valor: string) => void
  telefone: string
  aoMudarTelefone: (valor: string) => void
  observacao: string
  aoMudarObservacao: (valor: string) => void
  armadilha: string
  aoMudarArmadilha: (valor: string) => void
  erro: string
  enviando: boolean
  aoConfirmar: () => void
}) {
  const linhas: [string, string][] = [
    ['Serviço', resumo.servico],
    ['Com', resumo.profissional],
    ['Quando', resumo.quando ? `${dataRelativa(resumo.quando)} às ${hora(resumo.quando)}` : ''],
    ['Valor', dinheiro(resumo.valor)],
  ]

  return (
    <Passo titulo="Seus dados">
      <div className="rounded-2xl border border-onix-100 bg-white p-4">
        <dl className="space-y-1.5 text-[13.5px]">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-3">
              <dt className="shrink-0 text-onix-400">{rotulo}</dt>
              <dd className="truncate text-right font-medium text-onix-800">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 space-y-4">
        <Campo rotulo="Seu nome" obrigatorio>
          <Entrada
            value={nome} onChange={(e) => aoMudarNome(e.target.value)}
            placeholder="Nome completo" maxLength={120} autoFocus
          />
        </Campo>

        <Campo rotulo="Telefone com DDD" obrigatorio dica="Usamos só para confirmar seu horário.">
          <Entrada
            value={telefone} onChange={(e) => aoMudarTelefone(mascaraTelefone(e.target.value))}
            placeholder="(11) 98765-4321" inputMode="tel"
          />
        </Campo>

        <Campo rotulo="Observações" dica="Alergia, preferência, alguma coisa que devemos saber.">
          <AreaTexto
            value={observacao} onChange={(e) => aoMudarObservacao(e.target.value)}
            placeholder="Opcional" maxLength={2000} rows={2}
          />
        </Campo>

        {/* Armadilha invisível: pessoas não veem, robôs preenchem. */}
        <input
          type="text" value={armadilha} onChange={(e) => aoMudarArmadilha(e.target.value)}
          tabIndex={-1} autoComplete="off" aria-hidden
          className="absolute left-[-9999px] h-px w-px opacity-0"
        />

        {erro && (
          <p className="rounded-xl border border-[#EBD2D4] bg-[#FBF3F4] px-3.5 py-2.5 text-[13px] text-perigo">
            {erro}
          </p>
        )}

        <Botao variante="ouro" tamanho="lg" bloco onClick={aoConfirmar} carregando={enviando}>
          <CalendarCheck className="h-4 w-4" /> Confirmar agendamento
        </Botao>
      </div>
    </Passo>
  )
}

/**
 * Tela de confirmação.
 *
 * O protocolo tem destaque de título porque é a única coisa que a
 * cliente precisa guardar: é com ele que ela volta ao portal para pedir
 * alteração ou cancelamento, sem senha e sem cadastro.
 */
export function Reservado({
  quando, servico, profissional, protocolo, confirmacaoManual, telefoneDigitado, evento,
}: {
  quando: Date | null
  servico: string
  profissional: string
  protocolo: string
  confirmacaoManual: boolean
  telefoneDigitado: string
  evento: EventoDeCalendario | null
}) {
  const { copiado, copiar } = useCopiar()

  return (
    <div className="rounded-3xl bg-white p-7 text-center shadow-carta">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#E8F0EA] text-sucesso">
        <CheckCircle2 className="h-8 w-8" strokeWidth={1.5} />
      </span>

      <h2 className="mt-5 font-display text-[22px] font-light tracking-tight text-onix-900">
        {confirmacaoManual ? 'Pedido enviado' : 'Horário confirmado'}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-onix-400">
        {quando && `${dataRelativa(quando)} às ${hora(quando)}`}
        <br />
        {servico} com {profissional}
      </p>

      <div className="mt-5 rounded-2xl border border-onix-100 bg-quartzo-50 p-4">
        <p className="eyebrow">Seu protocolo</p>
        <p className="tabular mt-1 font-display text-[26px] font-light tracking-[0.12em] text-onix-900">
          {protocolo}
        </p>
        <button
          onClick={() => void copiar(protocolo)}
          className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-onix-400 transition-colors hover:text-onix-800"
        >
          {copiado ? (
            <><Check className="h-3.5 w-3.5 text-sucesso" /> Copiado</>
          ) : (
            <><Copy className="h-3.5 w-3.5" /> Copiar</>
          )}
        </button>
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-onix-400">
        {confirmacaoManual
          ? 'O studio vai confirmar seu horário em breve pelo WhatsApp.'
          : 'Guarde o protocolo: é com ele que você consulta ou pede mudança no horário.'}
      </p>

      {telefoneDigitado && (
        <p className="mt-2 text-[12px] text-onix-300">
          Vamos lembrar você no {mascaraTelefone(telefoneDigitado)}.
        </p>
      )}

      {/*
        Só quando o horário já vale. Num pedido aguardando confirmação,
        salvar no calendário criaria um compromisso que talvez não
        exista — e a cliente apareceria na porta acreditando nele.
      */}
      {evento && !confirmacaoManual && <AdicionarAoCalendario evento={evento} />}
    </div>
  )
}
