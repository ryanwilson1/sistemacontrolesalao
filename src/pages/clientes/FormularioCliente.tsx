import { useEffect, useState } from 'react'
import { AtSign, Cake, MessageCircle, Phone, UserRound } from 'lucide-react'
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Modal } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useSalvarCliente } from '@/hooks'
import { clientesRepo } from '@/services'
import { useDebounce } from '@/hooks/useDebounce'
import { digitos, mascaraTelefone } from '@/utils/formato'
import { FORMULARIO } from '@/constants'
import { limparInstagram, limparNome, limparTexto } from '@/utils/sanitizar'
import { isoData } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'
import type { Cliente } from '@/types'

export function FormularioCliente({
  aberto, aoFechar, cliente,
}: {
  aberto: boolean
  aoFechar: () => void
  cliente?: Cliente | null
}) {
  const salvar = useSalvarCliente()
  const aviso = useAviso()
  const editando = !!cliente

  const [nome, setNome] = useState('')
  const [fone, setFone] = useState('')
  const [whats, setWhats] = useState('')
  const [instagram, setInstagram] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [preferencias, setPreferencias] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [aceitaContato, setAceitaContato] = useState(false)
  const [erroNome, setErroNome] = useState('')
  const [duplicada, setDuplicada] = useState<Cliente | null>(null)

  useEffect(() => {
    if (!aberto) return
    setNome(cliente?.nome ?? '')
    setFone(cliente?.telefone ? mascaraTelefone(cliente.telefone) : '')
    setWhats(cliente?.whatsapp ? mascaraTelefone(cliente.whatsapp) : '')
    setInstagram(cliente?.instagram ?? '')
    setNascimento(cliente?.nascimento ?? '')
    setPreferencias(cliente?.preferencias ?? '')
    setObservacoes(cliente?.observacoes ?? '')
    setAceitaContato(cliente?.aceitaContato ?? false)
    setErroNome('')
    setDuplicada(null)
  }, [aberto, cliente])

  // WhatsApp acompanha o telefone até alguém editar separadamente.
  useEffect(() => {
    if (!editando && !whats) setWhats(fone)
  }, [fone, whats, editando])

  /*
    Aviso de ficha repetida, enquanto ela digita.

    O telefone já é único no banco, então salvar uma segunda ficha com o
    mesmo número dá erro — mas o erro chega depois de a recepcionista ter
    preenchido tudo, e ela ainda não sabe que a pessoa já tem histórico
    ali dentro. Avisar antes transforma um erro em atalho.

    É aviso, não bloqueio: o escopo pede para não travar caso legítimo, e
    quem está com a cliente na frente sabe mais do que o sistema.
  */
  const foneAdiado = useDebounce(digitos(fone), FORMULARIO.atrasoBuscaMs)

  useEffect(() => {
    if (foneAdiado.length < 10) return setDuplicada(null)

    let ativo = true
    void (async () => {
      try {
        const achada = await clientesRepo.porTelefone(foneAdiado)
        if (!ativo) return
        setDuplicada(achada && achada.id !== cliente?.id ? achada : null)
      } catch {
        // Sem rede, o aviso simplesmente não aparece. O índice único do
        // banco continua sendo a garantia de verdade.
      }
    })()

    return () => {
      ativo = false
    }
  }, [foneAdiado, cliente?.id])

  const enviar = async () => {
    const nomeLimpo = limparNome(nome)
    if (nomeLimpo.length < 2) {
      setErroNome('Informe o nome da cliente')
      return
    }

    try {
      await salvar.executar({
        id: cliente?.id,
        dados: {
          nome: nomeLimpo,
          telefone: digitos(fone) || null,
          whatsapp: digitos(whats) || null,
          instagram: instagram ? limparInstagram(instagram) : null,
          nascimento: nascimento || null,
          preferencias: limparTexto(preferencias, 2000) || null,
          observacoes: limparTexto(observacoes, 4000) || null,
          etiquetas: cliente?.etiquetas ?? [],
          aceitaContato,
          ativo: true,
        },
      })

      aviso.sucesso(editando ? 'Ficha atualizada' : 'Cliente cadastrada', nomeLimpo)
      aoFechar()
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <Modal
      estadoDoFormulario={{ nome, fone, whats, instagram, nascimento, preferencias, observacoes, aceitaContato }}
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar ficha' : 'Nova cliente'}
      descricao={editando ? undefined : 'Só o nome é obrigatório. O resto você completa depois.'}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="ouro" onClick={() => void enviar()} carregando={salvar.salvando}>
            {editando ? 'Salvar alterações' : 'Cadastrar cliente'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Campo rotulo="Nome completo" obrigatorio erro={erroNome}>
          <Entrada
            value={nome}
            onChange={(e) => { setNome(e.target.value); setErroNome('') }}
            placeholder="Como ela prefere ser chamada"
            prefixo={<UserRound className="h-4 w-4" />}
            erro={!!erroNome}
            maxLength={120}
            autoFocus
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Telefone">
            <Entrada
              value={fone} onChange={(e) => setFone(mascaraTelefone(e.target.value))}
              placeholder="(11) 98765-4321" inputMode="tel"
              prefixo={<Phone className="h-4 w-4" />}
            />
          </Campo>
          <Campo rotulo="WhatsApp">
            <Entrada
              value={whats} onChange={(e) => setWhats(mascaraTelefone(e.target.value))}
              placeholder="(11) 98765-4321" inputMode="tel"
              prefixo={<MessageCircle className="h-4 w-4" />}
            />
          </Campo>
        </div>

        {duplicada && (
          <div className="flex items-start gap-2.5 rounded-xl border border-ouro-200 bg-ouro-100/60 p-3">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-ouro-600" strokeWidth={1.8} />
            <p className="text-[12.5px] leading-relaxed text-ouro-700">
              Já existe uma ficha com este telefone:{' '}
              <strong className="font-medium">{duplicada.nome}</strong>. Use o
              cadastro existente para não partir o histórico dela em dois — feche
              aqui e procure por ela na lista.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Instagram">
            <Entrada
              value={instagram} onChange={(e) => setInstagram(e.target.value)}
              placeholder="@cliente" prefixo={<AtSign className="h-4 w-4" />} maxLength={31}
            />
          </Campo>
          <Campo rotulo="Aniversário" dica="Aparece no painel no dia.">
            <Entrada
              type="date" value={nascimento} max={isoData(new Date())}
              onChange={(e) => setNascimento(e.target.value)}
              prefixo={<Cake className="h-4 w-4" />}
            />
          </Campo>
        </div>

        <Campo rotulo="Preferências" dica="Tom preferido, produtos, tempo de espera.">
          <AreaTexto
            value={preferencias} onChange={(e) => setPreferencias(e.target.value)}
            placeholder="Ex.: gosta de café sem açúcar, prefere loiro frio"
            maxLength={2000} rows={2}
          />
        </Campo>

        <Campo rotulo="Observações" dica="Alergias, cuidados especiais, histórico relevante.">
          <AreaTexto
            value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex.: sensibilidade no couro cabeludo"
            maxLength={4000} rows={2}
          />
        </Campo>

        <div className="rounded-xl border border-onix-100 bg-quartzo-50 p-3.5">
          <Interruptor
            ligado={aceitaContato}
            aoMudar={setAceitaContato}
            rotulo="Aceita receber mensagens"
            descricao="Autoriza contato para promoções. Sem isso, só falamos sobre agendamentos."
          />
        </div>
      </div>
    </Modal>
  )
}
