import { Carta, CartaTitulo, Interruptor, Retrato, SeletorDeCor } from '@/components/ui'
import { EsqueletoLista } from '@/components/feedback'
import { useAviso } from '@/contexts'
import { useProfissionais, useSalvarProfissional } from '@/hooks'
import { CORES_DISPONIVEIS, PAPEL } from '@/constants'
import { mensagemDeErro } from '@/utils/erros'
import type { Profissional } from '@/types'

/** Quem trabalha no studio e quem aparece na grade da agenda. */
export function Equipe() {
  const { dados: profissionais, carregando } = useProfissionais()
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

      {carregando ? (
        <EsqueletoLista linhas={3} />
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

      <p className="mt-4 rounded-xl border border-onix-100 bg-quartzo-50 p-3.5 text-[12.5px] leading-relaxed text-onix-500">
        Cadastro de novas profissionais entra junto com o armazenamento local, na
        próxima etapa.
      </p>
    </Carta>
  )
}
