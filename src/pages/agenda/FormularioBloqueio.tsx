import { useEffect, useState } from 'react'
import { Botao, Campo, Entrada, Modal, Selecao } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useAtendentes, useSalvarBloqueio } from '@/hooks'
import { TIPO_BLOQUEIO } from '@/constants'
import { isoData } from '@/utils/datas'
import { limparTexto } from '@/utils/sanitizar'
import { ErroDeRegra, mensagemDeErro } from '@/utils/erros'
import type { TipoBloqueio } from '@/types'

export function FormularioBloqueio({
  aberto, aoFechar, diaBase,
}: {
  aberto: boolean
  aoFechar: () => void
  diaBase: Date
}) {
  const { dados: atendentes } = useAtendentes()
  const salvar = useSalvarBloqueio()
  const aviso = useAviso()

  const [tipo, setTipo] = useState<TipoBloqueio>('bloqueio')
  const [profissionalId, setProfissionalId] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [horaInicio, setHoraInicio] = useState('12:00')
  const [horaFim, setHoraFim] = useState('13:00')
  const [motivo, setMotivo] = useState('')

  const diaInteiro = TIPO_BLOQUEIO[tipo].diaInteiro

  useEffect(() => {
    if (!aberto) return
    setTipo('bloqueio')
    setProfissionalId('')
    setDataInicio(isoData(diaBase))
    setDataFim(isoData(diaBase))
    setHoraInicio('12:00')
    setHoraFim('13:00')
    setMotivo('')
  }, [aberto, diaBase])

  const enviar = async () => {
    try {
      const inicio = diaInteiro
        ? new Date(`${dataInicio}T00:00:00`)
        : new Date(`${dataInicio}T${horaInicio}:00`)

      const fim = diaInteiro
        ? new Date(new Date(`${dataFim}T00:00:00`).getTime() + 86_400_000)
        : new Date(`${dataInicio}T${horaFim}:00`)

      if (fim <= inicio) throw new ErroDeRegra('O fim precisa ser depois do início.')

      await salvar.executar({
        profissionalId: profissionalId || null,
        tipo,
        motivo: limparTexto(motivo, 200) || null,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      })

      aviso.sucesso('Horário bloqueado', 'Ninguém consegue agendar neste período.')
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível bloquear', mensagemDeErro(falha))
    }
  }

  return (
    <Modal
      estadoDoFormulario={{ tipo, profissionalId, dataInicio, dataFim, horaInicio, horaFim, motivo }}
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Bloquear horário"
      descricao="O período fica indisponível no painel e no link público."
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Voltar</Botao>
          <Botao variante="principal" onClick={() => void enviar()} carregando={salvar.salvando}>
            Bloquear
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Campo rotulo="Motivo do bloqueio">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoBloqueio)}>
            {Object.entries(TIPO_BLOQUEIO).map(([valor, { rotulo }]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </Selecao>
        </Campo>

        <Campo rotulo="Quem fica indisponível" dica="Deixe em branco para bloquear o studio inteiro.">
          <Selecao value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
            <option value="">Studio inteiro</option>
            {atendentes?.map((item) => (
              <option key={item.id} value={item.id}>{item.nome}</option>
            ))}
          </Selecao>
        </Campo>

        {diaInteiro ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Do dia">
              <Entrada type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </Campo>
            <Campo rotulo="Até o dia">
              <Entrada type="date" value={dataFim} min={dataInicio} onChange={(e) => setDataFim(e.target.value)} />
            </Campo>
          </div>
        ) : (
          <>
            <Campo rotulo="Data">
              <Entrada type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </Campo>
            <div className="grid grid-cols-2 gap-4">
              <Campo rotulo="Das">
                <Entrada type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </Campo>
              <Campo rotulo="Até">
                <Entrada type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
              </Campo>
            </div>
          </>
        )}

        <Campo rotulo="Observação" dica="Aparece só para a equipe.">
          <Entrada
            value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: consulta médica" maxLength={200}
          />
        </Campo>
      </div>
    </Modal>
  )
}
