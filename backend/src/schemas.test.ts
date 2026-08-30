import { describe, expect, it } from 'vitest'
import { bracketSchema, registrationSchema, tournamentSettingsSchema, voteSchema } from './schemas.js'

describe('request schemas', () => {
  it('rejects extra vote fields and malformed identifiers', () => {
    expect(() => voteSchema.parse({ matchId: 'x', contestantId: 'y', points: 999999 })).toThrow()
  })

  it('normalizes optional registration fields', () => {
    const parsed = registrationSchema.parse({
      nombre: 'Tony', apellidos: 'Hernández', edad: '20', carrera: 'Software', grupo: '8A', alias: '', instagram: '@tony.h',
    })
    expect(parsed.alias).toBeNull()
    expect(parsed.edad).toBe(20)
    expect(parsed.instagram).toBe('@tony.h')
  })

  it('requires a plausible participant age', () => {
    expect(() => registrationSchema.parse({
      nombre: 'Tony', apellidos: 'Hernández', edad: 12, carrera: 'Software', grupo: '8A',
    })).toThrow()
  })

  it('rejects repeated contestants in a bracket', () => {
    const id = '7d98c0d2-655d-47ca-b499-4292ea6bf1a8'
    expect(() => bracketSchema.parse({ contestantIds: [id, id] })).toThrow()
  })

  it('accepts a two-person final and validates tournament rules', () => {
    const first = '7d98c0d2-655d-47ca-b499-4292ea6bf1a8'
    const second = '9cb08c0c-65e3-47bc-a31b-6353959d14c4'
    expect(bracketSchema.parse({ contestantIds: [first, second] }).contestantIds).toHaveLength(2)
    expect(tournamentSettingsSchema.parse({ durationSeconds: 90, auraPerVote: 100 })).toEqual({ durationSeconds: 90, auraPerVote: 100 })
    expect(() => tournamentSettingsSchema.parse({ durationSeconds: 10, auraPerVote: 100 })).toThrow()
  })
})
