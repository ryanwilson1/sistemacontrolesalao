import { MessageCircle } from 'lucide-react'
import { Botao, type TamanhoBotao, type VarianteBotao } from '@/components/ui'
import { digitos, linkWhatsApp } from '@/utils/formato'
import { dataRelativa, hora } from '@/utils/datas'

/**
 * Falar com a cliente pelo WhatsApp.
 *
 * A mensagem vem escrita, mas **nada é enviado daqui**. O botão abre a
 * conversa com o texto no campo, e quem aperta enviar é a proprietária.
 *
 * A distinção é a regra 11 do escopo e não é formalidade: uma mensagem
 * que sai sozinha chega em hora errada, com o tom errado, para a
 * cliente errada — e quem responde por ela é o salão, não o sistema.
 * Deixar o dedo dela no gatilho custa um toque e evita todos esses
 * casos.
 */

/**
 * O número serve para abrir conversa?
 *
 * A montagem do endereço fica em `linkWhatsApp`, que já existia e já
 * resolve o código do país. Reimplementar aqui criaria duas regras
 * para a mesma coisa — e um dia elas divergiriam.
 */
export const temWhatsapp = (telefone: string | null | undefined): boolean =>
  digitos(telefone ?? '').length >= 10

export function BotaoWhatsapp({
  telefone,
  mensagem,
  rotulo = 'WhatsApp',
  variante = 'secundario',
  tamanho = 'sm',
  className,
}: {
  telefone: string | null | undefined
  mensagem?: string
  rotulo?: string
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  className?: string
}) {
  /*
    Sem telefone válido, o botão não aparece — em vez de aparecer
    desabilitado.

    Um botão cinza levanta a pergunta "por que não posso clicar?" toda
    vez que a ficha é aberta. A ausência dele responde a pergunta certa
    sozinha: não há número cadastrado.
  */
  if (!temWhatsapp(telefone)) return null

  const endereco = linkWhatsApp(telefone ?? '', mensagem)

  return (
    <a
      href={endereco}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label={`Abrir conversa no WhatsApp${mensagem ? ' com mensagem pronta' : ''}`}
    >
      <Botao variante={variante} tamanho={tamanho}>
        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        {rotulo}
      </Botao>
    </a>
  )
}

/* ------------------------------------------------------------------ */
/* Mensagens prontas                                                   */
/* ------------------------------------------------------------------ */
/*
  Ficam aqui, e não espalhadas pelas telas, para terem o mesmo tom.
  São escritas como a proprietária escreveria — primeiro nome, sem
  formalidade, com o dado exato que a cliente precisa conferir.

  O primeiro nome apenas: "Olá, Ana Paula Fernandes da Silva" não é
  como ninguém fala com a própria cliente.
*/

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

export const MENSAGENS = {
  confirmacao: (nome: string, quando: string, servico?: string | null) =>
    `Olá, ${primeiroNome(nome)}! Tudo bem? 😊 Passando para confirmar seu horário ` +
    `${dataRelativa(quando).toLowerCase()} às ${hora(quando)}` +
    `${servico ? ` — ${servico}` : ''}. Está de pé?`,

  lembrete: (nome: string, quando: string) =>
    `Oi, ${primeiroNome(nome)}! 💛 Seu horário é ${dataRelativa(quando).toLowerCase()} ` +
    `às ${hora(quando)}. Te espero!`,

  vagaAberta: (nome: string, quando: string) =>
    `Oi, ${primeiroNome(nome)}! Abriu uma vaga ${dataRelativa(quando).toLowerCase()} ` +
    `às ${hora(quando)}. Quer ficar com ela?`,

  aposFalta: (nome: string) =>
    `Oi, ${primeiroNome(nome)}! Senti sua falta no horário de hoje. ` +
    `Quer que eu remarque para outro dia?`,

  saudade: (nome: string) =>
    `Oi, ${primeiroNome(nome)}! Faz um tempinho que você não aparece por aqui 😊 ` +
    `Quer agendar um horário?`,

  aniversario: (nome: string) =>
    `Feliz aniversário, ${primeiroNome(nome)}! 🎉 Que seu dia seja lindo. ` +
    `Um beijo de toda a equipe!`,
} as const
