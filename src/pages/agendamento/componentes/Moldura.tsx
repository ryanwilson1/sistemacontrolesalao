import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Info, MapPin, Phone, Timer } from 'lucide-react'
import { FileteDeOuro } from '@/components/common'
import { ROTAS } from '@/constants'
import { mascaraTelefone } from '@/utils/formato'
import { cn } from '@/utils/cn'
import type { Studio } from '@/types'

/**
 * Moldura do portal.
 *
 * Vive fora de `components/` de propósito: nada aqui é reaproveitado
 * pelo painel, e a página pública carrega em pacote próprio — não baixa
 * uma linha da agenda interna.
 */

export function CabecalhoDoPortal({
  studio, compacto,
}: {
  studio: Studio
  compacto?: boolean
}) {
  /*
    O portal precisa parecer do salão, não do System Studio.

    A versão anterior estampava o monograma "eb" — as iniciais fixas no
    código, de um salão de demonstração. Toda cliente de todo salão
    abria o link e via as iniciais de outra pessoa.

    A ordem abaixo é a de quem tem o quê: logo enviada, senão as
    iniciais do próprio nome. O nome fantasia vem antes do nome
    cadastrado porque é assim que a cliente conhece a casa.
  */
  const nome = studio.nomeFantasia?.trim() || studio.nome
  const iniciais = monograma(nome)

  return (
    <header className="overflow-hidden bg-white/70 backdrop-blur-sm">
      {!compacto && studio.capaUrl && (
        <div className="h-28 w-full sm:h-36">
          <img
            src={studio.capaUrl}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className={cn('px-5 text-center', compacto ? 'py-5' : 'py-8')}>
        {studio.logoUrl ? (
          <img
            src={studio.logoUrl}
            alt={nome}
            className={cn(
              'mx-auto w-auto object-contain',
              compacto ? 'max-h-10' : 'max-h-16',
              // Sobe por cima da capa quando as duas existem.
              !compacto && studio.capaUrl && '-mt-14 rounded-2xl bg-white p-2 shadow-carta',
            )}
          />
        ) : (
          <p
            className={cn(
              'font-assinatura italic leading-none text-marca',
              compacto ? 'text-[32px]' : 'text-[46px]',
            )}
            aria-hidden
          >
            {iniciais}
          </p>
        )}

        <h1 className="mt-3 font-display text-[13px] uppercase tracking-[0.24em] text-onix-800">
          {nome}
        </h1>

        {studio.slogan && (
          <p className="mt-1.5 text-[13px] italic leading-snug text-onix-400">{studio.slogan}</p>
        )}

        <FileteDeOuro className="mx-auto mt-4 w-14" />

        {!compacto && studio.descricao && (
          <p className="mx-auto mt-4 max-w-sm text-[13px] leading-relaxed text-onix-500">
            {studio.descricao}
          </p>
        )}

        {!compacto && (studio.endereco || studio.telefone) && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12.5px] text-onix-400">
            {studio.endereco && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {studio.endereco}
              </span>
            )}
            {studio.telefone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" aria-hidden /> {mascaraTelefone(studio.telefone)}
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

/** "Studio Emely Barbosa" -> "SE". Duas letras cabem no espaço. */
function monograma(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return '•'
  if (palavras.length === 1) return palavras[0].slice(0, 2).toLowerCase()
  return (palavras[0][0] + palavras[1][0]).toLowerCase()
}

/** Recado que a proprietária escreve em Ajustes. Só aparece se existir. */
export function RecadoDoStudio({ texto }: { texto: string | null }) {
  if (!texto?.trim()) return null

  return (
    <p className="mb-5 flex items-start gap-2.5 rounded-2xl border border-ouro-200 bg-ouro-100/60 px-4 py-3 text-[13px] leading-relaxed text-ouro-700">
      <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
      {texto}
    </p>
  )
}

/** Moldura de cada etapa do agendamento público. */
export function Passo({
  titulo, resumo, children,
}: {
  titulo: string
  resumo?: string
  children: ReactNode
}) {
  return (
    <section>
      <h2 className="font-display text-[19px] font-light tracking-tight text-onix-900">{titulo}</h2>
      {resumo && <p className="mb-4 mt-1 text-[13px] text-onix-400">{resumo}</p>}
      <div className={resumo ? '' : 'mt-4'}>{children}</div>
    </section>
  )
}

/** Barra de progresso das etapas. */
export function Progresso({ etapaAtual }: { etapaAtual: string }) {
  const ordem = ['servico', 'profissional', 'horario', 'dados']

  return (
    <div className="mb-5 flex gap-1.5">
      {ordem.map((passo, indice) => (
        <span
          key={passo}
          className={
            ordem.indexOf(etapaAtual) >= indice
              ? 'h-1 flex-1 rounded-full bg-marca transition-colors duration-300'
              : 'h-1 flex-1 rounded-full bg-onix-100 transition-colors duration-300'
          }
        />
      ))}
    </div>
  )
}

/**
 * O relógio da reserva.
 *
 * Fica fixo no rodapé enquanto o horário está preso. Mostrar o tempo é
 * o que transforma a regra em algo justo: a cliente sabe que tem pressa
 * e sabe quanta.
 */
export function RelogioDaReserva({
  texto, urgente, aoDesistir,
}: {
  texto: string
  urgente: boolean
  aoDesistir: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-onix-100 bg-white/95 px-5 py-3 pb-safe backdrop-blur-lg">
      <div className="mx-auto flex w-full max-w-lg items-center gap-3">
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors',
            urgente ? 'bg-[#F7E9EA] text-perigo' : 'bg-quartzo-100 text-quartzo-700',
          )}
        >
          <Timer className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-onix-500">
          Seu horário está guardado por{' '}
          <span className={cn('tabular font-medium', urgente ? 'text-perigo' : 'text-onix-800')}>
            {texto}
          </span>
        </p>
        <button
          onClick={aoDesistir}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-onix-400 transition-colors hover:text-onix-800"
        >
          Desistir
        </button>
      </div>
    </div>
  )
}

/** Aviso de página inteira quando o portal não está disponível. */
export function TelaSimples({
  titulo, texto, acao,
}: {
  titulo: string
  texto: string
  acao?: ReactNode
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-quartzo px-6">
      <div className="max-w-sm text-center">
        <p className="font-assinatura text-[52px] italic leading-none text-ouro-500">eb</p>
        <h1 className="mt-5 font-display text-[21px] font-light tracking-tight text-onix-900">
          {titulo}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-onix-400">{texto}</p>
        {acao && <div className="mt-6">{acao}</div>}
      </div>
    </div>
  )
}

/** Rodapé com o atalho para consultar um horário já marcado. */
export function RodapeDoPortal({ identificador }: { identificador: string }) {
  return (
    <p className="mt-8 text-center text-[12.5px] text-onix-400">
      Já tem horário marcado?{' '}
      <Link
        to={ROTAS.meuHorario(identificador)}
        className="inline-flex items-center gap-1 font-medium text-onix-600 underline decoration-onix-200 underline-offset-4 transition-colors hover:text-onix-900"
      >
        <Clock className="h-3.5 w-3.5" /> Consultar
      </Link>
    </p>
  )
}
