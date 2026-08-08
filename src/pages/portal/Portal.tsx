import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CabecalhoPagina } from '@/components/common'
import { Abas } from '@/components/ui'
import { useQuantosEsperando, useQuantosPedidos } from '@/hooks'
import { Solicitacoes } from './secoes/Solicitacoes'
import { ListaDeEspera } from './secoes/ListaDeEspera'
import { Configuracao } from './secoes/Configuracao'
import { HistoricoDePedidos } from './secoes/Historico'

type Secao = 'pedidos' | 'espera' | 'historico' | 'ajustes'

/**
 * Portal de Agendamento — lado da proprietária.
 *
 * Tudo que vem de fora chega aqui: pedidos de mudança, quem está na
 * fila de espera e as regras do link. Ficar junto da agenda pareceria
 * natural e não é — a agenda é para trabalhar o dia; isto é para
 * decidir o que entra nele.
 */
export default function Portal() {
  const [secao, setSecao] = useState<Secao>('pedidos')

  const { dados: pedidos } = useQuantosPedidos()
  const { dados: esperando } = useQuantosEsperando()

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Portal"
        titulo="Agendamento online"
        descricao="O que chega pelo link da cliente e as regras que valem lá."
      />

      <div className="mb-5">
        <Abas
          idAnimacao="portal"
          abas={[
            { valor: 'pedidos', rotulo: 'Pedidos', contador: pedidos || undefined },
            { valor: 'espera', rotulo: 'Lista de espera', contador: esperando || undefined },
            { valor: 'historico', rotulo: 'Histórico' },
            { valor: 'ajustes', rotulo: 'Configuração' },
          ]}
          ativa={secao}
          aoTrocar={setSecao}
        />
      </div>

      <div className="max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={secao}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {secao === 'pedidos' && <Solicitacoes />}
            {secao === 'espera' && <ListaDeEspera />}
            {secao === 'historico' && <HistoricoDePedidos />}
            {secao === 'ajustes' && <Configuracao />}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}
