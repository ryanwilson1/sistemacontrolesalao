import { Link } from 'react-router-dom'
import { ArrowRight, CakeSlice, MessageCircle } from 'lucide-react'
import { Carta, CartaTitulo } from '@/components/ui'
import { ROTAS } from '@/constants'
import { linkWhatsApp, telefone } from '@/utils/formato'
import type { ResumoDoDia } from '@/types'

export function Aniversariantes({ itens }: { itens: ResumoDoDia['aniversariantes'] }) {
  return (
    <Carta>
      <CartaTitulo titulo="Aniversariantes" descricao="Uma mensagem faz diferença" />

      {itens.length === 0 ? (
        <p className="py-3 text-[13px] text-onix-400">Ninguém faz aniversário hoje.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((cliente) => (
            <li key={cliente.id} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-quartzo-100 text-quartzo-700">
                <CakeSlice className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <Link
                to={ROTAS.cliente(cliente.id)}
                className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-onix-800 hover:underline"
              >
                {cliente.nome}
              </Link>
              {cliente.telefone && (
                <a
                  href={linkWhatsApp(cliente.telefone, `Feliz aniversário, ${cliente.nome.split(' ')[0]}! 🎉`)}
                  target="_blank" rel="noopener noreferrer"
                  className="shrink-0 rounded-lg p-1.5 text-onix-300 transition-colors hover:bg-quartzo-50 hover:text-sucesso"
                  aria-label={`Parabenizar ${cliente.nome} no WhatsApp`}
                  title={telefone(cliente.telefone)}
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Carta>
  )
}

export function EstoqueBaixo({ itens }: { itens: ResumoDoDia['estoqueBaixo'] }) {
  if (itens.length === 0) return null

  return (
    <Carta>
      <CartaTitulo
        titulo="Repor estoque"
        acao={
          <Link
            to={ROTAS.estoque}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-onix-500 hover:text-onix-900"
          >
            Abrir <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <ul className="space-y-2">
        {itens.slice(0, 5).map((produto) => (
          <li key={produto.id} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="truncate text-onix-700">{produto.nome}</span>
            <span className="tabular shrink-0 rounded-md bg-[#F7E9EA] px-2 py-0.5 text-[12px] font-medium text-perigo">
              {produto.quantidade} {produto.unidade}
            </span>
          </li>
        ))}
      </ul>
    </Carta>
  )
}
