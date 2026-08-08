import { useState } from 'react'
import { Database, RotateCcw } from 'lucide-react'
import { Botao, Carta, CartaTitulo, Etiqueta, Interruptor } from '@/components/ui'
import { CompartilharLink } from '@/components/common'
import { Confirmar } from '@/components/feedback'
import { useAviso } from '@/contexts'
import { useSalvarStudio } from '@/hooks'
import { armazenamento, reiniciarDados } from '@/services'
import { cache } from '@/hooks/dados/cache'
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

  const [confirmando, setConfirmando] = useState(false)

  const reiniciar = async () => {
    setConfirmando(false)
    try {
      await reiniciarDados()
      cache.limpar()
      aviso.sucesso('Dados reiniciados', 'A demonstração voltou ao estado inicial.')
    } catch (falha) {
      aviso.erro('Não foi possível reiniciar', mensagemDeErro(falha))
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-onix-100 p-3.5">
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-onix-800">Reiniciar demonstração</p>
              <p className="text-[12.5px] leading-snug text-onix-400">
                Restaura os dados de exemplo do começo.
              </p>
            </div>
            <Botao variante="secundario" tamanho="sm" onClick={() => setConfirmando(true)}>
              <RotateCcw className="h-3.5 w-3.5" /> Reiniciar
            </Botao>
          </div>
        </div>

        <p className="mt-4 text-center text-[11.5px] text-onix-300">
          {APP.nome} · versão {APP.versao}
        </p>
      </Carta>

      {/* Um clique não pode apagar o studio inteiro. A frase diz o que
          se perde, não só que a ação é perigosa. */}
      <Confirmar
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        aoConfirmar={() => void reiniciar()}
        titulo="Apagar tudo e voltar à demonstração?"
        descricao={
          'Clientes, agendamentos, serviços, financeiro e histórico deste aparelho ' +
          'serão apagados e substituídos pelos dados de exemplo. Não há como desfazer. ' +
          'Faça um backup antes, em Backup → Exportar.'
        }
        rotuloConfirmar="Apagar tudo"
        destrutivo
      />
    </div>
  )
}
