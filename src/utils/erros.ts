/**
 * Erro de regra de negócio: a mensagem já vem pronta para a tela.
 * Distingue "a usuária fez algo inválido" de "o sistema quebrou".
 */
export class ErroDeRegra extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeRegra'
  }
}

/**
 * Alguém alterou o mesmo registro enquanto esta tela editava.
 *
 * Separado de `ErroDeRegra` porque pede uma reação diferente da tela:
 * não é "corrija o que você digitou", é "confira o que mudou antes de
 * gravar por cima". Quem trata este erro deve oferecer a escolha, não
 * apenas mostrar a mensagem.
 */
export class ErroDeConflito extends Error {
  constructor(mensagem?: string) {
    super(
      mensagem ??
        'Este registro foi alterado em outro dispositivo. Recarregue a tela antes de salvar.',
    )
    this.name = 'ErroDeConflito'
  }
}

/** Estamos em desenvolvimento? Nunca lança, mesmo sem `import.meta.env`. */
function emDesenvolvimento(): boolean {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
  } catch {
    return false
  }
}

/**
 * Falta configuração para o sistema funcionar.
 *
 * Separado dos demais porque não é erro de uso nem falha passageira: é
 * o sistema publicado sem as credenciais do banco. Ninguém resolve
 * tentando de novo — alguém precisa cadastrar as variáveis e publicar
 * outra vez. A tela trata este caso com instruções, não com "tente
 * novamente".
 */
export class ErroDeConfiguracao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeConfiguracao'
  }
}

/**
 * O servidor pediu para esperar.
 *
 * O Supabase limita quantos e-mails de recuperação saem por minuto —
 * é proteção contra alguém usar o sistema para inundar a caixa de
 * entrada de terceiros. Ao estourar, ele responde 429.
 *
 * Separado dos demais porque não é erro de uso nem falha: é o tempo
 * fazendo seu trabalho. Tentar de novo na hora não adianta, e é
 * exatamente o que a pessoa faz quando lê "não foi possível enviar".
 */
export class ErroDeEspera extends Error {
  constructor(mensagem?: string) {
    super(mensagem ?? 'Aguarde alguns instantes antes de pedir um novo link.')
    this.name = 'ErroDeEspera'
  }
}

/** Traduz qualquer falha para uma frase que a usuária entende. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroDeEspera) return erro.message
  if (erro instanceof ErroDeConfiguracao) return erro.message
  if (erro instanceof ErroDeConflito) return erro.message
  if (erro instanceof ErroDeRegra) return erro.message
  if (erro instanceof Error) {
    if (erro.message.includes('QuotaExceeded')) {
      return 'O armazenamento do aparelho está cheio. Libere espaço e tente de novo.'
    }
    /*
      `import.meta.env` nem sempre existe.

      No navegador o Vite substitui esta expressão em tempo de build e
      tudo funciona. Fora dali — teste, ferramenta de linha de comando,
      renderização no servidor — ela é `undefined`, e ler `.DEV` de
      `undefined` lança.

      O detalhe que torna isso grave: quem lança é a função que traduz
      erros. Ou seja, o tradutor quebrava exatamente quando alguém
      pedia a ele para explicar uma falha, trocando uma mensagem
      amigável por uma tela em branco.
    */
    if (emDesenvolvimento()) return erro.message
  }
  return 'Algo não saiu como esperado. Tente novamente.'
}
