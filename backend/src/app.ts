import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import type { AppConfig } from './config.js'
import { createSupabaseAdmin } from './lib/supabase.js'
import { errorHandler } from './middleware/errors.js'
import { createAdminRouter } from './routes/admin.js'
import { createPublicRouter } from './routes/public.js'

export function allowedFrontendOrigins(configuredOrigins: string) {
  return new Set([
    ...configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean),
    'https://farmiar-aura-frontend.vercel.app',
    'https://farmiar-aura-admin.vercel.app',
  ])
}

export function createApp(config: AppConfig) {
  const app = express()
  const supabase = createSupabaseAdmin(config)
  const allowedOrigins = allowedFrontendOrigins(config.FRONTEND_URL)

  app.set('trust proxy', config.TRUST_PROXY_HOPS)
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true)
      return callback(new Error('Origen no permitido'))
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }))
  app.use(express.json({ limit: '24kb', strict: true }))
  // Coarse IP ceiling accommodates campus Wi-Fi; authenticated routes also limit each user.
  app.use(rateLimit({ windowMs: 60_000, limit: 6000, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiadas peticiones desde esta red. Espera un minuto.' } }))

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use('/api/v1', createPublicRouter(supabase))
  app.use('/api/v1/admin', createAdminRouter(supabase, config))
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }))
  app.use(errorHandler)
  return app
}
