import { describe, expect, it } from 'vitest'
import { buildBracketSlots, nextPowerOfTwo, seedOrder } from './bracket.js'

describe('bracket seeding', () => {
  it.each(Array.from({ length: 31 }, (_, index) => index + 2))('keeps every entrant exactly once for %i people', (count) => {
    const entrants = Array.from({ length: count }, (_, i) => String(i))
    const slots = buildBracketSlots(entrants, () => 0)
    expect(new Set(slots.filter(Boolean))).toEqual(new Set(entrants))
    expect(slots.filter(Boolean)).toHaveLength(count)
    for (let i = 0; i < slots.length; i += 2) expect(slots[i] !== null || slots[i + 1] !== null).toBe(true)
  })
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
    expect(nextPowerOfTwo(2)).toBe(2)
    expect(nextPowerOfTwo(3)).toBe(4)
    expect(nextPowerOfTwo(4)).toBe(4)
    expect(nextPowerOfTwo(6)).toBe(8)
    expect(nextPowerOfTwo(17)).toBe(32)
  })

  it('rejects unsafe bracket sizes', () => {
    expect(() => buildBracketSlots(['a'])).toThrow(/2 participantes/)
    expect(() => buildBracketSlots(Array.from({ length: 33 }, (_, index) => `${index}`))).toThrow(/32 participantes/)
  })

  it('allows a direct final with two entrants', () => {
    expect(buildBracketSlots(['a', 'b'], () => 0)).toEqual(['b', 'a'])
  })

  it('creates one bye for three entrants', () => {
    const slots = buildBracketSlots(['a', 'b', 'c'], () => 0)
    expect(slots).toHaveLength(4)
    expect(slots.filter(Boolean)).toHaveLength(3)
    expect(slots.filter((slot) => slot === null)).toHaveLength(1)
  })
})
