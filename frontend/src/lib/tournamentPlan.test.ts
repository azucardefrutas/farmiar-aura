import { describe, expect, it } from 'vitest'
import { suggestedMatchDuration, tournamentPlan } from './tournamentPlan'

describe('real tournament planning', () => {
  it('counts only played matches, not byes, for odd and even entrants', () => {
    expect(tournamentPlan(5, 90)).toMatchObject({ slots: 8, byes: 3, matches: 5, rounds: 3 })
    expect(tournamentPlan(6, 90)).toMatchObject({ slots: 8, byes: 2, matches: 6 })
    expect(tournamentPlan(8, 90)).toMatchObject({ byes: 0, matches: 8, estimatedSeconds: 860 })
  })
  it('handles a direct final and a three-person bracket', () => {
    expect(tournamentPlan(2, 90).matches).toBe(1)
    expect(tournamentPlan(3, 90)).toMatchObject({ matches: 2, byes: 1 })
  })
  it('suggests short rounds without claiming an unreachable target', () => {
    expect(suggestedMatchDuration(8, 15)).toBe(95)
    expect(suggestedMatchDuration(2, 20)).toBe(180)
    expect(tournamentPlan(1, 90).estimatedSeconds).toBe(0)
  })
})
