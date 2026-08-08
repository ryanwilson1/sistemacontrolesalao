import { useState } from 'react'
import { CabecalhoPagina } from '@/components/common'
import { Abas } from '@/components/ui'
import { PainelBackup } from './secoes/PainelBackup'
import { HistoricoBackups } from './secoes/HistoricoBackups'
import { Exportar } from './secoes/Exportar'
import { Importar } from './secoes/Importar'
import { ConfiguracoesBackup } from './secoes/Configuracoes'
import { Registros } from './secoes/Registros'

type Secao = 'painel' | 'exportar' | 'importar' | 'historico' | 'configuracoes' | 'registros'

/**
 * Central de Backup e Recuperação.
 *
 * Cada seção é um arquivo próprio; esta tela só decide qual mostrar.
 */
export default function Backup() {
  const [secao, setSecao] = useState<Secao>('painel')

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Sistema"
        titulo="Central de Backup"
        descricao="Seus dados ficam neste aparelho. O backup é o que garante que eles não se percam."
      />

      <div className="mb-5">
        <Abas
          idAnimacao="backup"
          abas={[
            { valor: 'painel', rotulo: 'Painel' },
            { valor: 'exportar', rotulo: 'Fazer backup' },
            { valor: 'importar', rotulo: 'Importar / Restaurar' },
            { valor: 'historico', rotulo: 'Histórico' },
            { valor: 'configuracoes', rotulo: 'Configurações' },
            { valor: 'registros', rotulo: 'Registros' },
          ]}
          ativa={secao}
          aoTrocar={setSecao}
        />
      </div>

      {secao === 'painel' && <PainelBackup aoCriar={() => setSecao('exportar')} />}
      {secao === 'exportar' && <Exportar />}
      {secao === 'importar' && <Importar />}
      {secao === 'historico' && <HistoricoBackups />}
      {secao === 'configuracoes' && <ConfiguracoesBackup />}
      {secao === 'registros' && <Registros />}
    </>
  )
}
