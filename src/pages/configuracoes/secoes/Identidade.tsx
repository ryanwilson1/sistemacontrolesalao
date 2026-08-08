import { useEffect, useState } from 'react'
import { AtSign, MapPin, Phone, Save } from 'lucide-react'
import { Botao, Campo, Carta, CartaTitulo, Entrada } from '@/components/ui'
import { useAviso, useTema } from '@/contexts'
import { useSalvarStudio } from '@/hooks'
import { TEMAS } from '@/constants'
import { digitos, mascaraTelefone } from '@/utils/formato'
import { limparIdentificador, limparInstagram, limparNome } from '@/utils/sanitizar'
import { ErroDeRegra, mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { Studio } from '@/types'

/** Nome, contato e paleta do studio. */
export function Identidade({ studio, aoSalvar }: { studio: Studio; aoSalvar: () => Promise<void> }) {
  const salvar = useSalvarStudio()
  const { tema, aplicar } = useTema()
  const aviso = useAviso()

  const [nome, setNome] = useState(studio.nome)
  const [identificador, setIdentificador] = useState(studio.identificador)
  const [telefone, setTelefone] = useState(studio.telefone ?? '')
  const [whatsapp, setWhatsapp] = useState(studio.whatsapp ?? '')
  const [instagram, setInstagram] = useState(studio.instagram ?? '')
  const [endereco, setEndereco] = useState(studio.endereco ?? '')

  useEffect(() => {
    setNome(studio.nome)
    setIdentificador(studio.identificador)
    setTelefone(studio.telefone ?? '')
    setWhatsapp(studio.whatsapp ?? '')
    setInstagram(studio.instagram ?? '')
    setEndereco(studio.endereco ?? '')
  }, [studio])

  const enviar = async () => {
    try {
      const nomeLimpo = limparNome(nome)
      if (nomeLimpo.length < 2) throw new ErroDeRegra('Informe o nome do studio.')

      const chave = limparIdentificador(identificador)
      if (chave.length < 3) {
        throw new ErroDeRegra('O endereço do link precisa de pelo menos 3 caracteres.')
      }

      await salvar.executar({
        nome: nomeLimpo,
        identificador: chave,
        telefone: digitos(telefone) || null,
        whatsapp: digitos(whatsapp) || null,
        instagram: instagram ? limparInstagram(instagram) : null,
        endereco: endereco.trim() || null,
        tema: tema.chave,
      })

      await aoSalvar()
      aviso.sucesso('Identidade atualizada')
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <div className="space-y-4">
      <Carta>
        <CartaTitulo titulo="Dados do studio" descricao="Aparecem no link público de agendamento" />

        <div className="space-y-4">
          <Campo rotulo="Nome do studio" obrigatorio>
            <Entrada value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          </Campo>

          <Campo
            rotulo="Endereço do link"
            obrigatorio
            dica={`O link fica: .../agendar/${identificador || 'seu-studio'}`}
          >
            <Entrada
              value={identificador}
              onChange={(e) => setIdentificador(limparIdentificador(e.target.value))}
              maxLength={40}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Telefone">
              <Entrada
                value={mascaraTelefone(telefone)}
                onChange={(e) => setTelefone(e.target.value)}
                inputMode="tel" prefixo={<Phone className="h-4 w-4" />}
              />
            </Campo>
            <Campo rotulo="WhatsApp">
              <Entrada
                value={mascaraTelefone(whatsapp)}
                onChange={(e) => setWhatsapp(e.target.value)}
                inputMode="tel" prefixo={<Phone className="h-4 w-4" />}
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Instagram">
              <Entrada
                value={instagram} onChange={(e) => setInstagram(e.target.value)}
                placeholder="@studio" prefixo={<AtSign className="h-4 w-4" />} maxLength={31}
              />
            </Campo>
            <Campo rotulo="Endereço">
              <Entrada
                value={endereco} onChange={(e) => setEndereco(e.target.value)}
                placeholder="Rua, número, bairro"
                prefixo={<MapPin className="h-4 w-4" />} maxLength={200}
              />
            </Campo>
          </div>
        </div>
      </Carta>

      <Carta>
        <CartaTitulo titulo="Paleta" descricao="Muda o acento do sistema inteiro" />

        <div className="grid gap-2.5 sm:grid-cols-3">
          {Object.values(TEMAS).map((opcao) => (
            <button
              key={opcao.chave}
              onClick={() => aplicar(opcao.chave)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                tema.chave === opcao.chave
                  ? 'border-onix-800 bg-quartzo-50'
                  : 'border-onix-100 bg-white hover:border-onix-300',
              )}
            >
              <span
                className="h-9 w-9 shrink-0 rounded-lg"
                style={{ background: `linear-gradient(135deg, ${opcao.acento}, ${opcao.acentoSuave})` }}
              />
              <span className="min-w-0 text-[13.5px] font-medium text-onix-800">{opcao.nome}</span>
            </button>
          ))}
        </div>
      </Carta>

      <div className="flex justify-end">
        <Botao variante="ouro" onClick={() => void enviar()} carregando={salvar.salvando}>
          <Save className="h-4 w-4" /> Salvar identidade
        </Botao>
      </div>
    </div>
  )
}
