import 'dotenv/config'
import { z } from 'zod'

const configSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(1),
  SUPABASE_URL: z.url().refine((value) => value.startsWith('https://'), 'Supabase debe usar HTTPS'),
  SUPABASE_SECRET_KEY: z.string().min(20),
  ADMIN_JWT_SECRET: z.string().min(32),
})

export type AppConfig = z.infer<typeof configSchema>

export function getConfig(): AppConfig {
  const result = configSchema.safeParse(process.env)
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Faltan variables de entorno válidas: ${fields}`)
  }
  return result.data
}
