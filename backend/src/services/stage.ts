interface StageMatch {
  id: string; roundNumber: number; position: number; matchType: string; isReplay: boolean;
  status: string; durationSeconds: number; contestantA: { name: string } | null; contestantB: { name: string } | null;
}

// Same ordering as start_next_stage_match in PostgreSQL. Byes never use the stage.
export function buildStageSchedule<T extends StageMatch>(matches: T[]) {
  const ordered = matches.filter(match => match.matchType !== 'bye' && match.status !== 'cancelled')
    .sort((a, b) => Number(a.isReplay) - Number(b.isReplay) || a.roundNumber - b.roundNumber
      || Number(b.matchType === 'third_place') - Number(a.matchType === 'third_place') || a.position - b.position || a.id.localeCompare(b.id));
  const current = ordered.find(match => ['live', 'paused'].includes(match.status)) ?? null;
  const pending = ordered.filter(match => match.status === 'scheduled');
  const next = pending[0] ?? null;
  const finalRound = Math.max(0, ...ordered.filter(match => match.matchType === 'knockout').map(match => match.roundNumber));
  const queue = ordered.map((match, index) => ({
    number: index + 1, matchId: match.id, status: match.status,
    label: match.isReplay ? 'Revancha · exhibición' : match.matchType === 'third_place' ? 'Tercer lugar'
      : match.matchType === 'exhibition' ? 'Batalla libre' : match.roundNumber === finalRound ? 'Gran final'
      : match.roundNumber === finalRound - 1 ? 'Semifinal' : match.roundNumber === finalRound - 2 ? 'Cuartos de final' : `Ronda ${match.roundNumber}`,
    contestantA: match.contestantA?.name ?? 'Por definir', contestantB: match.contestantB?.name ?? 'Por definir',
    ready: Boolean(match.contestantA && match.contestantB),
  }));
  return { current, next, stage: { queue, currentMatchId: current?.id ?? null, nextMatchId: next?.id ?? null,
    completed: ordered.filter(match => match.status === 'finished').length, total: ordered.length,
    pendingVoteSeconds: pending.reduce((seconds, match) => seconds + match.durationSeconds, 0),
  } };
}
