import { agendamentosRepo } from '../repositorios/agenda'
import { estaAtivo } from '../agenda/regras'
import type { AgendamentoDetalhado } from '@/types'

/**
 * Chegadas do portal.
 *
 * Responde a uma pergunta só: "o que entrou pelo link desde a última vez
 * que eu olhei?". É o que alimenta o aviso que aparece sozinho na tela
 * da proprietária quando uma cliente confirma um horário.
 *
 * A marca d'água fica em memória, não no armazenamento, e isso é
 * deliberado: ela responde por *esta sessão de trabalho*. Guardada em
 * disco, abrir o sistema na segunda-feira despejaria de uma vez os
 * catorze agendamentos do fim de semana — que é exatamente o tipo de
 * notificação que ninguém lê e todo mundo desliga.
 *
 * Quem quiser rever o acumulado tem a agenda e o sino; o aviso ao vivo
 * é para o que está acontecendo agora.
 */

/** Instante a partir do qual um agendamento conta como "novo". */
let marcaDagua = Date.now()

/**
 * Já anunciados nesta sessão. Impede o mesmo aviso duas vezes.
 *
 * O teto existe porque este conjunto só crescia. Num sábado movimentado
 * com o aplicativo aberto o dia todo, ele acumulava um identificador
 * por agendamento vindo do link — para sempre, já que nada o esvaziava.
 *
 * Sozinho não derrubaria nada; o custo real era ele ser varrido a cada
 * verificação junto com a agenda inteira. Duzentos cobre um dia com
 * folga, e o mais antigo sai quando estoura: reanunciar um agendamento
 * de horas atrás não acontece, porque a marca d'água já o deixou para
 * trás.
 */
const jaAnunciados = new Set<string>()
const TETO_ANUNCIADOS = 200

function lembrarAnunciado(id: string): void {
  jaAnunciados.add(id)
  if (jaAnunciados.size <= TETO_ANUNCIADOS) return

  // `Set` preserva a ordem de inserção: o primeiro é o mais antigo.
  const maisAntigo = jaAnunciados.values().next().value
  if (maisAntigo !== undefined) jaAnunciados.delete(maisAntigo)
}

/**
 * O que chegou pelo portal desde a última verificação.
 *
 * Só agendamentos vivos: um horário criado e cancelado entre duas
 * verificações não deve aparecer como novidade.
 */
export async function chegadasRecentes(): Promise<AgendamentoDetalhado[]> {
  const todos = await agendamentosRepo.listar()

  const novos = todos.filter(
    (a) =>
      a.origem === 'link' &&
      estaAtivo(a) &&
      !jaAnunciados.has(a.id) &&
      new Date(a.criadoEm).getTime() > marcaDagua,
  )

  if (novos.length === 0) return []

  for (const agendamento of novos) lembrarAnunciado(agendamento.id)
  marcaDagua = Date.now()

  const detalhados = await agendamentosRepo.detalhar(novos)
  return detalhados.sort((a, b) => a.inicio.localeCompare(b.inicio))
}

/**
 * Recomeça a contagem a partir de agora.
 *
 * Chamado quando o painel abre: o que já estava lá antes de a
 * proprietária sentar não é novidade, é a agenda dela.
 */
export function ignorarAnteriores(): void {
  marcaDagua = Date.now()
  jaAnunciados.clear()
}
