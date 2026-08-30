import { Crown } from 'lucide-react'
import type { Round } from '../types'

export function TournamentBracket({ rounds, compact = false }: { rounds: Round[]; compact?: boolean }) {
  if (!rounds.length) return <p className="empty-row">La llave se publicará cuando el equipo cierre inscripciones.</p>
  return <div className="bracket-board" aria-label="Llave eliminatoria del torneo">{rounds.map((round) => <section key={round.id} className="bracket-round"><div className="bracket-round-title"><span>R{round.number}</span><h3>{round.name}</h3></div><div className="bracket-round-matches">{round.matches.map((match) => <article key={match.id} className={`bracket-node ${match.status === 'live' ? 'is-live' : ''} ${match.matchType === 'third_place' ? 'is-third' : ''}`}><p className="bracket-node-label">{match.matchType === 'third_place' ? 'Tercer lugar' : match.matchType === 'bye' ? 'Pase directo' : `Batalla ${match.position}`}</p>{[match.contestantA, match.contestantB].map((contestant, index) => <div key={`${match.id}-${index}`} className={`bracket-person ${contestant?.id === match.winnerId ? 'is-winner' : ''}`}>{contestant?.id === match.winnerId && <Crown size={14} />}<span>{contestant?.name ?? (match.matchType === 'bye' ? 'Descanso' : 'Por definir')}</span>{!compact && <strong>{index === 0 ? match.votesA : match.votesB}</strong>}</div>)}</article>)}</div></section>)}</div>
}
