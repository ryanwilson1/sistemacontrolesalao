import { Search, Trash2, UserPlus } from 'lucide-react'
import { Campo, Entrada } from '@/components/ui'
import { Esqueleto } from '@/components/feedback'
import { mascaraTelefone, telefone } from '@/utils/formato'
import type { Cliente } from '@/types'

interface Props {
  cliente: Cliente | null
  aoEscolher: (cliente: Cliente | null) => void
  busca: string
  aoBuscar: (termo: string) => void
  sugestoes: Cliente[] | undefined
  buscando: boolean
  modoNovo: boolean
  aoAlternarModo: (novo: boolean) => void
  nome: string
  aoMudarNome: (valor: string) => void
  fone: string
  aoMudarFone: (valor: string) => void
}

/**
 * Escolha da cliente no agendamento.
 *
 * Três estados: já escolhida, buscando entre as cadastradas, ou cadastrando
 * na hora. Separado do formulário porque sozinho já tinha ~90 linhas.
 */
export function SeletorDeCliente({
  cliente, aoEscolher, busca, aoBuscar, sugestoes, buscando,
  modoNovo, aoAlternarModo, nome, aoMudarNome, fone, aoMudarFone,
}: Props) {
  if (cliente) {
    return (
      <Campo rotulo="Cliente" obrigatorio>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-onix-200 bg-white px-3.5 py-2.5">
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium text-onix-800">
              {cliente.nome}
            </span>
            {cliente.telefone && (
              <span className="block text-[12.5px] text-onix-400">
                {telefone(cliente.telefone)}
              </span>
            )}
          </span>
          <button
            onClick={() => { aoEscolher(null); aoBuscar('') }}
            className="shrink-0 rounded-lg p-1.5 text-onix-300 transition-colors hover:text-perigo"
            aria-label="Trocar cliente"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </Campo>
    )
  }

  if (modoNovo) {
    return (
      <Campo rotulo="Cliente" obrigatorio>
        <div className="space-y-2.5 rounded-xl border border-ouro-200 bg-ouro-100/40 p-3">
          <Entrada
            value={nome} onChange={(e) => aoMudarNome(e.target.value)}
            placeholder="Nome da cliente" autoFocus maxLength={80}
          />
          <Entrada
            value={fone} onChange={(e) => aoMudarFone(mascaraTelefone(e.target.value))}
            placeholder="(11) 98765-4321" inputMode="tel"
          />
          <button
            onClick={() => aoAlternarModo(false)}
            className="text-[12.5px] font-medium text-ouro-700 underline underline-offset-2"
          >
            Buscar cliente já cadastrada
          </button>
        </div>
      </Campo>
    )
  }

  return (
    <Campo rotulo="Cliente" obrigatorio>
      <div className="space-y-2">
        <Entrada
          value={busca} onChange={(e) => aoBuscar(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          prefixo={<Search className="h-4 w-4" />}
        />

        {buscando && <Esqueleto className="h-10 w-full" />}

        {!!sugestoes?.length && (
          <ul className="overflow-hidden rounded-xl border border-onix-100">
            {sugestoes.map((sugestao) => (
              <li key={sugestao.id}>
                <button
                  onClick={() => { aoEscolher(sugestao); aoBuscar('') }}
                  className="flex w-full items-center justify-between gap-3 border-b border-onix-50 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-quartzo-50"
                >
                  <span className="truncate text-[13.5px] font-medium text-onix-800">
                    {sugestao.nome}
                  </span>
                  {sugestao.telefone && (
                    <span className="tabular shrink-0 text-[12px] text-onix-400">
                      {telefone(sugestao.telefone)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={() => aoAlternarModo(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-onix-600 transition-colors hover:text-onix-900"
        >
          <UserPlus className="h-3.5 w-3.5" /> Cadastrar nova cliente
        </button>
      </div>
    </Campo>
  )
}
