import {
  BarChart3, Boxes, CalendarDays, Gem, LayoutDashboard, Scissors,
  DatabaseBackup, FileBarChart, MessageCircle, Settings, Sparkles, Tag, Users,
  Wallet, Globe, type LucideIcon,
} from 'lucide-react'
import { AREAS_DO_ACESSO_RESTRITO, ROTAS } from '@/constants'

export interface ItemMenu {
  para: string
  rotulo: string
  icone: LucideIcon
  soGestor?: boolean
  /** Aparece na barra inferior do celular. */
  destaque?: boolean
  /**
   * De onde vem o número no menu.
   *
   * Só existe para o que exige uma decisão: um pedido parado é uma
   * cliente esperando resposta. Contador em item que não pede ação
   * vira ruído, e ruído ensina a ignorar todos os outros.
   */
  contador?: 'portal'
}

export const MENU: ItemMenu[] = [
  { para: ROTAS.painel,        rotulo: 'Início',     icone: LayoutDashboard, destaque: true },
  { para: ROTAS.agenda,        rotulo: 'Agenda',     icone: CalendarDays,    destaque: true },
  { para: ROTAS.clientes,      rotulo: 'Clientes',   icone: Users,           destaque: true },
  { para: ROTAS.portal,        rotulo: 'Portal',     icone: Globe, soGestor: true, contador: 'portal' },
  { para: ROTAS.assistente,    rotulo: 'Assistente', icone: Sparkles },
  { para: ROTAS.lembretes,     rotulo: 'Lembretes',  icone: MessageCircle },
  { para: ROTAS.servicos,      rotulo: 'Serviços',   icone: Scissors },
  { para: ROTAS.estoque,       rotulo: 'Estoque',    icone: Boxes },
  { para: ROTAS.caixa,         rotulo: 'Caixa',      icone: Wallet,    destaque: true },
  { para: ROTAS.financeiro,    rotulo: 'Financeiro', icone: BarChart3, soGestor: true },
  { para: ROTAS.cupons,        rotulo: 'Cupons',     icone: Tag,       soGestor: true },
  { para: ROTAS.fidelidade,    rotulo: 'Fidelidade', icone: Gem,       soGestor: true },
  { para: ROTAS.relatorios,    rotulo: 'Relatórios', icone: FileBarChart, soGestor: true },
  { para: ROTAS.backup,        rotulo: 'Backup',     icone: DatabaseBackup, soGestor: true },
  { para: ROTAS.configuracoes, rotulo: 'Ajustes',    icone: Settings,  soGestor: true },
]

/**
 * Filtra pelo papel e devolve só o que a pessoa pode acessar.
 *
 * O acesso restrito corta antes de qualquer outra coisa, e devolve
 * apenas as áreas de `AREAS_DO_ACESSO_RESTRITO`. Consultar a lista de
 * permissão em vez de listar exceções significa que a tela nova de
 * amanhã **não** aparece para ela por esquecimento — a regra continua
 * sendo \"nada além do que está escrito\", não \"tudo menos estas
 * quinze\".
 */
export const menuVisivel = (ehGestor: boolean, soAgenda = false): ItemMenu[] => {
  if (soAgenda) return MENU.filter((item) => AREAS_DO_ACESSO_RESTRITO.includes(item.para))
  return MENU.filter((item) => !item.soGestor || ehGestor)
}
