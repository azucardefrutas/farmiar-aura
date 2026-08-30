import { describe, expect, it } from 'vitest'
import { calculateStandings } from './standings.js'

const entrants = 'abcdefgh'.split('').map((id) => ({ id, name: id, program: 'Test', photoUrl: null, status: 'approved' }))
function match(a: number, b: number, roundNumber: number, matchType = 'knockout', isReplay = false) {
  return { contestantA: entrants[a]!, contestantB: entrants[b]!, winnerId: entrants[a]!.id, roundNumber, matchType, isReplay, status: 'finished', votesA: 8, votesB: 3, auraA: 800, auraB: 300 }
}
const knockout = { format: 'single_elimination', status: 'finished' }

describe('official standings', () => {
  it('defines first and second in a two-person final', () => {
    const result = calculateStandings(entrants.slice(0, 2), [match(0, 1, 1)], knockout)
    expect(result.placements.map((p) => [p.place, p.contestant.id])).toEqual([[1, 'a'], [2, 'b']])
  })
  it('defines third with three selected entrants even if more registrations exist', () => {
    const result = calculateStandings(entrants, [match(0, 1, 1), match(0, 2, 2)], knockout)
    expect(result.placements.map((p) => [p.place, p.contestant.id])).toEqual([[1, 'a'], [2, 'c'], [3, 'b']])
    expect(result.standings.find((s) => s.contestant.id === 'd')?.placement).toBeNull()
  })
  it('assigns podium, fourth and shared fifth for eight entrants', () => {
    const matches = [match(0, 1, 1), match(2, 3, 1), match(4, 5, 1), match(6, 7, 1), match(0, 2, 2), match(4, 6, 2), match(0, 4, 3), match(2, 6, 3, 'third_place')]
    const result = calculateStandings(entrants, matches, knockout)
    expect(result.standings.map((s) => [s.contestant.id, s.placement])).toEqual([['a', 1], ['e', 2], ['c', 3], ['g', 4], ['b', 5], ['d', 5], ['f', 5], ['h', 5]])
  })
  it('does not let exhibition replays change official votes, wins or podium', () => {
    const original = match(0, 1, 1)
    const replay = { ...match(1, 0, 1, 'exhibition', true), votesA: 1001, auraA: 100100 }
    expect(calculateStandings(entrants.slice(0, 2), [original, replay], knockout)).toEqual(calculateStandings(entrants.slice(0, 2), [original], knockout))
  })
  it('keeps pending places empty and shares tied free-battle rankings', () => {
    const matches = [match(0, 1, 1, 'exhibition'), match(1, 0, 1, 'exhibition')]
    const pending = calculateStandings(entrants.slice(0, 2), matches, { format: 'free_battles', status: 'ready' })
    expect(pending.placements).toEqual([])
    expect(pending.standings.every((s) => s.placement === null)).toBe(true)
    const final = calculateStandings(entrants.slice(0, 2), matches, { format: 'free_battles', status: 'finished' })
    expect(final.placements.map((p) => p.place)).toEqual([1, 1])
  })
})
