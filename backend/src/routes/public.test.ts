import express from 'express'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { createPublicRouter } from './public.js'
const servers: Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } })
async function app(status = 'registration') {
  const selectedId = '7d98c0d2-655d-47ca-b499-4292ea6bf1a8'
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: selectedId, status }, error: null }) }
  const rpc = vi.fn().mockResolvedValue({ data: {}, error: null })
  const supabase = { from: vi.fn().mockReturnValue(query), rpc, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: randomUUID() } }, error: null }) } }
  const server = express().use(express.json()).use(createPublicRouter(supabase as unknown as SupabaseAdmin)).listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>(resolve => server.on('listening', resolve))
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  const input = { tournamentId: selectedId, nombre: 'QA', apellidos: 'Persona', edad: 20, carrera: 'Software', grupo: '8A' }
  const submit = (authenticated = true) => fetch(url + '/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer test-token' } : {}) }, body: JSON.stringify(input) })
  return { selectedId, query, rpc, submit }
}
it('routes registration to the explicit selection, not the current stage', async () => {
  const { selectedId, query, rpc, submit } = await app()
  expect((await submit()).status).toBe(201)
  expect(query.eq).toHaveBeenCalledExactlyOnceWith('id', selectedId)
  expect(rpc).toHaveBeenCalledWith('submit_registration', expect.objectContaining({ p_tournament_id: selectedId }))
})
it('never falls back to another open call when the selected one closes', async () => {
  const { query, rpc, submit } = await app('live')
  expect((await submit()).status).toBe(409)
  expect(query.eq).not.toHaveBeenCalledWith('is_current', true)
  expect(rpc).not.toHaveBeenCalled()
})
it('rejects unauthenticated registration before reading the database', async () => {
  const { query, submit } = await app()
  expect((await submit(false)).status).toBe(401)
  expect(query.select).not.toHaveBeenCalled()
})
