import { Check, Sparkles } from 'lucide-react'
import type { Contestant } from '../types'

interface Props {
  contestant: Contestant
  aura: number
  votes: number
  auraPerVote: number
  side: 'amber' | 'indigo'
  canVote: boolean
  selected: boolean
  busy: boolean
  onVote: () => void
  readOnly?: boolean
}

export function BattleContestant({ contestant, aura, votes, auraPerVote, side, canVote, selected, busy, onVote, readOnly }: Props) {
  const initials = contestant.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return (
    <article className={`battle-card battle-card-${side}`}>
      <div className="battle-portrait">
        {contestant.photoUrl ? (
          <img src={contestant.photoUrl} alt={`Foto de ${contestant.name}`} width="720" height="800" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="font-display text-5xl font-extrabold text-primary/85 sm:text-7xl">{initials}</span>
        )}
      </div>
      <div className="battle-copy relative z-10 p-5 sm:p-6">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-tertiary">{contestant.program}</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight text-primary sm:text-3xl">{contestant.name}</h2>
        <p className="mt-4 font-display text-2xl font-extrabold tabular-nums text-primary sm:text-3xl">{aura.toLocaleString('es-MX')} <span className="text-xs tracking-[.14em] text-tertiary">AURA</span></p>
        <p className="mt-1 text-sm text-secondary">{votes.toLocaleString('es-MX')} votos</p>
        {!readOnly && (
          <button type="button" onClick={onVote} disabled={!canVote || busy} aria-busy={busy} className="primary-action mt-4 w-full">
            {selected ? <Check size={19} /> : <Sparkles size={19} />}
            {busy ? 'Confirmando...' : selected ? 'Tu voto' : canVote ? `+${auraPerVote} Aura` : 'Votación cerrada'}
          </button>
        )}
      </div>
    </article>
  )
}
