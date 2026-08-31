import type { SupabaseAdmin } from '../lib/supabase.js'

const fields = 'id,nombre,status,format,is_current,match_duration_seconds,aura_per_vote,creado_en'
export async function getRegistrationCalls(supabase: SupabaseAdmin, voterId: string) {
  const [open, closed] = await Promise.all([
    supabase.from('tournaments').select(fields).eq('status', 'registration').order('creado_en', { ascending: false }).limit(100),
    supabase.from('tournaments').select(fields).in('status', ['ready', 'live', 'finished']).order('creado_en', { ascending: false }).limit(20),
  ])
  if (open.error) throw open.error
  if (closed.error) throw closed.error
  const rows = [...(open.data ?? []), ...(closed.data ?? [])]
  if (!rows.length) return { calls: [] }
  const registrations = await supabase.from('participant_registrations').select('tournament_id,status')
    .eq('submitter_id', voterId).in('tournament_id', rows.map(row => row.id))
  if (registrations.error) throw registrations.error
  const registered = new Set((registrations.data ?? []).map(row => row.tournament_id))
  return { calls: rows.map(row => ({ id: row.id, name: row.nombre, status: row.status, format: row.format,
    isCurrent: row.is_current, registered: registered.has(row.id),
    durationSeconds: row.match_duration_seconds, auraPerVote: row.aura_per_vote,
  })) }
}
