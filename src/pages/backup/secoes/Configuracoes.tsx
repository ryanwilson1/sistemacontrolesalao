import { useEffect, useState } from 'react'
import { CalendarClock, Save } from 'lucide-react'
import { Botao, Campo, Carta, CartaTitulo, Entrada, Interruptor } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useConfiguracaoBackup, useSalvarConfiguracaoBackup } from '@/hooks'
import { calcularProximo } from '@/services'
import { dataNumerica } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { FrequenciaBackup } from '@/types'

const FREQUENCIAS: { valor: FrequenciaBackup; rotulo: string; detalhe: string }[] = [
  { valor: 'manual', rotulo: 'Manual', detalhe: 'Você decide quando' },
  { valor: 'diario', rotulo: 'Diário', detalhe: 'Lembrete todo dia' },
  { valor: 'semanal', rotulo: 'Semanal', detalhe: 'Uma vez por semana' },
  { valor: 'mensal', rotulo: 'Mensal', detalhe: 'Uma vez por mês' },
]

export function ConfiguracoesBackup() {
  const { dados: configuracao } = useConfiguracaoBackup()
  const salvar = useSalvarConfiguracaoBackup()
  const aviso = useAviso()

  const [frequencia, setFrequencia] = useState<FrequenciaBackup>('semanal')
  const [manterUltimos, setManterUltimos] = useState('5')
  const [avisarApos, setAvisarApos] = useState('7')
  const [incluirFotos, setIncluirFotos] = useState(true)

  useEffect(() => {
    if (!configuracao) return
    setFrequencia(configuracao.frequencia)
    setManterUltimos(String(configuracao.manterUltimos))
    setAvisarApos(String(configuracao.avisarAposDias))
    setIncluirFotos(configuracao.incluirFotos)
  }, [configuracao])

  const enviar = async () => {
    try {
      await salvar.executar({
        frequencia,
        manterUltimos: Math.max(Number(manterUltimos) || 1, 1),
        avisarAposDias: Math.max(Number(avisarApos) || 1, 1),
        incluirFotos,
        proximoEm: calcularProximo(frequencia, new Date()),
      })
      aviso.sucesso('Configuração salva')
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  const proximo = calcularProximo(frequencia, new Date())

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Carta>
        <CartaTitulo
          titulo="Com que frequência lembrar"
          descricao="O sistema avisa quando estiver na hora de um novo backup"
        />

        <div className="grid gap-2.5 sm:grid-cols-2">
          {FREQUENCIAS.map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => setFrequencia(opcao.valor)}
              className={cn(
                'rounded-xl border p-3.5 text-left transition-colors',
                frequencia === opcao.valor
                  ? 'border-onix-800 bg-quartzo-50'
                  : 'border-onix-100 bg-white hover:border-onix-300',
              )}
            >
              <span className="block text-[14px] font-medium text-onix-800">{opcao.rotulo}</span>
              <span className="mt-0.5 block text-[12.5px] text-onix-400">{opcao.detalhe}</span>
            </button>
          ))}
        </div>

        {proximo && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-onix-100 bg-quartzo-50 px-3.5 py-2.5 text-[12.5px] text-onix-500">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-onix-300" />
            Próximo lembrete em {dataNumerica(proximo)}.
          </p>
        )}

        <p className="mt-3 rounded-xl border border-ouro-200 bg-ouro-100/50 p-3.5 text-[12.5px] leading-relaxed text-ouro-700">
          <span className="font-medium">Vale ser claro:</span> sem servidor não existe
          tarefa que rode sozinha com o sistema fechado. O que acontece é um
          lembrete quando você abre o studio — o backup em si continua sendo um
          clique seu.
        </p>
      </Carta>

      <Carta>
        <CartaTitulo titulo="Como guardar" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Manter os últimos"
            dica="Backups além disso são descartados automaticamente."
          >
            <Entrada
              type="number" min="1" max="20" inputMode="numeric"
              value={manterUltimos} onChange={(e) => setManterUltimos(e.target.value)}
            />
          </Campo>

          <Campo rotulo="Avisar após" dica="Dias sem backup até o alerta aparecer.">
            <Entrada
              type="number" min="1" max="90" inputMode="numeric"
              value={avisarApos} onChange={(e) => setAvisarApos(e.target.value)}
            />
          </Campo>
        </div>

        <div className="mt-4 rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
          <Interruptor
            ligado={incluirFotos}
            aoMudar={setIncluirFotos}
            rotulo="Incluir fotos nos backups"
            descricao="Fotos deixam o arquivo muito maior. Desligue se o espaço apertar."
          />
        </div>
      </Carta>

      <div className="flex justify-end">
        <Botao variante="ouro" onClick={() => void enviar()} carregando={salvar.salvando}>
          <Save className="h-4 w-4" /> Salvar configuração
        </Botao>
      </div>
    </div>
  )
}
