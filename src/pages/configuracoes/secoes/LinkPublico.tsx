import { Link } from 'react-router-dom'
import { ROTAS } from '@/constants'
import { Database } from 'lucide-react'
import { Carta, CartaTitulo, Etiqueta, Interruptor } from '@/components/ui'
import { CompartilharLink } from '@/components/common'
import { useAviso } from '@/contexts'
import { useSalvarStudio } from '@/hooks'
import { armazenamento } from '@/services'
import { APP } from '@/constants'
import { mensagemDeErro } from '@/utils/erros'
import type { Studio } from '@/types'

/** Link de agendamento e diagnóstico do armazenamento. */
export function LinkPublico({ studio, aoSalvar }: { studio: Studio; aoSalvar: () => Promise<void> }) {
  const salvar = useSalvarStudio()
  const aviso = useAviso()

  const endereco = `${window.location.origin}/agendar/${studio.identificador}`

  // Quanto o studio já ocupa. O navegador costuma reservar ~5 MB por site.
  const bytes = armazenamento.espacoUsado?.() ?? 0
  const espaco = bytes > 0 ? `Ocupando ${(bytes / 1024).toFixed(0)} KB.` : ''

  const alternar = async (campo: 'agendamentoAtivo' | 'confirmacaoManual', valor: boolean) => {
    try {
      await salvar.executar({ [campo]: valor })
      await aoSalvar()
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }



  return (
    <div className="space-y-4">
      <Carta>
        <CartaTitulo
          titulo="Link de agendamento"
          descricao="Envie no WhatsApp ou coloque na bio do Instagram"
        />

        <CompartilharLink
          endereco={endereco}
          nomeDoSalao={studio.nomeFantasia?.trim() || studio.nome}
        />

        <div className="mt-4 space-y-3.5 rounded-xl border border-onix-100 p-3.5">
          <Interruptor
            ligado={studio.agendamentoAtivo}
            aoMudar={(valor) => void alternar('agendamentoAtivo', valor)}
            rotulo="Agendamento online ativo"
            descricao="Desligue para pausar as marcações pelo link."
          />
          <div className="border-t border-onix-50 pt-3.5">
            <Interruptor
              ligado={studio.confirmacaoManual}
              aoMudar={(valor) => void alternar('confirmacaoManual', valor)}
              rotulo="Confirmar manualmente"
              descricao="Agendamentos do link chegam aguardando sua confirmação."
            />
          </div>
        </div>
      </Carta>

      <Carta>
        <CartaTitulo titulo="Armazenamento" descricao="Onde os dados do studio ficam guardados" />

        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-onix-500 shadow-carta">
              <Database className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-onix-800">{armazenamento.nome}</p>
              <p className="text-[12.5px] text-onix-400">
                {armazenamento.persistente
                  ? `Os dados continuam neste aparelho. ${espaco}`
                  : 'Os dados somem ao recarregar a página.'}
              </p>
            </div>
            <Etiqueta
              className={
                armazenamento.persistente
                  ? 'border-[#CFE0D5] bg-[#E8F0EA] text-[#3D6250]'
                  : 'border-ouro-200 bg-ouro-100 text-ouro-700'
              }
            >
              {armazenamento.persistente ? 'Persistente' : 'Temporário'}
            </Etiqueta>
          </div>

          {/*
            O botão "Reiniciar demonstração" saiu daqui.

            Ele chamava `reiniciarDados()`, que passou a lançar erro
            quando a demonstração foi removida do produto. O resultado
            era o pior tipo de botão: visível, clicável, com aparência
            de funcionar — e recusando toda vez, com uma mensagem que
            não explicava por quê.

            No lugar, o que a proprietária de fato precisa saber sobre
            os dados dela. Apagar tudo continua possível pelo painel do
            Supabase, com backup na mão, que é onde uma operação
            irreversível deve morar.
          */}
          <div className="rounded-xl border border-onix-100 p-3.5">
            <p className="text-[13.5px] font-medium text-onix-800">Onde ficam seus dados</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-onix-400">
              Clientes, agenda e histórico ficam no servidor e acompanham você em
              qualquer aparelho. Para guardar uma cópia no computador, use{' '}
              <Link to={ROTAS.backup} className="text-marca underline-offset-2 hover:underline">
                Backup
              </Link>
              .
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-[11.5px] text-onix-300">
          {APP.nome} · versão {APP.versao}
        </p>
      </Carta>

      {/* Um clique não pode apagar o studio inteiro. A frase diz o que
          se perde, não só que a ação é perigosa. */}
    </div>
  )
}
