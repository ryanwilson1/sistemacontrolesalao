import { useState } from 'react'
import { CabecalhoPagina } from '@/components/common'
import { Abas } from '@/components/ui'
import { CarregandoTela, EstadoErro } from '@/components/feedback'
import { useSessao } from '@/contexts'
import { useStudio } from '@/hooks'
import { MeuSalao } from './secoes/MeuSalao'
import { AlterarSenha } from './secoes/AlterarSenha'
import { Horarios } from './secoes/Horarios'
import { Equipe } from './secoes/Equipe'
import { LinkPublico } from './secoes/LinkPublico'

type Secao = 'salao' | 'horarios' | 'equipe' | 'link' | 'conta'

/**
 * Ajustes do studio.
 *
 * Cada seção é um arquivo próprio: a tela aqui só decide qual mostrar.
 * Antes eram 456 linhas em um arquivo só.
 */
export default function Configuracoes() {
  const [secao, setSecao] = useState<Secao>('salao')
  const { dados: studio, carregando, erro, recarregar } = useStudio()
  const { recarregarStudio } = useSessao()

  if (carregando) return <CarregandoTela mensagem="Carregando ajustes" />

  if (erro || !studio) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar os ajustes"
        descricao={erro ?? undefined}
        aoTentarNovamente={recarregar}
      />
    )
  }

  /** Depois de salvar, o cabeçalho e o tema precisam refletir a mudança. */
  const aoSalvar = async () => {
    await recarregarStudio()
    recarregar()
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Ajustes"
        titulo="Configurações"
        descricao="Dados do salão, horários, equipe e link de agendamento."
      />

      <div className="mb-5">
        <Abas
          idAnimacao="configuracoes"
          abas={[
            { valor: 'salao', rotulo: 'Meu salão' },
            { valor: 'horarios', rotulo: 'Horários' },
            { valor: 'equipe', rotulo: 'Equipe' },
            { valor: 'link', rotulo: 'Link público' },
            { valor: 'conta', rotulo: 'Minha conta' },
          ]}
          ativa={secao}
          aoTrocar={setSecao}
        />
      </div>

      <div className="max-w-3xl">
        {secao === 'salao' && <MeuSalao studio={studio} aoSalvar={aoSalvar} />}
        {secao === 'horarios' && <Horarios studio={studio} aoSalvar={aoSalvar} />}
        {secao === 'equipe' && <Equipe />}
        {secao === 'conta' && <AlterarSenha />}
        {secao === 'link' && <LinkPublico studio={studio} aoSalvar={aoSalvar} />}
      </div>
    </>
  )
}
