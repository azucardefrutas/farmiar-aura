interface Contestant { id: string; name: string; program: string; photoUrl: string | null; status: string }
interface MatchResult {
  matchType: string; isReplay: boolean; roundNumber: number; status: string; winnerId: string | null
  contestantA: Contestant | null; contestantB: Contestant | null
  votesA: number; votesB: number; auraA: number; auraB: number
}

export function calculateStandings(contestants: Contestant[], matches: MatchResult[], tournament: { format: string; status: string }) {
  const contestantMap = new Map(contestants.map((contestant) => [contestant.id, contestant]))
  const standingMap = new Map(contestants.map((contestant) => [contestant.id, {
    contestant,
    played: 0,
    wins: 0,
    votes: 0,
    aura: 0,
    placement: null as number | null,
  }]))
  for (const match of matches) {
    if (match.matchType === 'bye' || match.isReplay) continue
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

  const finalRoundNumber = Math.max(0, ...matches.filter((match) => match.matchType === 'knockout').map((match) => match.roundNumber))
  const finalMatch = matches.find((match) => match.roundNumber === finalRoundNumber && match.matchType === 'knockout')
  const thirdPlaceMatch = matches.find((match) => match.matchType === 'third_place')
  const placements: Array<{ place: number; contestant: Contestant }> = []
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
  const bracketEntrants = new Set(matches.filter((match) => match.matchType !== 'exhibition').flatMap((match) => [match.contestantA?.id, match.contestantB?.id]).filter(Boolean))
  if (!thirdPlaceMatch && bracketEntrants.size === 3 && finalMatch?.status === 'finished') {
    const semifinal = matches.find((match) =>
      match.roundNumber === finalRoundNumber - 1
      && match.matchType === 'knockout'
      && match.status === 'finished'
      && match.winnerId,
    )
    if (semifinal?.winnerId) {
      const third = semifinal.contestantA?.id === semifinal.winnerId ? semifinal.contestantB : semifinal.contestantA
      if (third) {
        placements.push({ place: 3, contestant: third })
        standingMap.get(third.id)!.placement = 3
      }
    }
  }
  if (finalMatch?.status === 'finished') {
    for (const match of matches) {
      if (match.matchType !== 'knockout' || match.status !== 'finished' || !match.winnerId || match.roundNumber >= finalRoundNumber - 1) continue
      const loser = match.contestantA?.id === match.winnerId ? match.contestantB : match.contestantA
      if (loser) standingMap.get(loser.id)!.placement = 2 ** (finalRoundNumber - match.roundNumber) + 1
    }
  }
  const standings = [...standingMap.values()].sort((left, right) =>
    (left.placement ?? 99) - (right.placement ?? 99) || right.wins - left.wins || right.votes - left.votes || left.contestant.name.localeCompare(right.contestant.name, 'es')
  )
  if (tournament.format === 'free_battles' && tournament.status === 'finished') {
    let rank = 0
    for (const [index, standing] of standings.entries()) {
      const previous = standings[index - 1]
      if (!previous || previous.wins !== standing.wins || previous.votes !== standing.votes) rank = index + 1
      standing.placement = rank
      if (rank <= 3) placements.push({ place: rank, contestant: standing.contestant })
    }
  }

  return { standings, placements }
}
