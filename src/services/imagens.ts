import { supabase, temSupabase } from './supabase/cliente'
import { comAcompanhamento } from './conexao'
import { conferirImagem, LIMITE_DE_IMAGEM_MB } from '@/utils/imagem'
import { ErroDeRegra } from '@/utils/erros'

/**
 * Envio das imagens do salão: logo e capa.
 *
 * A validação do arquivo mora em `utils/imagem.ts` — ela é regra, não
 * infraestrutura. Aqui fica só o que precisa de rede.
 */

export type TipoDeImagem = 'logo' | 'capa'

/**
 * Envia a imagem e devolve a URL pública.
 *
 * O nome do arquivo carrega o instante do envio. Sem isso, trocar a
 * logo manteria a URL antiga — e o navegador da proprietária, que já
 * guardou aquela imagem em cache, continuaria mostrando a anterior por
 * dias. Ela concluiria que o upload não funcionou.
 */
export async function enviarImagem(
  arquivo: File,
  qual: TipoDeImagem,
  studioId: string,
): Promise<string> {
  if (!temSupabase()) {
    throw new ErroDeRegra(
      'O envio de imagens precisa do banco de dados configurado. ' +
      'Sem ele, o arquivo ficaria só neste aparelho.',
    )
  }

  const { tipo, extensao } = await conferirImagem(arquivo)
  const caminho = `${studioId}/${qual}-${Date.now()}.${extensao}`

  return comAcompanhamento(async () => {
    const { error } = await supabase()
      .storage.from('identidade')
      .upload(caminho, arquivo, {
        contentType: tipo,
        // `upsert: false` com nome único: um envio nunca sobrescreve
        // outro por acidente, e a imagem anterior continua acessível
        // até alguém apagá-la de propósito.
        upsert: false,
        cacheControl: '31536000',
      })

    if (error) {
      if (/exceeded|too large|payload/i.test(error.message)) {
        throw new ErroDeRegra('A imagem é grande demais. O limite é 2 MB.')
      }
      if (/mime|content.?type/i.test(error.message)) {
        throw new ErroDeRegra('Formato não aceito. Use PNG, JPG ou WEBP.')
      }
      if (/not found|bucket/i.test(error.message)) {
        throw new ErroDeRegra(
          'A área de imagens não está configurada. Rode supabase/07-identidade.sql.',
        )
      }
      if (/policy|denied|unauthorized/i.test(error.message)) {
        throw new ErroDeRegra('Sua sessão expirou. Entre novamente para enviar a imagem.')
      }
      throw new ErroDeRegra('Não foi possível enviar a imagem. Tente novamente.')
    }

    const { data } = supabase().storage.from('identidade').getPublicUrl(caminho)
    return data.publicUrl
  })
}

/**
 * Remove uma imagem do Storage.
 *
 * Falha em silêncio de propósito. Isto é chamado depois que a coluna do
 * banco já foi limpa; se a remoção do arquivo não der certo, o que
 * sobra é um arquivo órfão de 200 KB — e transformar isso num erro
 * vermelho na tela faria a proprietária achar que a logo não saiu,
 * quando ela já saiu.
 */
export async function removerImagem(url: string | null): Promise<void> {
  if (!url || !temSupabase()) return

  try {
    const marca = '/identidade/'
    const posicao = url.indexOf(marca)
    if (posicao === -1) return

    const caminho = url.slice(posicao + marca.length).split('?')[0]
    await supabase().storage.from('identidade').remove([caminho])
  } catch {
    // Arquivo órfão não é problema da proprietária.
  }
}

/** Só para a tela mostrar o limite sem repetir o número. */

export { LIMITE_DE_IMAGEM_MB }
