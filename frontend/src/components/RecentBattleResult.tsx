import { Trophy } from 'lucide-react'
import type { Round } from '../types'

export function RecentBattleResult({ rounds }: { rounds: Round[] }) {
  const match = rounds.flatMap((round) => round.matches).filter((item) => item.status === 'finished' && item.matchType !== 'bye' && item.winnerId)
    .sort((a, b) => (b.startsAt ?? '').localeCompare(a.startsAt ?? ''))[0]
  if (!match) return null
  const winner = match.winnerId === match.contestantA?.id ? match.contestantA : match.contestantB
  return <div className="notice-success mb-5 flex flex-wrap items-center gap-2 text-sm" role="status"><Trophy size={17} /><strong>{winner?.name} ganó la última batalla</strong><span>· {match.votesA} – {match.votesB} votos{match.isReplay ? ' · Exhibición, sin cambio de lugares' : ''}</span></div>
}
