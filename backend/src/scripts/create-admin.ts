import bcrypt from 'bcryptjs'
import { getConfig } from '../config.js'
import { createSupabaseAdmin } from '../lib/supabase.js'

const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim()
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
if (!username || !/^[a-zA-Z0-9._-]{3,40}$/.test(username)) throw new Error('BOOTSTRAP_ADMIN_USERNAME no es válido.')
if (!password || password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD debe tener al menos 12 caracteres.')

const supabase = createSupabaseAdmin(getConfig())
const hash = await bcrypt.hash(password, 12)
const { error } = await supabase.from('administrators').upsert(
  { usuario: username, contrasenia_hash: hash, rol: 'admin', activo: true },
  { onConflict: 'usuario' },
)
if (error) throw error
console.log(`Administrador "${username}" creado o actualizado. Elimina las variables BOOTSTRAP_ADMIN_* del entorno.`)
