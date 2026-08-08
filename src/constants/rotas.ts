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
