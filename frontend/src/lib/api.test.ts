import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { ensureVoterSession, refreshVoterSession } from './supabase'

vi.mock('./supabase', () => ({
  ensureVoterSession: vi.fn(),
  refreshVoterSession: vi.fn(),
}))

const response = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

beforeEach(() => {
  vi.mocked(ensureVoterSession).mockResolvedValue({ access_token: 'initial-token' } as never)
  vi.mocked(refreshVoterSession).mockResolvedValue({ access_token: 'renewed-token' } as never)
})

afterEach(() => vi.restoreAllMocks())

describe('shared API errors', () => {
  it('replaces the technical route error with an actionable message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(404, { error: 'Ruta no encontrada.' }))

    await expect(api.registrationCalls()).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining('todavía no está disponible'),
    })
  })

  it('explains network failures consistently', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(api.tournament()).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('No pudimos conectar con el servidor del torneo'),
    })
  })

  it('renews an expired voter session once and repeats the request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(401, { error: 'Sesión expirada.' }))
      .mockResolvedValueOnce(response(200, { calls: [] }))

    await expect(api.registrationCalls()).resolves.toEqual({ calls: [] })
    expect(refreshVoterSession).toHaveBeenCalledOnce()
    expect(new Headers(fetch.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer renewed-token')
  })
})
