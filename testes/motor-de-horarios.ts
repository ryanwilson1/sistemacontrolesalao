/**
 * Verificação do motor de horários.
 *
 *   npx tsx testes/motor-de-horarios.ts
 *
 * Roda sem navegador e sem biblioteca de teste porque `gradeDeHorarios`
 * é pura de propósito: recebe tudo por parâmetro e não busca nada. Essa
 * escolha, feita para o motor servir ao painel e ao portal ao mesmo
 * tempo, é o que também o torna verificável em sete linhas.
 *
 * Cobre o que não pode quebrar: almoço, fechamento, horário ocupado,
 * teto de simultâneos, reserva de outra visitante e serviço restrito.
 */
import { gradeDeHorarios } from '../src/services/agenda/horarios'

// Amanhã, não hoje: a antecedência mínima descartaria os horários que
// já passaram no relógio da máquina e o teste falharia dependendo da hora.
const hoje = new Date()
hoje.setDate(hoje.getDate() + 1)
hoje.setHours(0, 0, 0, 0)

const em = (h: number, m = 0) => {
  const d = new Date(hoje); d.setHours(h, m, 0, 0); return d.toISOString()
}

const servico: any = {
  id: 's1', nome: 'Progressiva', duracaoMinutos: 180, intervaloMinutos: 20,
  profissionaisIds: [], preco: 350, ativo: true, ordem: 1,
}
const equipe: any[] = [
  { id: 'p1', nome: 'Emely', atende: true, ativo: true },
  { id: 'p2', nome: 'Carol', atende: true, ativo: true },
]
const jornada: any = {
  diaSemana: hoje.getDay(), aberto: true, abre: '09:00', fecha: '19:00',
  almocoInicio: '12:00', almocoFim: '13:00',
}
const studio: any = { antecedenciaMinutos: 0, intervaloMinutos: 60, atendimentosSimultaneos: 0 }

let falhas = 0
const conferir = (nome: string, condicao: boolean, detalhe = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`)
  if (!condicao) falhas++
}

/* 1. Progressiva de 3h20 não pode começar de forma a cruzar o almoço */
const base = gradeDeHorarios({
  data: hoje, servico, profissionais: equipe, profissionalId: null,
  jornada, bloqueios: [], agendamentos: [], studio,
})
const horas = base.map((o) => o.inicio.getHours())
conferir('grade respeita almoço e fechamento', !horas.includes(10) && !horas.includes(11),
  `horários: ${horas.join(', ')}`)

/* 2. Agendamento existente tira a profissional daquele horário */
const comReserva = gradeDeHorarios({
  data: hoje, servico, profissionais: equipe, profissionalId: null, jornada,
  bloqueios: [],
  agendamentos: [{ id: 'a1', profissionalId: 'p1', inicio: em(13), fim: em(16, 20), situacao: 'confirmado' } as any],
  studio,
})
const das13 = comReserva.find((o) => o.inicio.getHours() === 13)
conferir('horário ocupado some para quem está ocupada',
  das13?.profissionaisLivres.join() === 'p2', `livres: ${das13?.profissionaisLivres.join() ?? '—'}`)

/* 3. Teto de simultâneos corta o horário mesmo com gente livre */
const comTeto = gradeDeHorarios({
  data: hoje, servico, profissionais: equipe, profissionalId: null, jornada,
  bloqueios: [],
  agendamentos: [{ id: 'a1', profissionalId: 'p1', inicio: em(13), fim: em(16, 20), situacao: 'confirmado' } as any],
  studio: { ...studio, atendimentosSimultaneos: 1 },
})
conferir('teto de 1 atendimento bloqueia as 13h',
  !comTeto.some((o) => o.inicio.getHours() === 13))

/* 4. Reserva de outra visitante bloqueia; a própria, não */
const reserva: any = {
  id: 'r1', profissionalId: 'p1', inicio: em(13), fim: em(16, 20),
  situacao: 'ativa', expiraEm: new Date(Date.now() + 300000).toISOString(),
  visitanteId: 'outra',
}
const paraOutra = gradeDeHorarios({
  data: hoje, servico, profissionais: [equipe[0]], profissionalId: 'p1',
  jornada, bloqueios: [], agendamentos: [], reservas: [reserva],
  visitanteId: 'eu', studio,
})
const paraDona = gradeDeHorarios({
  data: hoje, servico, profissionais: [equipe[0]], profissionalId: 'p1',
  jornada, bloqueios: [], agendamentos: [], reservas: [reserva],
  visitanteId: 'outra', studio,
})
conferir('reserva alheia bloqueia o horário',
  !paraOutra.some((o) => o.inicio.getHours() === 13))
conferir('a própria reserva não bloqueia quem a criou',
  paraDona.some((o) => o.inicio.getHours() === 13))

/* 5. Serviço restrito só oferece quem sabe fazer */
const restrito = gradeDeHorarios({
  data: hoje, servico: { ...servico, profissionaisIds: ['p2'] }, profissionais: equipe,
  profissionalId: null, jornada, bloqueios: [], agendamentos: [], studio,
})
conferir('serviço restrito oferece só quem sabe fazer',
  restrito.every((o) => o.profissionaisLivres.join() === 'p2'))

/* 6. Studio fechado devolve nada */
const fechado = gradeDeHorarios({
  data: hoje, servico, profissionais: equipe, profissionalId: null,
  jornada: { ...jornada, aberto: false }, bloqueios: [], agendamentos: [], studio,
})
conferir('dia fechado não oferece horário', fechado.length === 0)

console.log(falhas === 0 ? '\nTUDO PASSOU' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
