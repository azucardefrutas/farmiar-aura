import { calculateStandings } from './standings.js'
import { buildStageSchedule } from './stage.js'
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

export async function getTournamentSnapshot(supabase: SupabaseAdmin, voterId?: string, tournamentId?: string) {
  let tournamentQuery = supabase
    .from('tournaments')
    .select('id,nombre,slug,status,actualizado_en,match_duration_seconds,aura_per_vote,max_participants,auto_close_when_full,format,is_current')
  tournamentQuery = tournamentId ? tournamentQuery.eq('id', tournamentId) : tournamentQuery.eq('is_current', true)
  const { data: tournament, error: tournamentError } = await tournamentQuery.single()
  if (tournamentError) throw tournamentError
  const auraPerVote = tournament.aura_per_vote

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
  if (expiredMatches?.length) {
    const { data: latest, error } = await supabase.from('tournaments').select('status,actualizado_en').eq('id', tournament.id).single()
    if (error) throw error
    Object.assign(tournament, latest)
  }

  const [contestantsResult, roundsResult, matchesResult] = await Promise.all([
    supabase.from('contestants').select('id,nombre,carrera,foto_url,status,creado_en').eq('tournament_id', tournament.id).order('creado_en'),
    supabase.from('rounds').select('id,round_number,nombre').eq('tournament_id', tournament.id).order('round_number'),
    supabase.from('matches').select('id,round_id,round_number,bracket_position,contestant_a_id,contestant_b_id,status,starts_at,ends_at,duration_seconds,remaining_seconds,winner_id,final_votes_a,final_votes_b,match_type,is_replay,replay_of_id').eq('tournament_id', tournament.id).order('round_number').order('bracket_position'),
  ])
  if (contestantsResult.error) throw contestantsResult.error
  if (roundsResult.error) throw roundsResult.error
  if (matchesResult.error) throw matchesResult.error

  const contestants = (contestantsResult.data ?? []).map((row) => contestantView(row as Row))
  const contestantMap = new Map(contestants.map((contestant) => [contestant.id, contestant]))
  const votesResult = await supabase.rpc('tournament_vote_counts', { p_tournament_id: tournament.id })
  if (votesResult.error) throw votesResult.error

  const counts = new Map<string, Map<string, number>>()
  let viewerVote: { matchId: string; contestantId: string } | null = null
  for (const vote of (votesResult.data ?? []) as Array<{ match_id: string; contestant_id: string; vote_count: number }>) {
    const byContestant = counts.get(vote.match_id) ?? new Map<string, number>()
    byContestant.set(vote.contestant_id, Number(vote.vote_count))
    counts.set(vote.match_id, byContestant)
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
      isReplay: match.is_replay,
      replayOfId: match.replay_of_id,
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
      auraA: votesA * auraPerVote,
      auraB: votesB * auraPerVote,
    }
  })

  const { current, next, stage } = buildStageSchedule(matches)
  const activeMatch = current ?? (next?.contestantA && next.contestantB ? next : null)
  const totalVotes = [...counts.values()].reduce((sum, byContestant) => sum + [...byContestant.values()].reduce((inner, value) => inner + value, 0), 0)
  if (voterId && activeMatch) {
    const { data: vote, error } = await supabase.from('votes').select('match_id,contestant_id').eq('match_id', activeMatch.id).eq('voter_id', voterId).maybeSingle()
    if (error) throw error
    if (vote) viewerVote = { matchId: vote.match_id, contestantId: vote.contestant_id }
  }

  const { standings, placements } = calculateStandings(contestants, matches, tournament)

  return {
    serverTime: new Date().toISOString(),
    tournament: {
      id: tournament.id,
      name: tournament.nombre,
      slug: tournament.slug,
      status: tournament.status,
      updatedAt: tournament.actualizado_en,
      format: tournament.format,
      isCurrent: tournament.is_current,
      rules: {
        durationSeconds: tournament.match_duration_seconds,
        auraPerVote,
        maxParticipants: tournament.max_participants,
        autoCloseWhenFull: tournament.auto_close_when_full,
      },
    },
    contestants,
    rounds: (roundsResult.data ?? []).map((round) => ({
      id: round.id,
      number: round.round_number,
      name: round.nombre,
      matches: matches.filter((match) => match.roundId === round.id),
    })),
    activeMatch,
    stage,
    viewerVote,
    placements,
    standings,
    summary: { contestants: contestants.length, votes: totalVotes, totalAura: totalVotes * auraPerVote },
  }
}
