import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { LayoutAcesso } from '@/layouts'
import { Retrato } from '@/components/ui'
import { CarregandoTela } from '@/components/feedback'
import { useSessao, useAviso } from '@/contexts'
import { useProfissionais } from '@/hooks'
import { PAPEL } from '@/constants'
import { mensagemDeErro } from '@/utils/erros'
import { EntrarComSenha } from './EntrarComSenha'

/**
 * A porta de entrada do painel.
 *
 * Duas telas, escolhidas pela mesma pergunta que decide onde os dados
 * moram:
 *
 * **Com banco** — e-mail e senha. A senha protege de fato: quem não tem
 * token não lê tabela alguma no Postgres.
 *
 * **Sem banco** — escolha de perfil, que identifica quem está usando
 * sem fingir que autentica. Guardar um hash no navegador daria só a
 * sensação de segurança, e o sistema nunca chamou aquilo de senha.
 */
export default function Entrar() {
  const { entrar, carregando, exigeSenha } = useSessao()
  const { dados: profissionais, carregando: carregandoPerfis } = useProfissionais()
  const aviso = useAviso()
  const [entrando, setEntrando] = useState<string | null>(null)

  if (carregando) return <CarregandoTela mensagem="Abrindo o studio" />

  if (exigeSenha) {
    return (
      <LayoutAcesso titulo="Entrar no studio" subtitulo="Use seu e-mail e senha.">
        <EntrarComSenha />
      </LayoutAcesso>
    )
  }

  const escolher = async (id: string) => {
    setEntrando(id)
    try {
      await entrar(id)
    } catch (falha) {
      aviso.erro('Não foi possível entrar', mensagemDeErro(falha))
      setEntrando(null)
    }
  }

  return (
    <LayoutAcesso
      titulo="Quem está no comando?"
      subtitulo="Escolha seu perfil para abrir o studio."
    >
      {carregandoPerfis ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, indice) => (
            <div key={indice} className="h-[68px] animate-pulse rounded-2xl bg-quartzo-100" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {profissionais?.map((profissional, indice) => (
            <motion.li
              key={profissional.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: indice * 0.06, duration: 0.28 }}
            >
              <button
                onClick={() => void escolher(profissional.id)}
                disabled={!!entrando}
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-onix-100 bg-white p-3.5 text-left transition-all hover:border-marca hover:shadow-carta disabled:opacity-60"
              >
                <Retrato nome={profissional.nome} cor={profissional.cor} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-onix-800">
                    {profissional.nome}
                  </span>
                  <span className="block text-[12.5px] text-onix-400">
                    {PAPEL[profissional.papel]}
                  </span>
                </span>
                <ArrowRight
                  className={`h-4 w-4 shrink-0 transition-all ${
                    entrando === profissional.id
                      ? 'translate-x-1 text-marca'
                      : 'text-onix-200 group-hover:translate-x-1 group-hover:text-marca'
                  }`}
                />
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      <p className="mt-8 rounded-xl border border-onix-100 bg-quartzo-50 p-3.5 text-[12.5px] leading-relaxed text-onix-500">
        Os dados ficam guardados neste aparelho e continuam aqui na próxima vez
        que você abrir. Nada é enviado para fora.
      </p>
    </LayoutAcesso>
  )
}
