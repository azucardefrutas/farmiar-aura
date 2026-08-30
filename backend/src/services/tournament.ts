import type { SupabaseAdmin } from '../lib/supabase.js'

type Row = Record<string, unknown>

interface ContestantView {
  id: string
  name: string
  program: string
  photoUrl: string | null
  status: string
}

function contestantView(row: Row): ContestantView {
  return {
    id: String(row.id),
    name: String(row.nombre),
    program: String(row.carrera),
    photoUrl: row.foto_url ? String(row.foto_url) : null,
    status: String(row.status),
  }
}

export async function getTournamentSnapshot(supabase: SupabaseAdmin, voterId?: string) {
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id,nombre,slug,status,actualizado_en')
    .eq('slug', 'batallas-de-aura')
    .single()
  if (tournamentError) throw tournamentError

  const { data: expiredMatches, error: expiredError } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', tournament.id)
    .eq('status', 'live')
    .lte('ends_at', new Date().toISOString())
  if (expiredError) throw expiredError
  for (const expiredMatch of expiredMatches ?? []) {
    const { error } = await supabase.rpc('settle_expired_match', { p_match_id: expiredMatch.id })
    if (error) throw error
  }

  const [contestantsResult, roundsResult, matchesResult] = await Promise.all([
    supabase.from('contestants').select('id,nombre,carrera,foto_url,status,creado_en').eq('tournament_id', tournament.id).order('creado_en'),
    supabase.from('rounds').select('id,round_number,nombre').eq('tournament_id', tournament.id).order('round_number'),
    supabase.from('matches').select('id,round_id,round_number,bracket_position,contestant_a_id,contestant_b_id,status,starts_at,ends_at,duration_seconds,remaining_seconds,winner_id,final_votes_a,final_votes_b,match_type').eq('tournament_id', tournament.id).order('round_number').order('bracket_position'),
  ])
  if (contestantsResult.error) throw contestantsResult.error
  if (roundsResult.error) throw roundsResult.error
  if (matchesResult.error) throw matchesResult.error

  const contestants = (contestantsResult.data ?? []).map((row) => contestantView(row as Row))
  const contestantMap = new Map(contestants.map((contestant) => [contestant.id, contestant]))
  const matchIds = (matchesResult.data ?? []).map((match) => match.id)
  const votesResult = matchIds.length
    ? await supabase.from('votes').select('match_id,contestant_id,voter_id').in('match_id', matchIds)
    : { data: [], error: null }
  if (votesResult.error) throw votesResult.error

  const counts = new Map<string, Map<string, number>>()
  let viewerVote: { matchId: string; contestantId: string } | null = null
  for (const vote of votesResult.data ?? []) {
    const byContestant = counts.get(vote.match_id) ?? new Map<string, number>()
    byContestant.set(vote.contestant_id, (byContestant.get(vote.contestant_id) ?? 0) + 1)
    counts.set(vote.match_id, byContestant)
    if (voterId && vote.voter_id === voterId) viewerVote = { matchId: vote.match_id, contestantId: vote.contestant_id }
  }

  const matches = (matchesResult.data ?? []).map((match) => {
    const matchCounts = counts.get(match.id) ?? new Map<string, number>()
    const votesA = match.contestant_a_id ? matchCounts.get(match.contestant_a_id) ?? 0 : 0
    const votesB = match.contestant_b_id ? matchCounts.get(match.contestant_b_id) ?? 0 : 0
    return {
      id: match.id,
      roundId: match.round_id,
      roundNumber: match.round_number,
      position: match.bracket_position,
      matchType: match.match_type,
      contestantA: match.contestant_a_id ? contestantMap.get(match.contestant_a_id) ?? null : null,
      contestantB: match.contestant_b_id ? contestantMap.get(match.contestant_b_id) ?? null : null,
      status: match.status,
      startsAt: match.starts_at,
      endsAt: match.ends_at,
      durationSeconds: match.duration_seconds,
      remainingSeconds: match.remaining_seconds,
      winnerId: match.winner_id,
      votesA,
      votesB,
      totalVotes: votesA + votesB,
      auraA: votesA * 100,
      auraB: votesB * 100,
    }
  })

  const activeMatch = matches.find((match) => match.matchType !== 'bye' && (match.status === 'live' || match.status === 'paused'))
    ?? matches.find((match) => match.matchType !== 'bye' && match.status === 'scheduled' && match.contestantA && match.contestantB)
    ?? null
  const totalVotes = [...counts.values()].reduce((sum, byContestant) => sum + [...byContestant.values()].reduce((inner, value) => inner + value, 0), 0)

  const standingMap = new Map(contestants.map((contestant) => [contestant.id, {
    contestant,
    played: 0,
    wins: 0,
    votes: 0,
    aura: 0,
    placement: null as number | null,
  }]))
  for (const match of matches) {
    if (match.matchType === 'bye') continue
    if (match.contestantA) {
      const standing = standingMap.get(match.contestantA.id)!
      standing.votes += match.votesA
      standing.aura += match.auraA
      if (match.status === 'finished') standing.played += 1
    }
    if (match.contestantB) {
      const standing = standingMap.get(match.contestantB.id)!
      standing.votes += match.votesB
      standing.aura += match.auraB
      if (match.status === 'finished') standing.played += 1
    }
    if (match.status === 'finished' && match.winnerId) standingMap.get(match.winnerId)!.wins += 1
  }

  const finalRoundNumber = Math.max(0, ...matches.map((match) => match.roundNumber))
  const finalMatch = matches.find((match) => match.roundNumber === finalRoundNumber && match.matchType === 'knockout')
  const thirdPlaceMatch = matches.find((match) => match.matchType === 'third_place')
  const placements: Array<{ place: number; contestant: ContestantView }> = []
  if (finalMatch?.status === 'finished' && finalMatch.winnerId) {
    const champion = contestantMap.get(finalMatch.winnerId)
    const runnerUp = finalMatch.contestantA?.id === finalMatch.winnerId ? finalMatch.contestantB : finalMatch.contestantA
    if (champion) { placements.push({ place: 1, contestant: champion }); standingMap.get(champion.id)!.placement = 1 }
    if (runnerUp) { placements.push({ place: 2, contestant: runnerUp }); standingMap.get(runnerUp.id)!.placement = 2 }
  }
  if (thirdPlaceMatch?.status === 'finished' && thirdPlaceMatch.winnerId) {
    const third = contestantMap.get(thirdPlaceMatch.winnerId)
    const fourth = thirdPlaceMatch.contestantA?.id === thirdPlaceMatch.winnerId ? thirdPlaceMatch.contestantB : thirdPlaceMatch.contestantA
    if (third) { placements.push({ place: 3, contestant: third }); standingMap.get(third.id)!.placement = 3 }
    if (fourth) standingMap.get(fourth.id)!.placement = 4
  }
  const standings = [...standingMap.values()].sort((left, right) =>
    (left.placement ?? 99) - (right.placement ?? 99) || right.wins - left.wins || right.votes - left.votes || left.contestant.name.localeCompare(right.contestant.name, 'es')
  )

  return {
    tournament: { id: tournament.id, name: tournament.nombre, slug: tournament.slug, status: tournament.status, updatedAt: tournament.actualizado_en },
    contestants,
    rounds: (roundsResult.data ?? []).map((round) => ({
      id: round.id,
      number: round.round_number,
      name: round.nombre,
      matches: matches.filter((match) => match.roundId === round.id),
    })),
    activeMatch,
    viewerVote,
    placements,
    standings,
    summary: { contestants: contestants.length, votes: totalVotes, totalAura: totalVotes * 100 },
  }
}
