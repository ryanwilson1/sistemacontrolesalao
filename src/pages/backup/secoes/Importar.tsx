import { useState } from 'react'
import { cache } from '@/hooks/dados/cache'
import { AlertTriangle, CheckCircle2, FileUp, Info, RotateCcw, Upload } from 'lucide-react'
import { Botao, Campo, Carta, CartaTitulo, Etiqueta } from '@/components/ui'
import { Confirmar } from '@/components/feedback'
import { useAviso, useSessao } from '@/contexts'
import { useAnalisarImportacao, useImportar, useRestaurarArquivo } from '@/hooks'
import { escolherArquivo, formatarBytes, ESTRATEGIAS } from '@/services'
import type { EstrategiaImportacao, PreviaImportacao } from '@/services'
import { dataNumerica, hora } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'

type Etapa = 'escolher' | 'conferir'

/**
 * Fluxo de importação e restauração por arquivo.
 *
 * A conferência acontece antes de qualquer gravação: a pessoa vê o que
 * há no arquivo, o que já existe aqui e o que vai acontecer.
 */
export function Importar() {
  const analisar = useAnalisarImportacao()
  const importar = useImportar()
  const restaurar = useRestaurarArquivo()
  const { sessao } = useSessao()
  const aviso = useAviso()

  const [etapa, setEtapa] = useState<Etapa>('escolher')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null)
  const [estrategia, setEstrategia] = useState<EstrategiaImportacao>('ignorar_existentes')
  const [confirmandoRestauracao, setConfirmandoRestauracao] = useState(false)

  const escolher = async () => {
    const escolhido = await escolherArquivo('.json')
    if (!escolhido) return

    try {
      const resultado = await analisar.executar(escolhido.conteudo)
      setNomeArquivo(escolhido.nome)
      setPrevia(resultado)
      setEtapa('conferir')
    } catch (falha) {
      aviso.erro('Não foi possível ler o arquivo', mensagemDeErro(falha))
    }
  }

  const recomecar = () => {
    setEtapa('escolher')
    setPrevia(null)
    setNomeArquivo('')
  }

  const confirmarImportacao = async () => {
    if (!previa?.arquivo) return
    try {
      const resultado = await importar.executar({
        arquivo: previa.arquivo,
        estrategia,
        responsavelId: sessao?.profissionalId,
      })
      aviso.sucesso(
        'Importação concluída',
        `${resultado.inseridos} novos, ${resultado.atualizados} atualizados, ${resultado.ignorados} ignorados.`,
      )
      recomecar()
      /*
        Invalidar em vez de recarregar.

        `location.reload()` num `setTimeout` de 1,2s é um chute: se a
        gravação ainda não terminou, a página recarrega e mostra o
        estado anterior — e a proprietária conclui que a operação não
        funcionou. Se terminou, a recarga é um susto desnecessário que
        derruba o que ela estivesse fazendo em outra aba do sistema.

        Os serviços de importação e restauração já derrubam o espelho e
        o cache ao terminar. As telas abertas releem sozinhas, na hora
        certa, porque o dado mudou — não porque o relógio disparou.
      */
      cache.limpar()
    } catch (falha) {
      aviso.erro('Não foi possível importar', mensagemDeErro(falha))
    }
  }

  const confirmarRestauracao = async () => {
    if (!previa?.arquivo) return
    try {
      const resultado = await restaurar.executar({
        arquivo: previa.arquivo,
        responsavelId: sessao?.profissionalId,
      })
      aviso.sucesso('Dados restaurados', `${resultado.restaurados} registros.`)
      setConfirmandoRestauracao(false)
      cache.limpar()
    } catch (falha) {
      aviso.erro('Não foi possível restaurar', mensagemDeErro(falha))
    }
  }

  /* ---------------- Etapa 1: escolher ---------------- */
  if (etapa === 'escolher') {
    return (
      <Carta className="mx-auto max-w-lg">
        <div className="py-4 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-quartzo-100 text-quartzo-600">
            <FileUp className="h-7 w-7" strokeWidth={1.5} />
          </span>

          <h3 className="mt-5 font-display text-[19px] font-light tracking-tight text-onix-900">
            Escolha o arquivo de backup
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-onix-400">
            Nada é alterado antes de você conferir. Vamos ler o arquivo, mostrar o
            que há dentro e só então perguntar o que fazer.
          </p>

          <Botao
            variante="ouro" tamanho="lg" className="mt-6"
            onClick={() => void escolher()}
            carregando={analisar.salvando}
          >
            <Upload className="h-4 w-4" /> Selecionar arquivo .json
          </Botao>
        </div>
      </Carta>
    )
  }

  /* ---------------- Etapa 2: conferir ---------------- */
  const validacao = previa?.validacao
  const arquivo = previa?.arquivo

  return (
    <>
      <div className="space-y-4">
        <Carta>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow mb-1">Arquivo escolhido</p>
              <p className="truncate text-[15px] font-medium text-onix-800">{nomeArquivo}</p>
              {arquivo && (
                <p className="mt-1 text-[12.5px] text-onix-400">
                  {arquivo.metadados.nome} · gerado em{' '}
                  {dataNumerica(arquivo.conteudo.geradoEm)} às {hora(arquivo.conteudo.geradoEm)} ·{' '}
                  {formatarBytes(arquivo.metadados.tamanhoBytes)}
                </p>
              )}
            </div>
            <Botao variante="fantasma" tamanho="sm" onClick={recomecar}>
              <RotateCcw className="h-3.5 w-3.5" /> Trocar arquivo
            </Botao>
          </div>
        </Carta>

        {/* Conferência */}
        <Carta>
          <CartaTitulo titulo="Conferência" descricao="O que encontramos no arquivo" />

          <div
            className={cn(
              'mb-4 flex gap-3 rounded-xl border p-3.5',
              validacao?.valido
                ? 'border-[#CFE0D5] bg-[#E8F0EA]'
                : 'border-[#EBD2D4] bg-[#FBF3F4]',
            )}
          >
            <span className={cn('mt-0.5 shrink-0', validacao?.valido ? 'text-sucesso' : 'text-perigo')}>
              {validacao?.valido ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-onix-800">
                {validacao?.valido ? 'Arquivo válido e íntegro' : 'Este arquivo tem problemas'}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Etiqueta
                  className={
                    validacao?.hashConfere
                      ? 'border-[#CFE0D5] bg-white text-[#3D6250]'
                      : 'border-[#EBD2D4] bg-white text-perigo'
                  }
                >
                  {validacao?.hashConfere ? 'Impressão digital confere' : 'Impressão digital não confere'}
                </Etiqueta>
                <Etiqueta className="bg-white">
                  {validacao?.versaoCompativel ? 'Versão compatível' : 'Versão diferente'}
                </Etiqueta>
              </div>
            </div>
          </div>

          {validacao?.problemas.map((problema) => (
            <p key={problema} className="mb-2 flex gap-2 text-[13px] leading-relaxed text-perigo">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {problema}
            </p>
          ))}

          {validacao?.avisos.map((aviso) => (
            <p key={aviso} className="mb-2 flex gap-2 text-[13px] leading-relaxed text-ouro-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {aviso}
            </p>
          ))}

          {/* Conteúdo */}
          <div className="mt-4 border-t border-onix-100 pt-4">
            <div className="mb-3 grid grid-cols-3 gap-2.5">
              {[
                ['No arquivo', String(validacao?.contagens.reduce((s, c) => s + c.registros, 0) ?? 0)],
                ['Novos aqui', String(previa?.novos ?? 0)],
                ['Já existem', String(previa?.duplicados ?? 0)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="rounded-xl border border-onix-100 bg-quartzo-50 p-3">
                  <p className="eyebrow truncate">{rotulo}</p>
                  <p className="tabular mt-1 font-display text-[19px] font-light text-onix-900">
                    {valor}
                  </p>
                </div>
              ))}
            </div>

            <div className="scroll-fino max-h-[168px] overflow-y-auto rounded-xl border border-onix-100">
              <table className="w-full text-left text-[13px]">
                <tbody className="divide-y divide-onix-50">
                  {validacao?.contagens
                    .filter((c) => c.registros > 0)
                    .map((contagem) => (
                      <tr key={contagem.colecao}>
                        <td className="px-3 py-2 text-onix-700">{contagem.rotulo}</td>
                        <td className="tabular px-3 py-2 text-right text-onix-500">
                          {contagem.registros}
                        </td>
                        <td className="tabular px-3 py-2 text-right text-[12px] text-onix-300">
                          {formatarBytes(contagem.bytes)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </Carta>

        {/* Decisão */}
        {validacao?.valido && (
          <Carta>
            <CartaTitulo titulo="O que fazer com estes dados" />

            <Campo rotulo="Importar — junta com o que já existe">
              <div className="space-y-2">
                {ESTRATEGIAS.map((opcao) => (
                  <button
                    key={opcao.valor}
                    type="button"
                    onClick={() => setEstrategia(opcao.valor)}
                    className={cn(
                      'w-full rounded-xl border p-3 text-left transition-colors',
                      estrategia === opcao.valor
                        ? 'border-onix-800 bg-quartzo-50'
                        : 'border-onix-100 bg-white hover:border-onix-300',
                    )}
                  >
                    <span className="block text-[13.5px] font-medium text-onix-800">
                      {opcao.rotulo}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-onix-400">
                      {opcao.detalhe}
                    </span>
                  </button>
                ))}
              </div>
            </Campo>

            <Botao
              variante="ouro" bloco className="mt-4"
              onClick={() => void confirmarImportacao()}
              carregando={importar.salvando}
            >
              <Upload className="h-4 w-4" /> Importar dados
            </Botao>

            <div className="mt-5 border-t border-onix-100 pt-5">
              <p className="text-[13.5px] font-medium text-onix-800">
                Restaurar — substitui tudo
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-onix-400">
                Apaga os dados atuais do studio e põe os do arquivo no lugar. Uma
                cópia de segurança do estado atual é criada antes.
              </p>
              <Botao
                variante="perigo" bloco className="mt-3"
                onClick={() => setConfirmandoRestauracao(true)}
              >
                <RotateCcw className="h-4 w-4" /> Restaurar por completo
              </Botao>
            </div>
          </Carta>
        )}
      </div>

      <Confirmar
        aberto={confirmandoRestauracao}
        aoFechar={() => setConfirmandoRestauracao(false)}
        aoConfirmar={() => void confirmarRestauracao()}
        titulo="Substituir todos os dados do studio?"
        descricao="Clientes, agenda, financeiro, estoque — tudo é trocado pelo conteúdo do arquivo. Uma cópia do estado atual é guardada antes, para você poder voltar."
        rotuloConfirmar="Sim, restaurar"
        destrutivo
        carregando={restaurar.salvando}
      />
    </>
  )
}
