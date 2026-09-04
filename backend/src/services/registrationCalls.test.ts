import { expect, it, vi } from 'vitest'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { getRegistrationCalls } from './registrationCalls.js'
it('exposes public call metadata and only the requesting voter registration flag', async () => {
  const result = (data: unknown[]) => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => void) => resolve({ data, error: null }) }
    return query
  }
  const a = result([{ id: 'open', nombre: 'Abierta', status: 'registration', format: 'single_elimination', is_current: false, match_duration_seconds: 90, aura_per_vote: 100, max_participants: 8, auto_close_when_full: true }])
  const b = result([{ id: 'closed', nombre: 'Cerrada', status: 'finished', max_participants: 8, auto_close_when_full: true }])
  const registrations = result([{ tournament_id: 'open', status: 'approved' }])
  const contestants = result([{ tournament_id: 'open' }, { tournament_id: 'open' }])
  const supabase = { from: vi.fn().mockReturnValueOnce(a).mockReturnValueOnce(b).mockReturnValueOnce(registrations).mockReturnValueOnce(contestants) }
  const { calls } = await getRegistrationCalls(supabase as unknown as SupabaseAdmin, 'viewer')
  expect(a.eq).toHaveBeenCalledWith('status', 'registration')
  expect(b.in).toHaveBeenCalledWith('status', ['ready', 'live', 'finished'])
  expect(registrations.eq).toHaveBeenCalledWith('submitter_id', 'viewer')
  expect(calls[0].registered).toBe(true)
  expect(calls[0]).toMatchObject({ registeredCount: 2, maxParticipants: 8, autoCloseWhenFull: true })
  expect(calls[1].registered).toBe(false)
  expect(calls[0]).not.toHaveProperty('submitter_id')
})
