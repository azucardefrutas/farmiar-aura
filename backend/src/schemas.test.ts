import { describe, expect, it } from 'vitest'
import { bracketSchema, registrationSchema, voteSchema } from './schemas.js'

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
})
