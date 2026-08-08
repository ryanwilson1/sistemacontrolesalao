import { Campo } from '@/components/ui'
import { Esqueleto } from '@/components/feedback'
import { cn } from '@/utils/cn'

/** Grade de horários livres. Só mostra o que realmente cabe na agenda. */
export function SeletorDeHorario({
  horarios, valor, aoEscolher, carregando, pronto,
}: {
  horarios: string[]
  valor: string
  aoEscolher: (horario: string) => void
  carregando: boolean
  /** Serviço e profissional já escolhidos? */
  pronto: boolean
}) {
  return (
    <Campo
      rotulo="Horário"
      obrigatorio
      dica={
        !pronto
          ? 'Escolha o serviço e a profissional para ver os horários livres.'
          : horarios.length > 0
            ? 'Só aparecem horários realmente livres.'
            : undefined
      }
    >
      {carregando ? (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {Array.from({ length: 12 }).map((_, indice) => (
            <Esqueleto key={indice} className="h-9" />
          ))}
        </div>
      ) : horarios.length === 0 ? (
        <p className="rounded-xl border border-dashed border-onix-200 bg-quartzo-50 px-4 py-6 text-center text-[13px] leading-relaxed text-onix-400">
          {!pronto
            ? 'Aguardando serviço e profissional'
            : 'Nenhum horário livre neste dia. Tente outra data.'}
        </p>
      ) : (
        <div className="scroll-fino grid max-h-[168px] grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6">
          {horarios.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => aoEscolher(item)}
              className={cn(
                'tabular h-9 rounded-lg border text-[13px] font-medium transition-colors',
                valor === item
                  ? 'border-transparent bg-onix-800 text-white'
                  : 'border-onix-200 bg-white text-onix-600 hover:border-marca hover:text-onix-900',
              )}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </Campo>
  )
}
