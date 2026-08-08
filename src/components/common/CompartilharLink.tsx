import { Check, Copy, ExternalLink, Share2 } from 'lucide-react'
import { Botao } from '@/components/ui'
import { BotaoQrCode } from './BotaoQrCode'
import { useAviso } from '@/contexts'
import { useCopiar } from '@/hooks'

/**
 * Compartilhar o link de agendamento.
 *
 * O link só vale se sair daqui e chegar na cliente, e cada salão faz
 * isso de um jeito: uns mandam no WhatsApp, outros colam na bio do
 * Instagram, outros imprimem o QR Code e deixam no balcão.
 *
 * O compartilhamento nativo aparece **quando existe**. No celular ele é
 * o melhor caminho de longe — abre a lista de contatos do WhatsApp com
 * o link pronto. No desktop quase nenhum navegador o implementa, e um
 * botão que não faz nada é pior do que botão nenhum; por isso a
 * verificação em vez de exibir sempre.
 */
export function CompartilharLink({
  endereco,
  nomeDoSalao,
}: {
  endereco: string
  nomeDoSalao: string
}) {
  const { copiado, copiar } = useCopiar()
  const aviso = useAviso()

  const convite = `Olá! Agende seu horário no ${nomeDoSalao} por aqui: ${endereco}`

  const temCompartilhamentoNativo =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const compartilhar = async () => {
    try {
      await navigator.share({ title: nomeDoSalao, text: convite, url: endereco })
    } catch (falha) {
      // Cancelar a folha de compartilhamento lança `AbortError`. Não é
      // erro — é a pessoa mudando de ideia — e avisar sobre isso seria
      // ruído.
      if ((falha as Error)?.name !== 'AbortError') {
        aviso.erro('Não foi possível compartilhar', 'Copie o link e envie manualmente.')
      }
    }
  }

  return (
    <div className="rounded-xl border border-onix-100 bg-quartzo-50 p-3">
        <p className="break-all font-mono text-[12.5px] leading-relaxed text-onix-600">
          {endereco}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {temCompartilhamentoNativo && (
            <Botao variante="ouro" tamanho="sm" onClick={() => void compartilhar()}>
              <Share2 className="h-3.5 w-3.5" /> Compartilhar
            </Botao>
          )}

          <Botao variante="secundario" tamanho="sm" onClick={() => void copiar(endereco)}>
            {copiado ? (
              <><Check className="h-3.5 w-3.5 text-sucesso" /> Copiado</>
            ) : (
              <><Copy className="h-3.5 w-3.5" /> Copiar link</>
            )}
          </Botao>

          {/*
            `wa.me` em vez de `whatsapp://`: funciona no computador
            (abre o WhatsApp Web) e no celular (abre o aplicativo). O
            esquema nativo só funciona no segundo caso e deixa a
            proprietária sem ação no primeiro.
          */}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(convite)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Botao variante="secundario" tamanho="sm">
              <Share2 className="h-3.5 w-3.5" /> WhatsApp
            </Botao>
          </a>

          {/* Traz o próprio botão e o próprio diálogo. */}
          <BotaoQrCode endereco={endereco} nome={nomeDoSalao} />

          <a href={endereco} target="_blank" rel="noopener noreferrer">
            <Botao variante="fantasma" tamanho="sm">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </Botao>
          </a>
        </div>
    </div>
  )
}
