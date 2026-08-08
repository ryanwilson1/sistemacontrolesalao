import { useState } from 'react'
import { Download, FileJson, FileSpreadsheet, FileText, Package } from 'lucide-react'
import { Botao, Campo, Carta, CartaTitulo, Entrada, Interruptor, Selecao } from '@/components/ui'
import { useAviso, useSessao } from '@/contexts'
import { useCriarBackup, useExportarColecao } from '@/hooks'
import { COLECOES, FORMATOS, ROTULO_COLECAO } from '@/services'
import type { Colecao } from '@/services'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { FormatoExportacao } from '@/types'

/** Coleções que fazem sentido exportar sozinhas. */
const EXPORTAVEIS: Colecao[] = COLECOES.filter((c: Colecao) => c !== 'jornada')

const ICONE: Record<FormatoExportacao, typeof FileJson> = {
  json: FileJson,
  csv: FileSpreadsheet,
  excel: FileSpreadsheet,
  pdf: FileText,
}

export function Exportar() {
  const criar = useCriarBackup()
  const exportar = useExportarColecao()
  const { sessao } = useSessao()
  const aviso = useAviso()

  const [nome, setNome] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [incluirFotos, setIncluirFotos] = useState(true)

  const [colecao, setColecao] = useState<Colecao>('clientes')
  const [formato, setFormato] = useState<FormatoExportacao>('csv')

  const fazerBackupCompleto = async () => {
    try {
      const resultado = await criar.executar({
        nome: nome.trim() || undefined,
        incluirFotos,
        observacoes: observacoes.trim() || null,
        responsavelId: sessao?.profissionalId,
      })

      aviso.sucesso(
        'Backup criado',
        `${resultado.backup.totalRegistros} registros em ${resultado.duracaoMs} ms. ` +
          (resultado.guardadoNoSistema
            ? 'Guardado aqui e baixado no seu computador.'
            : 'Baixado no seu computador — grande demais para ficar guardado aqui.'),
      )

      setNome('')
      setObservacoes('')
    } catch (falha) {
      aviso.erro('Não foi possível criar o backup', mensagemDeErro(falha))
    }
  }

  const exportarModulo = async () => {
    try {
      const resultado = await exportar.executar({ colecao, formato })
      aviso.sucesso('Exportado', `${resultado.registros} registros em ${resultado.nome}`)
    } catch (falha) {
      aviso.erro('Não foi possível exportar', mensagemDeErro(falha))
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Backup completo */}
      <Carta>
        <CartaTitulo
          titulo="Backup completo"
          descricao="Todos os módulos em um único arquivo"
        />

        <div className="mb-4 rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
          <p className="eyebrow mb-2">O que vai no pacote</p>
          <div className="flex flex-wrap gap-1.5">
            {['Clientes', 'Agenda', 'Procedimentos', 'Equipe', 'Serviços', 'Financeiro',
              'Caixa', 'Estoque', 'Cupons', 'Fidelidade', 'Configurações'].map((item) => (
              <span
                key={item}
                className="rounded-md bg-white px-2 py-1 text-[11.5px] text-onix-600"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Campo rotulo="Nome do backup" dica="Deixe em branco para usar a data de hoje.">
            <Entrada
              value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: antes da virada do mês" maxLength={80}
            />
          </Campo>

          <Campo rotulo="Observação">
            <Entrada
              value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Opcional" maxLength={200}
            />
          </Campo>

          <div className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
            <Interruptor
              ligado={incluirFotos}
              aoMudar={setIncluirFotos}
              rotulo="Incluir fotos de antes e depois"
              descricao="As fotos são o que mais pesa. Sem elas o arquivo fica bem menor."
            />
          </div>

          <Botao
            variante="ouro" tamanho="lg" bloco
            onClick={() => void fazerBackupCompleto()}
            carregando={criar.salvando}
          >
            <Package className="h-4 w-4" /> Criar backup completo
          </Botao>

          <p className="text-center text-[12px] leading-relaxed text-onix-400">
            O arquivo é baixado no seu computador. Guarde em um lugar seguro —
            é ele que traz tudo de volta se algo acontecer com este aparelho.
          </p>
        </div>
      </Carta>

      {/* Exportação individual */}
      <Carta>
        <CartaTitulo
          titulo="Exportar um módulo"
          descricao="Para abrir na planilha ou levar para outro sistema"
        />

        <div className="space-y-4">
          <Campo rotulo="Módulo">
            <Selecao value={colecao} onChange={(e) => setColecao(e.target.value as Colecao)}>
              {EXPORTAVEIS.map((item) => (
                <option key={item} value={item}>{ROTULO_COLECAO[item]}</option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Formato">
            <div className="grid grid-cols-2 gap-2">
              {FORMATOS.map((opcao) => {
                const Icone = ICONE[opcao.valor]
                const escolhido = formato === opcao.valor

                return (
                  <button
                    key={opcao.valor}
                    type="button"
                    disabled={!opcao.pronto}
                    onClick={() => setFormato(opcao.valor)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
                      !opcao.pronto && 'cursor-not-allowed opacity-45',
                      escolhido
                        ? 'border-onix-800 bg-quartzo-50'
                        : 'border-onix-100 bg-white hover:border-onix-300',
                    )}
                  >
                    <Icone
                      className={cn('mt-0.5 h-4 w-4 shrink-0', escolhido ? 'text-marca' : 'text-onix-300')}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-onix-800">
                        {opcao.rotulo}
                      </span>
                      <span className="block text-[11.5px] leading-snug text-onix-400">
                        {opcao.detalhe}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </Campo>

          <Botao
            variante="secundario" bloco
            onClick={() => void exportarModulo()}
            carregando={exportar.salvando}
          >
            <Download className="h-4 w-4" /> Exportar {ROTULO_COLECAO[colecao]}
          </Botao>

          <p className="rounded-xl border border-onix-100 bg-quartzo-50 p-3 text-[12px] leading-relaxed text-onix-500">
            <span className="font-medium text-onix-700">Sobre o PDF:</span> relatórios em PDF
            saem por Relatórios → Imprimir, onde você escolhe o período e vê os
            números antes de gerar.
          </p>
        </div>
      </Carta>
    </div>
  )
}
