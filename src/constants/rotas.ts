/**
 * Endereços em um lugar só. Evita string solta espalhada pelo código e
 * torna a renomeação de uma rota uma mudança de uma linha.
 */
export const ROTAS = {
  painel: '/',
  agenda: '/agenda',
  clientes: '/clientes',
  cliente: (id: string) => `/clientes/${id}`,
  servicos: '/servicos',
  estoque: '/estoque',
  financeiro: '/financeiro',
  caixa: '/caixa',
  cupons: '/cupons',
  fidelidade: '/fidelidade',
  relatorios: '/relatorios',
  configuracoes: '/configuracoes',
  backup: '/backup',
  lembretes: '/lembretes',
  assistente: '/assistente',
  portal: '/portal',

  entrar: '/entrar',
  cadastrar: '/cadastrar',
  esqueciSenha: '/esqueci-a-senha',
  novaSenha: '/nova-senha',
  primeiroAcesso: '/primeiro-acesso',

  /* ---- Portal da cliente (sem sessão) ---- */
  agendamentoPublico: (identificador: string) => `/agendar/${identificador}`,
  meuHorario: (identificador: string) => `/agendar/${identificador}/meu-horario`,
} as const

/**
 * As áreas que o acesso restrito alcança.
 *
 * Era uma comparação solta com `ROTAS.agenda` dentro do menu. Virou
 * lista quando a segunda área entrou: com duas, a comparação solta
 * vira `||`, e o `||` seguinte alguém esquece.
 *
 * A lista é **de permissão**, não de bloqueio, e isso é a garantia que
 * importa aqui: a tela nova de amanhã não entra por omissão. Ela nasce
 * fora, e só passa a aparecer quando alguém escrever o endereço abaixo
 * de propósito.
 *
 * O par desta lista mora em `src/routes/index.tsx` — as mesmas duas
 * rotas ficam fora da guarda `ExigeAcessoCompleto`. Mexer numa sem a
 * outra dá o pior dos dois resultados: menu que aparece e não abre, ou
 * tela que abre sem constar no menu.
 */
export const AREAS_DO_ACESSO_RESTRITO: readonly string[] = [
  ROTAS.agenda,
  ROTAS.clientes,
]
