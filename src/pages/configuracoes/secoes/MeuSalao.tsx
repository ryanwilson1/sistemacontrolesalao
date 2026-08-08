import { useEffect, useState } from 'react'
import {
  AtSign, Facebook, Globe2, Mail, MapPin, MessageCircle, Phone,
} from 'lucide-react'
import { Botao, Campo, Carta, CartaTitulo, AreaTexto, Entrada } from '@/components/ui'
import { BarraDeSalvamento, ConfirmarSaida, EnvioDeImagem } from '@/components/common'
import { Confirmar } from '@/components/feedback'
import { useAviso, useTema } from '@/contexts'
import { useSalvarStudio } from '@/hooks'
import { useAlteracoesNaoSalvas } from '@/hooks/useAlteracoesNaoSalvas'
import { enviarImagem, removerImagem } from '@/services/imagens'
import { TEMAS } from '@/constants'
import { digitos, mascaraTelefone } from '@/utils/formato'
import { mascaraCnpj } from '@/utils/formato'
import { limparIdentificador, limparInstagram, limparNome, urlSegura } from '@/utils/sanitizar'
import { avaliarCorDaMarca } from '@/utils/contraste'
import { ErroDeRegra, mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { Studio } from '@/types'

/**
 * Meu Salão.
 *
 * Um lugar só para tudo que descreve o estabelecimento. A regra 19 do
 * escopo em uma frase: **o WhatsApp do salão mora aqui e em nenhum
 * outro lugar.** Se morasse em dois, um dia eles divergiriam — e o que
 * a cliente vê seria o errado, porque ninguém lembra de atualizar os
 * dois.
 *
 * O que a tela faz de diferente das outras:
 *
 * - o salvamento é explícito e só aparece quando há o que salvar;
 * - sair com campo preenchido pergunta antes;
 * - a cor escolhida é avaliada na hora, e o sistema diz se ela vai
 *   deixar texto ilegível em vez de deixar acontecer.
 */
export function MeuSalao({
  studio,
  aoSalvar,
}: {
  studio: Studio
  aoSalvar: () => Promise<void>
}) {
  const salvar = useSalvarStudio()
  const { tema, aplicar, aplicarCorPropria } = useTema()
  const aviso = useAviso()

  const [form, setForm] = useState(() => doStudio(studio))
  const [recemSalvo, setRecemSalvo] = useState(false)

  const guarda = useAlteracoesNaoSalvas(form)

  /*
    Atualização externa não apaga o que está sendo digitado.

    A versão anterior era `useEffect(() => setForm(doStudio(studio)))`.
    Como o tempo real dispara a cada mudança no studio — inclusive as
    causadas por outra aba, ou pelo próprio upload de logo desta tela —
    a proprietária podia estar no meio da descrição e ver o campo
    voltar ao que estava. Sem erro, sem aviso, e sem forma de recuperar
    o texto.

    Agora, com o formulário sujo, a versão de fora fica em espera e ela
    decide. Com o formulário limpo, a reposição é silenciosa porque não
    há nada a perder.
  */
  const [versaoExterna, setVersaoExterna] = useState<Studio | null>(null)

  useEffect(() => {
    if (!guarda.sujo) {
      setForm(doStudio(studio))
      setVersaoExterna(null)
      return
    }
    setVersaoExterna(studio)
    // `guarda.sujo` fora das dependências de propósito: incluí-lo faria
    // o efeito rodar ao terminar a digitação e repor o formulário —
    // exatamente o que ele existe para impedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio])

  const campo = <C extends keyof Formulario>(chave: C, valor: Formulario[C]) =>
    setForm((atual) => ({ ...atual, [chave]: valor }))

  /* ---- Cor da marca ---- */
  const corEscolhida = form.corPrincipal || TEMAS[form.tema]?.acento || tema.acento
  const veredito = avaliarCorDaMarca(corEscolhida)

  /* ---- Imagens: gravam na hora, fora do fluxo do botão salvar ----
     Uma imagem não é "rascunho": ela já subiu para o servidor quando
     aparece na tela. Deixá-la esperando o botão criaria um estado em
     que o arquivo existe no Storage e a coluna não aponta para ele. */
  const trocarImagem = async (qual: 'logo' | 'capa', arquivo: File) => {
    const anterior = qual === 'logo' ? studio.logoUrl : studio.capaUrl
    const url = await enviarImagem(arquivo, qual, studio.id)

    /*
      Compensação: se o arquivo subiu mas o banco recusou a URL, o
      arquivo recém-enviado é removido.

      Sem isto, cada tentativa fracassada deixava um arquivo no Storage
      que nenhuma linha do banco aponta — invisível na tela, ocupando
      espaço, e impossível de distinguir depois do arquivo bom.

      A ordem inversa (gravar a URL antes de subir) seria pior: a
      coluna apontaria para um arquivo que talvez nunca chegue, e o
      portal mostraria uma imagem quebrada para a cliente.
    */
    try {
      await salvar.executar(qual === 'logo' ? { logoUrl: url } : { capaUrl: url })
    } catch (falha) {
      await removerImagem(url)
      throw falha
    }

    await aoSalvar()

    /*
      A imagem antiga sai por último e sem `await`.

      Se a remoção falhar, sobra um arquivo órfão de alguns KB — e
      transformar isso num erro faria a proprietária achar que a logo
      nova não entrou, quando entrou. O `docs/OPERACAO.md` explica como
      limpar o que sobrar.
    */
    void removerImagem(anterior)
  }

  const apagarImagem = async (qual: 'logo' | 'capa') => {
    const anterior = qual === 'logo' ? studio.logoUrl : studio.capaUrl
    await salvar.executar(qual === 'logo' ? { logoUrl: null } : { capaUrl: null })
    await aoSalvar()
    void removerImagem(anterior)
  }

  /* ---- Salvar ---- */
  const enviar = async () => {
    try {
      const nome = limparNome(form.nome)
      if (nome.length < 2) throw new ErroDeRegra('Informe o nome do salão.')

      const identificador = limparIdentificador(form.identificador)
      if (identificador.length < 3) {
        throw new ErroDeRegra('O endereço do link precisa de pelo menos 3 caracteres.')
      }

      const cnpj = digitos(form.cnpj)
      if (cnpj && cnpj.length !== 14) {
        throw new ErroDeRegra('O CNPJ precisa ter 14 dígitos. Deixe vazio se preferir.')
      }

      const email = form.email.trim().toLowerCase()
      if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
        throw new ErroDeRegra('Confira o e-mail: parece faltar alguma coisa.')
      }

      await salvar.executar({
        nome,
        identificador,
        nomeFantasia: limparNome(form.nomeFantasia) || null,
        razaoSocial: form.razaoSocial.trim() || null,
        cnpj: cnpj || null,
        descricao: form.descricao.trim() || null,
        slogan: form.slogan.trim() || null,
        telefone: digitos(form.telefone) || null,
        whatsapp: digitos(form.whatsapp) || null,
        email: email || null,
        endereco: form.endereco.trim() || null,
        instagram: form.instagram ? limparInstagram(form.instagram) : null,
        facebook: form.facebook.trim() || null,
        site: urlSegura(form.site) || null,
        corPrincipal: form.corPrincipal || null,
        corSecundaria: form.corSecundaria || null,
        tema: form.tema,
      })

      await aoSalvar()

      // Só depois da confirmação do banco. Antes disto, dizer "salvo"
      // seria mentira — e é a mentira que a regra 9 proíbe.
      guarda.marcarComoSalvo()
      setRecemSalvo(true)
      window.setTimeout(() => setRecemSalvo(false), 2600)
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <div className="space-y-4 pb-24">
      {/* ---- Identidade visual ---- */}
      <Carta>
        <CartaTitulo
          titulo="Identidade visual"
          descricao="Aparece no link que a cliente abre"
        />

        <div className="space-y-5">
          <EnvioDeImagem
            rotulo="Logo"
            descricao="Fundo transparente fica melhor. Aparece no topo do portal."
            valor={studio.logoUrl}
            aoEnviar={(arquivo) => trocarImagem('logo', arquivo)}
            aoRemover={() => apagarImagem('logo')}
          />

          <div className="border-t border-onix-50 pt-5">
            <EnvioDeImagem
              rotulo="Foto de capa"
              descricao="Uma foto do espaço. Opcional."
              valor={studio.capaUrl}
              formato="faixa"
              aoEnviar={(arquivo) => trocarImagem('capa', arquivo)}
              aoRemover={() => apagarImagem('capa')}
            />
          </div>
        </div>
      </Carta>

      {/* ---- Cores ---- */}
      <Carta>
        <CartaTitulo titulo="Cores" descricao="Mudam o acento do sistema e do portal" />

        <div className="grid gap-2.5 sm:grid-cols-3">
          {Object.values(TEMAS).map((opcao) => (
            <button
              key={opcao.chave}
              onClick={() => {
                campo('tema', opcao.chave)
                campo('corPrincipal', '')
                aplicar(opcao.chave)
                aplicarCorPropria(null)
              }}
              aria-pressed={form.tema === opcao.chave && !form.corPrincipal}
              className={cn(
                'flex min-h-[56px] items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                form.tema === opcao.chave && !form.corPrincipal
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

        <div className="mt-4 border-t border-onix-50 pt-4">
          <Campo
            rotulo="Ou escolha uma cor própria"
            dica="Deixe vazio para usar a paleta acima."
          >
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={corEscolhida}
                onChange={(e) => {
                  const nova = e.target.value.toUpperCase()
                  campo('corPrincipal', nova)
                  // Pré-visualização ao vivo: o sistema inteiro muda
                  // enquanto ela arrasta. Ver a cor num quadradinho não
                  // diz como ela fica num botão de verdade.
                  aplicarCorPropria(nova)
                }}
                aria-label="Cor principal do salão"
                className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-onix-200 bg-white p-1"
              />
              <Entrada
                value={form.corPrincipal}
                onChange={(e) => campo('corPrincipal', e.target.value.toUpperCase())}
                placeholder="#B08A3E"
                maxLength={7}
                className="font-mono"
              />
              {form.corPrincipal && (
                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  onClick={() => {
                    campo('corPrincipal', '')
                    aplicarCorPropria(null)
                  }}
                >
                  Limpar
                </Botao>
              )}
            </div>
          </Campo>

          {/*
            O aviso de contraste. A cor do texto é calculada, então a
            amostra abaixo mostra exatamente o que a cliente vai ver —
            não uma aproximação otimista.
          */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className="inline-flex h-10 items-center rounded-xl px-4 text-[13.5px] font-medium"
              style={{ background: corEscolhida, color: veredito.corDoTexto }}
            >
              Agendar horário
            </span>
            <p
              className={cn(
                'min-w-0 flex-1 text-[12.5px] leading-snug',
                veredito.nivel === 'ruim'
                  ? 'text-perigo'
                  : veredito.nivel === 'aceitavel'
                    ? 'text-ouro-600'
                    : 'text-onix-400',
              )}
            >
              {veredito.recado}
            </p>
          </div>
        </div>
      </Carta>

      {/* ---- Dados principais ---- */}
      <Carta>
        <CartaTitulo titulo="Dados do salão" descricao="Nome, descrição e endereço do link" />

        <div className="space-y-4">
          <Campo rotulo="Nome do salão" obrigatorio>
            <Entrada
              value={form.nome}
              onChange={(e) => campo('nome', e.target.value)}
              maxLength={120}
              autoComplete="organization"
            />
          </Campo>

          <Campo
            rotulo="Nome fantasia"
            dica="Como a cliente conhece o salão. Vazio = usa o nome acima."
          >
            <Entrada
              value={form.nomeFantasia}
              onChange={(e) => campo('nomeFantasia', e.target.value)}
              maxLength={120}
            />
          </Campo>

          <Campo rotulo="Slogan" dica="Uma frase curta, logo abaixo do nome no portal.">
            <Entrada
              value={form.slogan}
              onChange={(e) => campo('slogan', e.target.value)}
              placeholder="Sua beleza, no seu tempo"
              maxLength={80}
            />
          </Campo>

          <Campo rotulo="Descrição" dica="Duas ou três linhas sobre o salão.">
            <AreaTexto
              value={form.descricao}
              onChange={(e) => campo('descricao', e.target.value)}
              placeholder="Cabelo, unhas e estética. Atendimento com hora marcada."
              maxLength={400}
              rows={3}
            />
          </Campo>

          <Campo
            rotulo="Endereço do link"
            obrigatorio
            dica={`O link fica: .../agendar/${form.identificador || 'seu-salao'}`}
          >
            <Entrada
              value={form.identificador}
              onChange={(e) => campo('identificador', limparIdentificador(e.target.value))}
              maxLength={40}
            />
          </Campo>
        </div>
      </Carta>

      {/* ---- Contato ---- */}
      <Carta>
        <CartaTitulo titulo="Contato" descricao="A cliente usa isto para falar com você" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Telefone">
            <Entrada
              value={mascaraTelefone(form.telefone)}
              onChange={(e) => campo('telefone', e.target.value)}
              inputMode="tel" autoComplete="tel"
              prefixo={<Phone className="h-4 w-4" />}
            />
          </Campo>

          <Campo rotulo="WhatsApp">
            <Entrada
              value={mascaraTelefone(form.whatsapp)}
              onChange={(e) => campo('whatsapp', e.target.value)}
              inputMode="tel"
              prefixo={<MessageCircle className="h-4 w-4" />}
            />
          </Campo>

          <Campo rotulo="E-mail">
            <Entrada
              type="email"
              value={form.email}
              onChange={(e) => campo('email', e.target.value)}
              inputMode="email" autoComplete="email"
              placeholder="contato@seusalao.com.br"
              prefixo={<Mail className="h-4 w-4" />}
            />
          </Campo>

          <Campo rotulo="Endereço">
            <Entrada
              value={form.endereco}
              onChange={(e) => campo('endereco', e.target.value)}
              placeholder="Rua, número, bairro"
              autoComplete="street-address"
              prefixo={<MapPin className="h-4 w-4" />}
              maxLength={200}
            />
          </Campo>

          <Campo rotulo="Instagram">
            <Entrada
              value={form.instagram}
              onChange={(e) => campo('instagram', e.target.value)}
              placeholder="@seusalao"
              prefixo={<AtSign className="h-4 w-4" />}
              maxLength={31}
            />
          </Campo>

          <Campo rotulo="Facebook">
            <Entrada
              value={form.facebook}
              onChange={(e) => campo('facebook', e.target.value)}
              placeholder="seusalao"
              prefixo={<Facebook className="h-4 w-4" />}
              maxLength={80}
            />
          </Campo>

          <Campo rotulo="Site" className="sm:col-span-2">
            <Entrada
              type="url"
              value={form.site}
              onChange={(e) => campo('site', e.target.value)}
              placeholder="https://seusalao.com.br"
              prefixo={<Globe2 className="h-4 w-4" />}
              maxLength={200}
            />
          </Campo>
        </div>
      </Carta>

      {/* ---- Dados de contrato ---- */}
      <Carta>
        <CartaTitulo
          titulo="Dados para nota fiscal"
          descricao="Opcional. Nunca aparecem para a cliente."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Razão social">
            <Entrada
              value={form.razaoSocial}
              onChange={(e) => campo('razaoSocial', e.target.value)}
              maxLength={150}
            />
          </Campo>

          <Campo rotulo="CNPJ">
            <Entrada
              value={mascaraCnpj(form.cnpj)}
              onChange={(e) => campo('cnpj', e.target.value)}
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
            />
          </Campo>
        </div>
      </Carta>

      <BarraDeSalvamento
        visivel={guarda.sujo}
        estado={salvar.salvando ? 'salvando' : recemSalvo ? 'salvo' : 'parado'}
        aoSalvar={() => void enviar()}
        aoDescartar={() => {
          setForm(doStudio(studio))
          // Descartar também desfaz a pré-visualização da cor.
          aplicar(studio.tema)
          aplicarCorPropria(studio.corPrincipal)
        }}
      />

      <ConfirmarSaida
        aberto={guarda.perguntando}
        aoContinuar={guarda.cancelarSaida}
        aoSair={guarda.confirmarSaida}
      />

      {/* Conflito: alguém alterou o salão enquanto esta tela editava. */}
      <Confirmar
        aberto={versaoExterna !== null}
        aoFechar={() => setVersaoExterna(null)}
        aoConfirmar={() => {
          if (versaoExterna) setForm(doStudio(versaoExterna))
          setVersaoExterna(null)
        }}
        titulo="Os dados do salão mudaram em outro lugar"
        descricao="Alguém alterou estas informações enquanto você editava. Você pode continuar com o que digitou, ou carregar a versão nova — o que você digitou será perdido."
        rotuloConfirmar="Carregar versão nova"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

interface Formulario {
  nome: string
  nomeFantasia: string
  razaoSocial: string
  cnpj: string
  descricao: string
  slogan: string
  identificador: string
  telefone: string
  whatsapp: string
  email: string
  endereco: string
  instagram: string
  facebook: string
  site: string
  corPrincipal: string
  corSecundaria: string
  tema: string
}

/**
 * Do registro para o formulário.
 *
 * Nulo vira string vazia. Um `value={null}` faz o React trocar o campo
 * de controlado para não controlado no meio da digitação — e o aviso
 * disso no console é o menor dos problemas: o campo passa a ignorar o
 * estado e a guardar o próprio valor, então "descartar" para de
 * funcionar.
 */
const doStudio = (s: Studio): Formulario => ({
  nome: s.nome ?? '',
  nomeFantasia: s.nomeFantasia ?? '',
  razaoSocial: s.razaoSocial ?? '',
  cnpj: s.cnpj ?? '',
  descricao: s.descricao ?? '',
  slogan: s.slogan ?? '',
  identificador: s.identificador ?? '',
  telefone: s.telefone ?? '',
  whatsapp: s.whatsapp ?? '',
  email: s.email ?? '',
  endereco: s.endereco ?? '',
  instagram: s.instagram ?? '',
  facebook: s.facebook ?? '',
  site: s.site ?? '',
  corPrincipal: s.corPrincipal ?? '',
  corSecundaria: s.corSecundaria ?? '',
  tema: s.tema ?? 'quartzo-ouro',
})
