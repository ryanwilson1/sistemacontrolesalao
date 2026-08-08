import { ErroDeRegra } from '@/utils/erros'

/**
 * Reconhecimento de imagem pelos bytes.
 *
 * Fica em `utils/` e não em `services/` por uma razão que um teste
 * revelou: a validação não precisa de rede, de Supabase nem de
 * `import.meta.env` — e enquanto ela morava junto do upload, testá-la
 * exigia carregar o cliente do banco inteiro. Regra que não depende de
 * infraestrutura não deve morar dentro dela.
 *
 * **O tipo do arquivo é lido dos bytes, não do nome.**
 *
 * `arquivo.type` vem do navegador, que o deduz da extensão. Renomear
 * `virus.exe` para `logo.png` muda os dois — e a checagem ingênua
 * aprova. Os primeiros bytes, ao contrário, não mentem: todo PNG
 * começa com a mesma assinatura, e nenhum executável começa com ela.
 *
 * Isso vale mesmo com o bucket restrito por MIME no servidor. O Storage
 * do Supabase também confia no cabeçalho declarado pelo cliente; a
 * barreira de verdade é ler o começo do arquivo.
 *
 * **SVG não entra.**
 *
 * Um SVG é um documento XML, e XML aceita `<script>`. Servido do nosso
 * próprio domínio — que é o que "logo do salão" significa — ele
 * executaria com as permissões do sistema, com acesso à sessão de quem
 * estivesse olhando. Aceitar SVG com segurança exigiria higienizar o
 * arquivo no servidor, e não há servidor. Fora, então.
 */

const TAMANHO_MAXIMO = 2 * 1024 * 1024 // 2 MB

/** Assinaturas de arquivo. O primeiro byte de cada formato aceito. */
const ASSINATURAS: Array<{ tipo: string; extensao: string; bytes: number[]; deslocamento?: number }> = [
  { tipo: 'image/png',  extensao: 'png',  bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { tipo: 'image/jpeg', extensao: 'jpg',  bytes: [0xff, 0xd8, 0xff] },
  // WEBP: "RIFF" nos bytes 0-3 e "WEBP" nos bytes 8-11.
  { tipo: 'image/webp', extensao: 'webp', bytes: [0x57, 0x45, 0x42, 0x50], deslocamento: 8 },
]

export interface ImagemVerificada {
  tipo: string
  extensao: string
}

/** Lê os primeiros bytes e diz o que o arquivo é de verdade. */
async function reconhecer(arquivo: File): Promise<ImagemVerificada | null> {
  const cabecalho = new Uint8Array(await arquivo.slice(0, 16).arrayBuffer())

  for (const formato of ASSINATURAS) {
    const inicio = formato.deslocamento ?? 0
    const bate = formato.bytes.every((byte, i) => cabecalho[inicio + i] === byte)
    if (bate) return { tipo: formato.tipo, extensao: formato.extensao }
  }
  return null
}

/**
 * Confere um arquivo antes de qualquer envio.
 *
 * Separada do upload de propósito: a tela usa isto para mostrar o
 * preview e o erro **antes** de gastar rede.
 */
export async function conferirImagem(arquivo: File): Promise<ImagemVerificada> {
  if (arquivo.size === 0) {
    throw new ErroDeRegra('O arquivo está vazio.')
  }

  if (arquivo.size > TAMANHO_MAXIMO) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1)
    throw new ErroDeRegra(
      `A imagem tem ${mb} MB e o limite é 2 MB. Reduza o tamanho e tente de novo.`,
    )
  }

  const reconhecido = await reconhecer(arquivo)

  if (!reconhecido) {
    throw new ErroDeRegra(
      'Este arquivo não é uma imagem PNG, JPG ou WEBP. Escolha outro, por favor.',
    )
  }

  return reconhecido
}

/** Só para a tela mostrar o limite sem repetir o número. */
export const LIMITE_DE_IMAGEM_MB = TAMANHO_MAXIMO / 1024 / 1024
