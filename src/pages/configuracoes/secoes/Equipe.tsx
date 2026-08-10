import { useState } from 'react'
import { Pencil, Plus, Users } from 'lucide-react'
import { Botao, Carta, CartaTitulo, Interruptor, Retrato, SeletorDeCor } from '@/components/ui'
import { EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { FormularioProfissional } from './FormularioProfissional'
import { useAviso } from '@/contexts'
import { useProfissionais, useSalvarProfissional } from '@/hooks'
import { CORES_DISPONIVEIS, PAPEL } from '@/constants'
import { mensagemDeErro } from '@/utils/erros'
import type { Profissional } from '@/types'

/** Quem trabalha no studio e quem aparece na grade da agenda. */
export function Equipe() {
  const { dados: profissionais, carregando } = useProfissionais()
  const [emEdicao, setEmEdicao] = useState<Partial<Profissional> | null>(null)
  const salvar = useSalvarProfissional()
  const aviso = useAviso()

  const atualizar = async (profissional: Profissional, dados: Partial<Profissional>) => {
    try {
      await salvar.executar({ id: profissional.id, dados })
      aviso.sucesso('Equipe atualizada', profissional.nome)
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <Carta>
      <CartaTitulo
        titulo="Equipe"
        descricao="Quem atende aparece como coluna na agenda"
      />

      {/*
        O botão que faltava.

        Esta tela só sabia EDITAR quem já existia — e o único caminho
        para criar alguém era um texto dizendo que o cadastro viria "na
        próxima etapa". Um rascunho de desenvolvimento que foi para
        produção: quem abrisse a aba lia uma promessa em vez de
        encontrar a função.

        Sem isso, um salão com duas profissionais não conseguia
        cadastrar a segunda por lugar nenhum do sistema.
      */}
      <Botao variante="ouro" onClick={() => setEmEdicao({})} className="mb-4">
        <Plus className="h-4 w-4" /> Nova profissional
      </Botao>

      {carregando ? (
        <EsqueletoLista linhas={3} />
      ) : (profissionais?.length ?? 0) === 0 ? (
        <EstadoVazio
          icone={Users}
          titulo="Nenhuma profissional cadastrada"
          descricao="Cadastre quem atende para a agenda ter colunas e o link público oferecer horários."
        />
      ) : (
        <ul className="space-y-3">
          {profissionais?.map((profissional) => (
            <li key={profissional.id} className="rounded-xl border border-onix-100 p-3.5">
              <div className="flex items-center gap-3">
                <Retrato nome={profissional.nome} cor={profissional.cor} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-onix-800">
                    {profissional.nome}
                  </p>
                  <p className="text-[12.5px] text-onix-400">{PAPEL[profissional.papel]}</p>
                </div>

                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  onClick={() => setEmEdicao(profissional)}
                  aria-label={`Editar ${profissional.nome}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Botao>
              </div>

              <div className="mt-3 space-y-3 border-t border-onix-50 pt-3">
                <Interruptor
                  ligado={profissional.atende}
                  aoMudar={(valor) => void atualizar(profissional, { atende: valor })}
                  rotulo="Atende clientes"
                  descricao="Aparece na grade da agenda e no link público."
                />

                <div>
                  <p className="mb-2 text-[12.5px] text-onix-400">Cor na agenda</p>
                  <SeletorDeCor
                    cores={CORES_DISPONIVEIS}
                    valor={profissional.cor}
                    aoMudar={(cor) => void atualizar(profissional, { cor })}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormularioProfissional
        aberto={emEdicao !== null}
        profissional={emEdicao?.id ? (emEdicao as Profissional) : null}
        aoFechar={() => setEmEdicao(null)}
      />
    </Carta>
  )
}
