import type { AdminDashboard, AdminSession, TournamentSnapshot } from '../types'
import { ensureVoterSession } from './supabase'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T
  if (!response.ok) throw new ApiError(payload.error || 'No fue posible completar la solicitud.', response.status)
  return payload
}

async function voterHeaders() {
  const session = await ensureVoterSession()
  return { Authorization: `Bearer ${session.access_token}` }
}

const adminHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

export const api = {
  async tournament() {
    return request<TournamentSnapshot>('/tournament', { headers: await voterHeaders() })
  },
  async vote(matchId: string, contestantId: string) {
    return request<{ success: true; message: string }>('/votes', {
      method: 'POST', headers: await voterHeaders(), body: JSON.stringify({ matchId, contestantId }),
    })
  },
  async register(form: FormData) {
    return request<{ success: true; message: string }>('/registrations', {
      method: 'POST', headers: await voterHeaders(), body: form,
    })
  },
  login(username: string, password: string) {
    return request<AdminSession>('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  },
  dashboard(token: string) {
    return request<AdminDashboard>('/admin/dashboard', { headers: adminHeaders(token) })
  },
  review(token: string, id: string, status: 'approved' | 'rejected') {
    return request(`/admin/registrations/${id}/review`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ status }) })
  },
  generateBracket(token: string, tournamentId: string, contestantIds: string[]) {
    return request(`/admin/tournaments/${tournamentId}/bracket`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ contestantIds }) })
  },
  matchAction(token: string, matchId: string, action: 'start' | 'pause' | 'resume' | 'finish', tieWinnerId?: string) {
    return request(`/admin/matches/${matchId}/action`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ action, tieWinnerId }) })
  },
  reset(token: string, tournamentId: string) {
    return request(`/admin/tournaments/${tournamentId}/reset`, { method: 'POST', headers: adminHeaders(token) })
  },
  addCollaborator(token: string, username: string, password: string) {
    return request('/admin/collaborators', { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ username, password }) })
  },
}
