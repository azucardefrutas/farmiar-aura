import { describe, expect, it } from 'vitest'
import { remainingSeconds } from './Countdown'

describe('remainingSeconds', () => {
  const now = new Date('2026-08-28T18:00:00.000Z').getTime()

  it('derives the live clock from the shared end time', () => {
    expect(remainingSeconds('2026-08-28T18:02:00.000Z', null, 'live', now)).toBe(120)
  })

  it('uses the frozen database value while paused', () => {
    expect(remainingSeconds('2026-08-28T18:02:00.000Z', 47, 'paused', now)).toBe(47)
  })

  it('never exposes negative time after a battle finishes', () => {
    expect(remainingSeconds('2026-08-28T17:59:59.000Z', null, 'live', now)).toBe(0)
    expect(remainingSeconds(null, null, 'finished', now)).toBe(0)
  })
})
