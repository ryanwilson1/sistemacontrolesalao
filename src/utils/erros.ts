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

/**
 * Sessão vencida ou conta sem acesso.
 *
 * Separado porque a saída é uma só e é específica: entrar de novo.
 * Enquanto isto vinha como `ErroDeRegra` genérico, a proprietária lia
 * a frase e ficava tentando salvar o formulário — que nunca ia salvar.
 */
export class ErroDeSessao extends Error {
  constructor(mensagem?: string) {
    super(mensagem ?? 'Sua sessão expirou. Entre novamente.')
    this.name = 'ErroDeSessao'
  }
}

/** A conta está válida, mas esta ação não é dela. */
export class ErroDePermissao extends Error {
  constructor(mensagem?: string) {
    super(mensagem ?? 'Você não possui permissão para realizar esta ação.')
    this.name = 'ErroDePermissao'
  }
}

/** Traduz qualquer falha para uma frase que a usuária entende. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroDeEspera) return erro.message
  if (erro instanceof ErroDeConfiguracao) return erro.message
  if (erro instanceof ErroDeConflito) return erro.message
  if (erro instanceof ErroDeSessao) return erro.message
  if (erro instanceof ErroDePermissao) return erro.message
  if (erro instanceof ErroDeRegra) return erro.message

  /*
    Rede e tempo esgotado vêm ANTES do bloco genérico.

    ---------------------------------------------------------------
    O que estava errado
    ---------------------------------------------------------------
    Toda falha que não fosse regra de negócio caía na mesma frase:
    "Algo não saiu como esperado. Tente novamente."

    Ela é honesta e é inútil. Sem internet, tentar de novo não resolve
    e a pessoa insiste. Com o servidor fora, idem. Com sessão vencida,
    ela tenta a mesma coisa dez vezes antes de pensar em sair e entrar.

    Cada uma dessas situações tem uma ação diferente, e a mensagem é o
    único lugar onde o sistema pode dizer qual é.

    A comparação é por `name` e não por `instanceof` de propósito: este
    arquivo é importado por `services/rede.ts`, e importá-lo de volta
    fecharia um ciclo que o Vite resolve com `undefined` em tempo de
    execução — o `instanceof` passaria a ser sempre falso, em silêncio.
  */
  if (erro instanceof Error) {
    if (erro.name === 'ErroDeTempo') {
      // A mensagem vem pronta de quem estourou o prazo — e a diferença
      // importa: numa leitura ela diz "tente de novo", numa gravação
      // diz "confira antes de tentar", porque a gravação pode ter
      // chegado. Sobrescrever aqui apagava essa distinção.
      return erro.message
    }
    if (erro.name === 'ErroDeRede') {
      return typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'Você está sem conexão com a internet.'
        : 'Não conseguimos acessar o servidor no momento.'
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Você está sem conexão com a internet.'
  }

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
