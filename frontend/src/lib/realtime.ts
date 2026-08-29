import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function subscribeToTournament(tournamentId: string, matchId: string | undefined, onChange: () => void) {
  const channels: RealtimeChannel[] = []
  channels.push(
    supabase
      .channel(`tournament:${tournamentId}:state`, { config: { private: true } })
      .on('broadcast', { event: '*' }, onChange)
      .subscribe(),
  )

  if (matchId) {
    channels.push(
      supabase
        .channel(`match:${matchId}:score`, { config: { private: true } })
        .on('broadcast', { event: 'score_changed' }, onChange)
        .subscribe(),
    )
  }

  return () => {
    for (const channel of channels) void supabase.removeChannel(channel)
  }
}
