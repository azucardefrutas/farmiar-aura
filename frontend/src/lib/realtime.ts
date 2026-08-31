import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

function subscribeToUpdates(topics: Array<{ name: string; event: string }>, onChange: () => void | Promise<void>) {
  const channels: RealtimeChannel[] = []
  let disposed = false
  let pending = false
  let inFlight = false
  let timer: ReturnType<typeof setTimeout> | undefined
  // Batch confirmed events; this is request backpressure, not simulated activity.
  const schedule = () => {
    if (disposed) return
    pending = true
    if (timer || inFlight) return
    timer = setTimeout(async () => {
      timer = undefined; pending = false; inFlight = true
      try { await onChange() }
      finally { inFlight = false; if (pending && !disposed) schedule() }
    }, 1000)
  }
  const connected = (status: string) => { if (status === 'SUBSCRIBED') schedule() }
  for (const topic of topics) channels.push(supabase.channel(topic.name, { config: { private: true } }).on('broadcast', { event: topic.event }, schedule).subscribe(connected))
  const visible = () => { if (document.visibilityState === 'visible') schedule() }
  document.addEventListener('visibilitychange', visible)
  window.addEventListener('online', schedule)

  return () => {
    disposed = true
    if (timer) clearTimeout(timer)
    document.removeEventListener('visibilitychange', visible)
    window.removeEventListener('online', schedule)
    for (const channel of channels) void supabase.removeChannel(channel)
  }
}

const catalog = { name: 'tournament:catalog:state', event: 'calls_changed' }
export function subscribeToCalls(onChange: () => void | Promise<void>) {
  return subscribeToUpdates([catalog], onChange)
}
export function subscribeToTournament(tournamentId: string, matchId: string | undefined, onChange: () => void | Promise<void>) {
  return subscribeToUpdates([catalog, { name: `tournament:${tournamentId}:state`, event: '*' }, ...(matchId ? [{ name: `match:${matchId}:score`, event: 'score_changed' }] : [])], onChange)
}
