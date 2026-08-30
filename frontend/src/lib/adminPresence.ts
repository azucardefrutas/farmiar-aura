import { ensureVoterSession, supabase } from './supabase'

export interface OnlineAdministrator {
  username: string
  role: 'admin' | 'collaborator'
  onlineAt: string
}

function isOnlineAdministrator(value: unknown): value is OnlineAdministrator {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.username === 'string'
    && (candidate.role === 'admin' || candidate.role === 'collaborator')
    && typeof candidate.onlineAt === 'string'
}

export async function subscribeToAdminPresence(
  tournamentId: string,
  administrator: { username: string; role: 'admin' | 'collaborator' },
  allowedUsernames: ReadonlySet<string>,
  onChange: (online: OnlineAdministrator[]) => void,
) {
  await ensureVoterSession()
  const channel = supabase.channel(`admin:${tournamentId}:presence`, {
    config: { private: true, presence: { key: administrator.username } },
  })

  const publishState = () => {
    const unique = new Map<string, OnlineAdministrator>()
    for (const presences of Object.values(channel.presenceState())) {
      for (const presence of presences) {
        if (isOnlineAdministrator(presence) && allowedUsernames.has(presence.username)) {
          unique.set(presence.username, presence)
        }
      }
    }
    onChange([...unique.values()].sort((left, right) => left.username.localeCompare(right.username, 'es')))
  }

  channel.on('presence', { event: 'sync' }, publishState)
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ ...administrator, onlineAt: new Date().toISOString() })
    }
  })

  return () => {
    void channel.untrack()
    void supabase.removeChannel(channel)
  }
}
