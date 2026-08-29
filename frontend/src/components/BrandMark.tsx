import { Sparkles } from 'lucide-react'

export function BrandMark() {
  return (
    <div className="flex items-center gap-3" aria-label="Farmear Aura">
      <span className="brand-emblem grid size-10 place-items-center">
        <Sparkles size={20} aria-hidden="true" />
      </span>
      <div>
        <p className="font-display text-lg font-extrabold leading-none tracking-[-.02em] text-primary">Farmear Aura</p>
        <p className="mt-1 text-[.62rem] font-extrabold uppercase tracking-[.28em] text-fuchsia-700">Torneo en vivo</p>
      </div>
    </div>
  )
}
