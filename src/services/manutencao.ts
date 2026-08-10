import { chamarPortal, temSupabase } from './supabase/cliente'

/**
 * Faxina periódica das tabelas que só crescem.
 *
 * Duas tabelas acumulam sem freio no uso normal:
 *
 * **`auditoria`** ganha uma linha a cada gravação nas nove tabelas
 * vigiadas — e cada linha carrega a versão anterior do registro
 * inteiro, em jsonb. Medido: 1,2 linha por agendamento. Um salão com
 * vinte atendimentos por dia produz cerca de duas mil linhas por mês.
 * Em um ano, dezenas de milhares, cada uma com o peso de um registro.
 *
 * **`reservas`** ganha uma linha a cada horário que alguém clica no
 * portal — inclusive os abandonados. As resolvidas ficam ali para
 * sempre depois de cumprirem o papel de cinco minutos.
 *
 * Nenhuma das duas quebra o sistema amanhã. As duas incomodam em seis
 * meses, quando a consulta que respondia em milissegundos passa a
 * varrer um volume que ninguém pediu para guardar.
 *
 * ---------------------------------------------------------------
 * Por que daqui, e não por `pg_cron`
 * ---------------------------------------------------------------
 * `pg_cron` seria o lugar certo — é a solução do servidor, roda mesmo
 * com o sistema fechado. Mas depende de alguém habilitar a extensão no
 * painel do Supabase e agendar a tarefa. Um passo manual esquecido é o
 * mesmo que faxina nenhuma.
 *
 * Isto aqui roda quando alguém abre o sistema, no máximo uma vez por
 * dia. Não substitui o cron; garante que exista alguma faxina até
 * alguém configurá-lo. Quem preferir o cron encontra o comando pronto
 * em `supabase/04-tempo-real.sql`.
 */

const CHAVE = 'studio:ultima-faxina'

/** Uma vez por dia basta: o volume diário é pequeno. */
function jaFezHoje(): boolean {
  try {
    return window.localStorage.getItem(CHAVE) === new Date().toDateString()
  } catch {
    // Sem localStorage, roda toda vez. É mais barato do que não rodar.
    return false
  }
}

function marcarFeita(): void {
  try {
    window.localStorage.setItem(CHAVE, new Date().toDateString())
  } catch {
    // Sem espaço para o marcador. A faxina rodou; o registro dela é
    // que se perde, e o custo disso é rodar de novo amanhã.
  }
}

/**
 * Roda a faxina, se ainda não rodou hoje.
 *
 * Falha em silêncio de propósito, e este é um dos poucos lugares em
 * que isso se justifica: é manutenção de fundo, invisível para quem
 * está usando o sistema. Um erro aqui não muda nada do que a
 * proprietária está fazendo — e transformá-lo num aviso vermelho a
 * assustaria com um problema que não é dela.
 */
export async function faxinaDoDia(): Promise<void> {
  if (!temSupabase() || jaFezHoje()) return

  try {
    // 365 dias de trilha: mais do que qualquer dúvida operacional de
    // um salão pede, e o suficiente para recuperar um registro apagado
    // por engano meses atrás.
    await chamarPortal('limpar_auditoria', { p_dias: 365 })

    // Marca reservas vencidas e apaga as já resolvidas há mais de dois
    // dias. Nunca toca numa reserva ativa.
    await chamarPortal('limpar_reservas')

    marcarFeita()
  } catch {
    // Sem permissão, sem rede, função ausente — tenta amanhã.
  }
}
