import { describe, expect, it } from 'vitest'
import { bracketSchema, registrationSchema, voteSchema } from './schemas.js'

describe('request schemas', () => {
  it('rejects extra vote fields and malformed identifiers', () => {
    expect(() => voteSchema.parse({ matchId: 'x', contestantId: 'y', points: 999999 })).toThrow()
  })

  it('normalizes optional registration fields', () => {
    const parsed = registrationSchema.parse({
      nombre: 'Tony', apellidos: 'Hernández', carrera: 'Software', grupo: '8A', alias: '', instagram: '@tony.h',
    })
    expect(parsed.alias).toBeNull()
    expect(parsed.instagram).toBe('@tony.h')
  })

  it('rejects repeated contestants in a bracket', () => {
    const id = '7d98c0d2-655d-47ca-b499-4292ea6bf1a8'
    expect(() => bracketSchema.parse({ contestantIds: [id, id] })).toThrow()
  })
})
