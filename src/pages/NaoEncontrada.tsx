import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EstadoVazio } from '@/components/feedback'
import { Botao } from '@/components/ui'
import { ROTAS } from '@/constants'

export default function NaoEncontrada() {
  return (
    <EstadoVazio
      icone={Compass}
      titulo="Página não encontrada"
      descricao="O endereço que você abriu não existe mais ou foi digitado errado."
      acao={
        <Link to={ROTAS.painel}>
          <Botao variante="ouro">Voltar ao início</Botao>
        </Link>
      }
    />
  )
}
