import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function subscribeToTournament(tournamentId: string, matchId: string | undefined, onChange: () => void | Promise<void>) {
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
  channels.push(
    supabase
      .channel(`tournament:${tournamentId}:state`, { config: { private: true } })
      .on('broadcast', { event: '*' }, schedule)
      .subscribe(connected),
  )

  if (matchId) {
    channels.push(
      supabase
        .channel(`match:${matchId}:score`, { config: { private: true } })
        .on('broadcast', { event: 'score_changed' }, schedule)
        .subscribe(connected),
    )
  }

  return () => {
    disposed = true
    if (timer) clearTimeout(timer)
    for (const channel of channels) void supabase.removeChannel(channel)
  }
}
