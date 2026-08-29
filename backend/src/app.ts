import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import type { AppConfig } from './config.js'
import { createSupabaseAdmin } from './lib/supabase.js'
import { errorHandler } from './middleware/errors.js'
import { createAdminRouter } from './routes/admin.js'
import { createPublicRouter } from './routes/public.js'

export function createApp(config: AppConfig) {
  const app = express()
  const supabase = createSupabaseAdmin(config)
  const allowedOrigins = new Set(config.FRONTEND_URL.split(',').map((origin) => origin.trim()).filter(Boolean))

  app.set('trust proxy', config.TRUST_PROXY_HOPS)
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true)
      return callback(new Error('Origen no permitido'))
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }))
  app.use(express.json({ limit: '24kb', strict: true }))
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }))

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use('/api/v1', createPublicRouter(supabase))
  app.use('/api/v1/admin', createAdminRouter(supabase, config))
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }))
  app.use(errorHandler)
  return app
}
