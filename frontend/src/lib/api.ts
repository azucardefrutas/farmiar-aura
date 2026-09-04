import type { AdminDashboard, AdminSession, RegistrationCall, ServerMetrics, TournamentFormat, TournamentSnapshot } from '../types'
import { ensureVoterSession, refreshVoterSession } from './supabase'

const LEGACY_API_ORIGIN = 'https://farmear-aura-api.onrender.com'
const CURRENT_API_ORIGIN = 'https://farmiar-aura.onrender.com'

const API_URL = (import.meta.env.VITE_API_URL || `${CURRENT_API_ORIGIN}/api/v1`)
  .replace(LEGACY_API_ORIGIN, CURRENT_API_ORIGIN)
  .replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

const REQUEST_TIMEOUT_MS = 60_000

function errorMessage(status: number, serverMessage?: string) {
  if (status === 404 && serverMessage?.trim().toLowerCase() === 'ruta no encontrada.') {
    return 'Esta función todavía no está disponible en el servidor del torneo. Vuelve a intentarlo cuando termine la actualización.'
  }
  if (status === 429) return 'Hay demasiadas solicitudes en este momento. Espera unos segundos y vuelve a intentarlo.'
  if ([502, 503, 504].includes(status)) return 'El servidor del torneo está iniciando o temporalmente no disponible. Vuelve a intentarlo en un momento.'
  return serverMessage || 'No fue posible completar la solicitud.'
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const abortFromCaller = () => controller.abort()
  init?.signal?.addEventListener('abort', abortFromCaller, { once: true })
  try {
    const response = await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal, cache: 'no-store' })
    const payload = (await response.json().catch(() => ({}))) as { error?: string } & T
    if (!response.ok) throw new ApiError(errorMessage(response.status, payload.error), response.status)
    return payload
  } catch (caught) {
    if (caught instanceof ApiError) throw caught
    if (controller.signal.aborted && !init?.signal?.aborted) {
      throw new ApiError('El servidor tardó demasiado en responder. Vuelve a intentarlo en un momento.', 0)
    }
    throw new ApiError('No pudimos conectar con el servidor del torneo. Verifica tu conexión o vuelve a intentarlo en un momento.', 0)
  } finally {
    globalThis.clearTimeout(timeout)
    init?.signal?.removeEventListener('abort', abortFromCaller)
  }
}

async function voterRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let session = await ensureVoterSession()
  try {
    return await request<T>(path, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Authorization: `Bearer ${session.access_token}` } })
  } catch (caught) {
    if (!(caught instanceof ApiError) || caught.status !== 401) throw caught
    session = await refreshVoterSession()
    return request<T>(path, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Authorization: `Bearer ${session.access_token}` } })
  }
}

const adminHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

export const api = {
  async registrationCalls() {
    return voterRequest<{ calls: RegistrationCall[] }>('/tournaments')
  },
  openRegistrations(token: string, id: string) {
    return request(`/admin/tournaments/${id}/registrations/open`, { method: 'POST', headers: adminHeaders(token) })
  },
  startNextStage(token: string, id: string, matchId: string) {
    return request(`/admin/tournaments/${id}/stage/next`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ matchId }) })
  },
  async tournament() {
    return voterRequest<TournamentSnapshot>('/tournament')
  },
  async vote(matchId: string, contestantId: string) {
    return voterRequest<{ success: true; message: string }>('/votes', {
      method: 'POST', body: JSON.stringify({ matchId, contestantId }),
    })
  },
  async register(form: FormData) {
    return voterRequest<{ success: true; message: string }>('/registrations', {
      method: 'POST', body: form,
    })
  },
  login(username: string, password: string) {
    return request<AdminSession>('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  },
  dashboard(token: string, tournamentId?: string) {
    return request<AdminDashboard>(`/admin/dashboard${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`, { headers: adminHeaders(token) })
  },
  serverMetrics(token: string, signal?: AbortSignal) {
    return request<ServerMetrics>('/admin/server-metrics', { headers: adminHeaders(token), signal })
  },
  createCall(token: string, name: string, format: TournamentFormat, durationSeconds: number, auraPerVote: number, maxParticipants: number, autoCloseWhenFull: boolean) {
    return request<{ success: true; id: string }>('/admin/tournaments', { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ name, format, durationSeconds, auraPerVote, maxParticipants, autoCloseWhenFull }) })
  },
  publishCall(token: string, id: string) {
    return request(`/admin/tournaments/${id}/publish`, { method: 'POST', headers: adminHeaders(token) })
  },
  deleteCall(token: string, id: string) {
    return request<{ success: true; message: string }>(`/admin/tournaments/${id}`, { method: 'DELETE', headers: adminHeaders(token) })
  },
  finishCall(token: string, id: string) {
    return request(`/admin/tournaments/${id}/finish`, { method: 'POST', headers: adminHeaders(token) })
  },
  createFreeMatch(token: string, id: string, contestantAId: string, contestantBId: string, durationSeconds: number) {
    return request(`/admin/tournaments/${id}/matches`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ contestantAId, contestantBId, durationSeconds }) })
  },
  deleteMatch(token: string, id: string) {
    return request(`/admin/matches/${id}`, { method: 'DELETE', headers: adminHeaders(token) })
  },
  replayMatch(token: string, id: string) {
    return request(`/admin/matches/${id}/replay`, { method: 'POST', headers: adminHeaders(token) })
  },
  deleteRegistration(token: string, id: string) {
    return request(`/admin/registrations/${id}`, { method: 'DELETE', headers: adminHeaders(token) })
  },
  review(token: string, id: string, status: 'approved' | 'rejected') {
    return request(`/admin/registrations/${id}/review`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ status }) })
  },
  generateBracket(token: string, tournamentId: string, contestantIds: string[]) {
    return request(`/admin/tournaments/${tournamentId}/bracket`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ contestantIds }) })
  },
  closeRegistrations(token: string, tournamentId: string) {
    return request(`/admin/tournaments/${tournamentId}/registrations/close`, { method: 'POST', headers: adminHeaders(token) })
  },
  updateTournamentSettings(token: string, tournamentId: string, durationSeconds: number, auraPerVote: number, maxParticipants: number, autoCloseWhenFull: boolean) {
    return request<{ success: true; message: string }>(`/admin/tournaments/${tournamentId}/settings`, {
      method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify({ durationSeconds, auraPerVote, maxParticipants, autoCloseWhenFull }),
    })
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
