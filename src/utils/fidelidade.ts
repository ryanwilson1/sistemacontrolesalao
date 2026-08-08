/**
 * Validade dos pontos de fidelidade.
 *
 * Fica em `utils/` e não junto do repositório porque é regra, não
 * infraestrutura: não precisa de rede, de Supabase nem de
 * `import.meta.env`. Enquanto morava lá, testá-la exigia carregar o
 * cliente do banco inteiro — o mesmo acoplamento que já tinha aparecido
 * na validação de imagem.
 */

/* ------------------------------------------------------------------ */
/* Validade dos pontos                                                 */
/* ------------------------------------------------------------------ */
/*
  `validadeDias` existia na configuração e não era consultado em lugar
  nenhum: o saldo somava tudo, para sempre.

  O efeito prático aparecia no balcão. A tela dizia que a cliente tinha
  800 pontos; a regra do salão dizia que pontos valem 180 dias. A
  proprietária dava o desconto porque o sistema afirmou o saldo, ou
  negava e ficava desmentindo a própria tela na frente da cliente.

  Resgate já feito entra como pontuação negativa, e negativo nunca
  vence — senão uma dívida sumiria com o tempo e o saldo subiria
  sozinho.
*/

/** A partir de que instante um ponto ainda vale. Nulo = valem sempre. */
export function limiteDeValidade(validadeDias: number | null): number | null {
  if (!validadeDias || validadeDias <= 0) return null
  return Date.now() - validadeDias * 86_400_000
}

export function venceu(
  ponto: { criadoEm: string; pontos: number },
  limite: number | null,
): boolean {
  if (limite === null) return false
  // Resgates (negativos) não vencem.
  if (ponto.pontos < 0) return false
  return new Date(ponto.criadoEm).getTime() < limite
}

export function somarValidos(
  pontos: { criadoEm: string; pontos: number }[],
  validadeDias: number | null,
): number {
  const limite = limiteDeValidade(validadeDias)
  return pontos.reduce((total, p) => (venceu(p, limite) ? total : total + p.pontos), 0)
}
