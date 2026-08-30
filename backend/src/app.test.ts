import { describe, expect, it } from 'vitest'
import { allowedFrontendOrigins } from './app.js'

describe('allowedFrontendOrigins', () => {
  it('always permits the official Farmear Aura deployments', () => {
    const origins = allowedFrontendOrigins('http://localhost:5173')

    expect(origins.has('https://farmiar-aura-frontend.vercel.app')).toBe(true)
    expect(origins.has('https://farmiar-aura-admin.vercel.app')).toBe(true)
    expect(origins.has('http://localhost:5173')).toBe(true)
  })

  it('does not permit unrelated projects', () => {
    const origins = allowedFrontendOrigins('http://localhost:5173')
    expect(origins.has('https://unrelated.example')).toBe(false)
  })
})
