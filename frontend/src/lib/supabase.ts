import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) throw new Error('Falta configurar Supabase en el frontend.')

export const supabase = createClient(url, key)

export async function ensureVoterSession(captchaToken?: string) {
  const current = await supabase.auth.getSession()
  if (current.data.session) {
    await supabase.realtime.setAuth(current.data.session.access_token)
    return current.data.session
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: captchaToken ? { captchaToken } : undefined,
  })
  if (error || !data.session) throw new Error(error?.message || 'No fue posible iniciar la sesión de votación.')
  await supabase.realtime.setAuth(data.session.access_token)
  return data.session
}

export async function refreshVoterSession() {
  const { data, error } = await supabase.auth.refreshSession()
  if (error || !data.session) throw new Error(error?.message || 'No fue posible renovar la sesión de votación.')
  await supabase.realtime.setAuth(data.session.access_token)
  return data.session
}
