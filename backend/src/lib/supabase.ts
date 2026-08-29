import { createClient } from '@supabase/supabase-js'
import type { AppConfig } from '../config.js'

export function createSupabaseAdmin(config: AppConfig) {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>
