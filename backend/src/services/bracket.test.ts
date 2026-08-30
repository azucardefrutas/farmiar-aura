import { describe, expect, it } from 'vitest'
import { buildBracketSlots, nextPowerOfTwo, seedOrder } from './bracket.js'

describe('bracket seeding', () => {
  it('uses the standard balanced order for an eight-slot bracket', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it('creates two separated byes for six entrants', () => {
    const entrants = ['a', 'b', 'c', 'd', 'e', 'f']
    const slots = buildBracketSlots(entrants, () => 0)

    expect(slots).toHaveLength(8)
    expect(slots.filter(Boolean)).toHaveLength(6)
    expect(slots.filter((slot) => slot === null)).toHaveLength(2)
    for (let index = 0; index < slots.length; index += 2) {
      expect(slots[index] !== null || slots[index + 1] !== null).toBe(true)
    }
  })

  it('selects the next supported power of two', () => {
    expect(nextPowerOfTwo(4)).toBe(4)
    expect(nextPowerOfTwo(6)).toBe(8)
    expect(nextPowerOfTwo(17)).toBe(32)
  })

  it('rejects unsafe bracket sizes', () => {
    expect(() => buildBracketSlots(['a', 'b', 'c'])).toThrow(/4 participantes/)
    expect(() => buildBracketSlots(Array.from({ length: 33 }, (_, index) => `${index}`))).toThrow(/32 participantes/)
  })
})
