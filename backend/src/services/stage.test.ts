import { describe, expect, it } from 'vitest'
import { buildStageSchedule } from './stage.js'

const match = (id: string, roundNumber: number, position = 1, extra = {}) => ({
  id, roundNumber, position, matchType: 'knockout', isReplay: false, status: 'scheduled', durationSeconds: 90,
  contestantA: { name: 'A' }, contestantB: { name: 'B' }, ...extra,
})
describe('single stage agenda', () => {
  it('plays every round in order, puts bronze before final, and excludes byes', () => {
    const rows = [
      match('final', 4), match('bronze', 4, 2, { matchType: 'third_place' }),
      ...Array.from({ length: 8 }, (_, i) => match('first-' + i, 1, i + 1, i % 2 ? {} : { matchType: 'bye', status: 'finished' })),
      ...Array.from({ length: 4 }, (_, i) => match('quarter-' + i, 2, i + 1)),
      match('semi-1', 3), match('semi-2', 3, 2),
    ]
    const { stage, next } = buildStageSchedule(rows)
    expect(stage.total).toBe(12)
    expect(stage.queue.map(slot => slot.matchId)).toEqual(['first-1', 'first-3', 'first-5', 'first-7', 'quarter-0', 'quarter-1', 'quarter-2', 'quarter-3', 'semi-1', 'semi-2', 'bronze', 'final'])
    expect(next?.id).toBe('first-1')
    expect(stage.queue.at(-1)?.label).toBe('Gran final')
    expect(stage.completed).toBe(0)
    expect(stage.pendingVoteSeconds).toBe(1080)
    expect(rows[0].id).toBe('final') // no mutation of bracket presentation order
  })
  it('retains a paused current fight and does not skip an unresolved next slot', () => {
    const { stage, current, next } = buildStageSchedule([
      match('finished', 1, 1, { status: 'finished' }),
      match('now', 1, 2, { status: 'paused' }),
      match('missing', 2, 1, { contestantB: null }),
      match('ready-later', 2, 2),
    ])
    expect(current?.id).toBe('now')
    expect(next?.id).toBe('missing')
    expect(stage.queue.find(slot => slot.matchId === 'missing')?.ready).toBe(false)
    expect(stage.completed).toBe(1)
  })
  it('keeps optional replays out of the championship order and drops cancellations', () => {
    const { stage } = buildStageSchedule([
      match('replay', 1, 1, { matchType: 'exhibition', isReplay: true }),
      match('cancelled', 1, 2, { status: 'cancelled' }), match('final', 3),
    ])
    expect(stage.queue.map(slot => slot.matchId)).toEqual(['final', 'replay'])
    expect(stage.queue[1].label).toBe('Revancha · exhibición')
  })
})
