import type { SupabaseAdmin } from '../lib/supabase.js'

const fields = 'id,nombre,status,format,is_current,match_duration_seconds,aura_per_vote,max_participants,auto_close_when_full,creado_en'
export async function getRegistrationCalls(supabase: SupabaseAdmin, voterId: string) {
  const [open, closed] = await Promise.all([
    supabase.from('tournaments').select(fields).eq('status', 'registration').order('creado_en', { ascending: false }).limit(100),
    supabase.from('tournaments').select(fields).in('status', ['ready', 'live', 'finished']).order('creado_en', { ascending: false }).limit(20),
  ])
  if (open.error) throw open.error
  if (closed.error) throw closed.error
  const rows = [...(open.data ?? []), ...(closed.data ?? [])]
  if (!rows.length) return { calls: [] }
  const ids = rows.map(row => row.id)
  const [registrations, contestants] = await Promise.all([
    supabase.from('participant_registrations').select('tournament_id,status')
      .eq('submitter_id', voterId).in('tournament_id', ids),
    supabase.from('contestants').select('tournament_id').eq('status', 'approved').in('tournament_id', ids),
  ])
  if (registrations.error) throw registrations.error
  if (contestants.error) throw contestants.error
  const registered = new Set((registrations.data ?? []).map(row => row.tournament_id))
  const registeredCounts = new Map<string, number>()
  for (const contestant of contestants.data ?? []) {
    registeredCounts.set(contestant.tournament_id, (registeredCounts.get(contestant.tournament_id) ?? 0) + 1)
  }
  return { calls: rows.map(row => ({ id: row.id, name: row.nombre, status: row.status, format: row.format,
    isCurrent: row.is_current, registered: registered.has(row.id),
    durationSeconds: row.match_duration_seconds, auraPerVote: row.aura_per_vote,
    maxParticipants: row.max_participants,
    autoCloseWhenFull: row.auto_close_when_full,
    registeredCount: registeredCounts.get(row.id) ?? 0,
  })) }
}
