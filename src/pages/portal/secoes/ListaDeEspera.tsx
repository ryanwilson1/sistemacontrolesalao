import { BellRing, Check, Clock, ListChecks, Trash2, Users } from 'lucide-react'
import { Botao, Carta, CartaTitulo, Etiqueta } from '@/components/ui'
import { EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { useAviso } from '@/contexts'
import {
  useEsperaAvisadas, useListaDeEspera, useMarcarAtendida, useSairDaFila,
} from '@/hooks'
import { ROTULO_PERIODO } from '@/types'
import { dataRelativa, hora, tempoRelativo } from '@/utils/datas'
import { linkWhatsApp, telefone as formatarTelefone } from '@/utils/formato'
import { mensagemDeErro } from '@/utils/erros'
import type { EsperaDetalhada } from '@/types'

/**
 * Lista de espera.
 *
 * Duas fileiras: quem aguarda e quem já foi avisada de uma vaga. A
 * separação importa porque as ações são diferentes — de quem aguarda a
 * gente não cobra nada; de quem foi avisada a gente precisa saber se
 * pegou a vaga ou não.
 */
export function ListaDeEspera() {
  const { dados: fila, carregando } = useListaDeEspera()
  const { dados: avisadas } = useEsperaAvisadas()

  if (carregando) return <EsqueletoLista linhas={3} />

  if (!fila?.length && !avisadas?.length) {
    return (
      <EstadoVazio
        icone={ListChecks}
        titulo="Ninguém esperando"
        descricao="Quando o dia estiver cheio, o portal oferece à cliente entrar na fila. Aí ela aparece aqui."
      />
    )
  }

  return (
    <div className="space-y-4">
      {!!avisadas?.length && (
        <Carta>
          <CartaTitulo
            titulo="Avisadas de uma vaga"
            descricao="A primeira que confirmar fica com o horário"
          />
          <ul className="divide-y divide-onix-50">
            {avisadas.map((entrada) => (
              <Linha key={entrada.id} entrada={entrada} avisada />
            ))}
          </ul>
        </Carta>
      )}

      {!!fila?.length && (
        <Carta>
          <CartaTitulo
            titulo="Na fila"
            descricao="Por ordem de chegada — é assim que avisamos"
            acao={
              <Etiqueta className="border-onix-200 bg-onix-50 text-onix-600">
                <Users className="h-3 w-3" /> {fila.length}
              </Etiqueta>
            }
          />
          <ul className="divide-y divide-onix-50">
            {fila.map((entrada, posicao) => (
              <Linha key={entrada.id} entrada={entrada} posicao={posicao + 1} />
            ))}
          </ul>
        </Carta>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Linha({
  entrada, posicao, avisada,
}: {
  entrada: EsperaDetalhada
  posicao?: number
  avisada?: boolean
}) {
  const aviso = useAviso()
  const atender = useMarcarAtendida()
  const sair = useSairDaFila()

  const primeiroNome = entrada.nome.split(' ')[0]

  const executar = async (acao: () => Promise<unknown>, texto: string) => {
    try {
      await acao()
      aviso.sucesso(texto, entrada.nome)
    } catch (falha) {
      aviso.erro('Não foi possível concluir', mensagemDeErro(falha))
    }
  }

  return (
    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={
          avisada
            ? 'grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ouro-100 text-ouro-600'
            : 'tabular grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-quartzo-100 text-[13px] font-medium text-quartzo-700'
        }
      >
        {avisada ? <BellRing className="h-3.5 w-3.5" /> : posicao}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-onix-800">{entrada.nome}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-onix-400">
          {entrada.servico?.nome ?? 'Serviço'}
          {entrada.profissional && ` · ${entrada.profissional.nome}`}
          {' · '}
          {entrada.data ? dataRelativa(`${entrada.data}T12:00:00`) : 'qualquer dia'}
          {' · '}
          {ROTULO_PERIODO[entrada.periodo]}
        </p>

        {entrada.observacao && (
          <p className="mt-1 text-[12.5px] leading-snug text-onix-400">{entrada.observacao}</p>
        )}

        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-onix-300">
          <span>{formatarTelefone(entrada.telefone)}</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {avisada && entrada.avisadaEm
              ? `avisada ${tempoRelativo(entrada.avisadaEm)}`
              : `na fila ${tempoRelativo(entrada.criadoEm)}`}
          </span>
          {avisada && entrada.vagaInicio && (
            <span>vaga de {hora(entrada.vagaInicio)}</span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 gap-1.5">
        {avisada && (
          <Botao
            variante="secundario" tamanho="sm"
            carregando={atender.salvando}
            onClick={() => void executar(() => atender.executar(entrada.id), 'Vaga preenchida')}
          >
            <Check className="h-3.5 w-3.5 text-sucesso" /> Pegou
          </Botao>
        )}

        <a
          href={linkWhatsApp(
            entrada.telefone,
            `Oi, ${primeiroNome}! Aqui é do studio 💛`,
          )}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-onix-200 bg-white px-3 text-[13px] font-medium text-onix-700 transition-colors hover:bg-quartzo-50"
        >
          WhatsApp
        </a>

        <button
          onClick={() => void executar(() => sair.executar(entrada.id), 'Removida da lista')}
          className="rounded-lg p-2 text-onix-300 transition-colors hover:bg-onix-50 hover:text-perigo"
          aria-label={`Remover ${entrada.nome} da lista`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}
