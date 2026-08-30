import type { ReactNode } from 'react'
import { Crown, Trophy } from 'lucide-react'
import type { AuraMatch, Round } from '../types'

interface Props {
  rounds: Round[]
  compact?: boolean
  renderActions?: (match: AuraMatch) => ReactNode
}

function MatchNode({ match, compact, renderActions }: { match: AuraMatch; compact?: boolean; renderActions?: Props['renderActions'] }) {
  return <article className={`bracket-node ${match.status === 'live' ? 'is-live' : ''} ${match.matchType === 'third_place' ? 'is-third' : ''}`}>
    <p className="bracket-node-label flex justify-between gap-2"><span>{match.isReplay ? 'Revancha · exhibición' : match.matchType === 'third_place' ? 'Tercer lugar' : match.matchType === 'bye' ? 'Pase directo' : `Batalla ${match.position}`}</span><span>{match.status === 'live' ? 'EN VIVO' : match.status === 'finished' ? 'FINALIZADA' : match.status === 'paused' ? 'PAUSA' : 'PENDIENTE'}</span></p>
    {[match.contestantA, match.contestantB].map((contestant, index) => <div key={`${match.id}-${index}`} className={`bracket-person ${contestant?.id === match.winnerId ? 'is-winner' : ''}`}>
      {contestant?.photoUrl && <img src={contestant.photoUrl} alt="" loading="lazy" width="24" height="24" className="size-6 shrink-0 rounded-md object-cover" />}
      {contestant?.id === match.winnerId && <Crown size={14} className="shrink-0" />}
      <span title={contestant?.name}>{contestant?.name ?? (match.matchType === 'bye' ? 'Descanso' : 'Por definir')}</span>
      {!compact && <strong>{index === 0 ? match.votesA : match.votesB}</strong>}
    </div>)}
    {renderActions?.(match)}
  </article>
}

export function TournamentBracket({ rounds: allRounds, compact = false, renderActions }: Props) {
  const exhibitions = allRounds.flatMap((round) => round.matches).filter((match) => match.matchType === 'exhibition')
  const rounds = allRounds.map((round) => ({ ...round, matches: round.matches.filter((match) => match.matchType !== 'exhibition') })).filter((round) => round.matches.length > 0)
  const exhibitionGrid = exhibitions.length > 0 && <section className="mt-5"><h3 className="mb-3 font-bold">Batallas libres y revanchas</h3><div className="exhibition-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{exhibitions.map((match) => <MatchNode key={match.id} match={match} compact={compact} renderActions={renderActions} />)}</div></section>
  if (!rounds.length && exhibitions.length) return exhibitionGrid
  if (!rounds.length) return <div className="empty-row flex flex-col items-center gap-3"><Trophy size={28} /><p>La alineación aparecerá al cerrar inscripciones. Todos tendrán un cruce o un pase directo.</p></div>
  const finalRound = rounds[rounds.length - 1]
  const branches = rounds.slice(0, -1)
  const height = Math.max(430, Math.ceil((rounds[0]?.matches.length ?? 1) / 2) * 130)
  const branch = (side: 'left' | 'right') => (side === 'left' ? branches : [...branches].reverse()).map((round) => {
    const halfway = Math.ceil(round.matches.length / 2)
    const matches = side === 'left' ? round.matches.slice(0, halfway) : round.matches.slice(halfway)
    return <section key={`${side}-${round.id}`} className={`fifa-column fifa-${side}`}>
      <h3 className="mb-4 text-center text-[.65rem] font-extrabold uppercase tracking-[.12em] text-tertiary">{round.name}</h3>
      <div className="relative flex flex-1 flex-col justify-around gap-5">
        <svg className={`pointer-events-none absolute top-0 h-full w-7 overflow-visible text-fuchsia-400/60 ${side === 'left' ? 'left-full' : 'right-full'}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {matches.map((match, index) => { const y = (index + .5) / matches.length * 100; const target = matches.length === 1 ? 50 : (Math.floor(index / 2) * 2 + 1) / matches.length * 100; return <path key={match.id} d={`M ${side === 'left' ? 0 : 100} ${y} H 50 V ${target} H ${side === 'left' ? 100 : 0}`} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /> })}
        </svg>
        {matches.map((match) => <MatchNode key={match.id} match={match} compact={compact} renderActions={renderActions} />)}
      </div>
    </section>
  })
  return <div>
    <p className="mb-3 text-xs text-muted">Cruces de eliminación directa · desliza horizontalmente para ver toda la llave.</p>
    <div className="fifa-scroll" tabIndex={0} aria-label="Alineación eliminatoria, final al centro">
      <div className="fifa-board" style={{ minHeight: height }}>
        {branch('left')}
        <section className="fifa-final grid w-56 shrink-0 grid-rows-[1fr_auto_1fr] gap-4 px-2 pt-10">
          <div className="self-end text-center"><img src="/tournament-mascot.png" alt="Mascota de madera del torneo con su trofeo" width="128" height="128" loading="lazy" className="mx-auto size-32 object-contain" /><p className="mt-2 text-xs font-extrabold uppercase tracking-[.2em] text-fuchsia-700">La gran final</p></div>
          <div>{finalRound?.matches.filter((match) => match.matchType !== 'third_place').map((match) => <MatchNode key={match.id} match={match} compact={compact} renderActions={renderActions} />)}</div>
          <div>{finalRound?.matches.filter((match) => match.matchType === 'third_place').map((match) => <MatchNode key={match.id} match={match} compact={compact} renderActions={renderActions} />)}</div>
        </section>
        {branch('right')}
      </div>
    </div>
    {exhibitionGrid}
  </div>
}
