import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { requireVoter } from '../middleware/auth.js'
import { registrationSchema, voteSchema } from '../schemas.js'
import { getTournamentSnapshot } from '../services/tournament.js'

const acceptedImages = new Set(['image/jpeg', 'image/png', 'image/webp'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!acceptedImages.has(file.mimetype)) {
      callback(new Error('La foto debe ser JPG, PNG o WebP.'))
      return
    }
    callback(null, true)
  },
})

const voteLimiter = rateLimit({
  keyGenerator: (req) => req.voter!.id,
  windowMs: 60_000,
  limit: 6,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de voto. Espera un minuto.' },
})

const registrationLimiter = rateLimit({
  keyGenerator: (req) => req.voter!.id,
  windowMs: 10 * 60_000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de registro. Intenta más tarde.' },
})

function extensionFor(mime: string) {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
}

function hasValidImageSignature(buffer: Buffer, mime: string) {
  if (mime === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (mime === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (mime === 'image/webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}

export function createPublicRouter(supabase: SupabaseAdmin) {
  const router = Router()
  const readLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => req.voter!.id, message: { error: 'Espera un momento antes de actualizar de nuevo.' } })

  router.get('/tournament', requireVoter(supabase), readLimiter, async (req, res, next) => {
    try {
      res.json(await getTournamentSnapshot(supabase, req.voter!.id))
    } catch (error) { next(error) }
  })

  router.post('/votes', requireVoter(supabase), voteLimiter, async (req, res, next) => {
    try {
      const input = voteSchema.parse(req.body)
      const { data, error } = await supabase.rpc('cast_vote', {
        p_match_id: input.matchId,
        p_contestant_id: input.contestantId,
        p_voter_id: req.voter!.id,
      })
      if (error?.code === '23505') return res.status(409).json({ error: 'Ya votaste en esta batalla.' })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(201).json({ success: true, score: data, message: 'Tu Aura quedó registrada.' })
    } catch (error) { next(error) }
  })

  router.post('/registrations', requireVoter(supabase), registrationLimiter, upload.single('foto'), async (req, res, next) => {
    try {
      const input = registrationSchema.parse(req.body)
      const { data: tournament, error: tournamentError } = await supabase.from('tournaments').select('id,status').eq('is_current', true).single()
      if (tournamentError) throw tournamentError
      if (tournament.status !== 'registration') return res.status(409).json({ error: 'El registro de participantes está cerrado.' })

      const registrationId = randomUUID()
      let photoPath: string | null = null
      let photoUrl: string | null = null
      if (req.file) {
        if (!hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
          return res.status(400).json({ error: 'El archivo no contiene una imagen JPG, PNG o WebP válida.' })
        }
        photoPath = `${tournament.id}/${registrationId}.${extensionFor(req.file.mimetype)}`
        const uploaded = await supabase.storage.from('participant-photos').upload(photoPath, req.file.buffer, {
          contentType: req.file.mimetype, cacheControl: '31536000', upsert: false,
        })
        if (uploaded.error) throw uploaded.error
        photoUrl = supabase.storage.from('participant-photos').getPublicUrl(photoPath).data.publicUrl
      }

      const { data, error } = await supabase.rpc('submit_registration', {
        p_id: registrationId,
        p_tournament_id: tournament.id,
        p_submitter_id: req.voter!.id,
        p_nombre: input.nombre,
        p_apellidos: input.apellidos,
        p_edad: input.edad,
        p_carrera: input.carrera,
        p_grupo: input.grupo,
        p_alias: input.alias,
        p_instagram: input.instagram,
        p_foto_url: photoUrl,
      })
      if (error) {
        if (photoPath) await supabase.storage.from('participant-photos').remove([photoPath])
        if (error.code === '23505') return res.status(409).json({ error: 'Ya enviaste una solicitud para este torneo.' })
        throw error
      }
      return res.status(201).json({ success: true, registrationId, result: data, message: 'Inscripción confirmada. Ya formas parte de Batallas de Aura.' })
    } catch (error) { next(error) }
  })

  return router
}
