import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import type { AppConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { requireAdmin } from '../middleware/auth.js'
import { bracketSchema, collaboratorSchema, loginSchema, matchActionSchema, reviewSchema, uuidSchema } from '../schemas.js'
import { getTournamentSnapshot } from '../services/tournament.js'

async function audit(supabase: SupabaseAdmin, adminId: string, action: string, entityType: string, entityId?: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from('audit_logs').insert({ administrator_id: adminId, action, entity_type: entityType, entity_id: entityId, metadata })
  if (error) console.error('Audit log failed', error.message)
}

export function createAdminRouter(supabase: SupabaseAdmin, config: AppConfig) {
  const router = Router()
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados intentos. Espera 15 minutos.' } })
  const authenticated = requireAdmin(config)
  const onlyAdmin = requireAdmin(config, 'admin')

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body)
      const { data: administrator } = await supabase.from('administrators').select('id,usuario,contrasenia_hash,rol,activo').eq('usuario', input.username).maybeSingle()
      const valid = administrator?.activo && await bcrypt.compare(input.password, administrator.contrasenia_hash)
      if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' })
      const token = jwt.sign({ username: administrator.usuario, role: administrator.rol }, config.ADMIN_JWT_SECRET, {
        algorithm: 'HS256', subject: administrator.id, issuer: 'farmear-aura-api', audience: 'farmear-aura-admin', expiresIn: '4h',
      })
      await audit(supabase, administrator.id, 'admin.login', 'administrator', administrator.id)
      return res.json({ token, user: { username: administrator.usuario, role: administrator.rol } })
    } catch (error) { next(error) }
  })

  router.get('/dashboard', authenticated, async (_req, res, next) => {
    try {
      const snapshot = await getTournamentSnapshot(supabase)
      const [registrations, logs] = await Promise.all([
        supabase.from('participant_registrations').select('id,nombre,apellidos,carrera,grupo,alias,instagram,foto_url,status,creado_en').eq('tournament_id', snapshot.tournament.id).order('creado_en', { ascending: false }),
        supabase.from('audit_logs').select('id,action,entity_type,entity_id,metadata,creado_en,administrator_id').order('creado_en', { ascending: false }).limit(30),
      ])
      if (registrations.error) throw registrations.error
      if (logs.error) throw logs.error
      return res.json({ ...snapshot, registrations: registrations.data, auditLogs: logs.data })
    } catch (error) { next(error) }
  })

  router.post('/registrations/:id/review', authenticated, async (req, res, next) => {
    try {
      const id = uuidSchema.parse(req.params.id)
      const input = reviewSchema.parse(req.body)
      const { data, error } = await supabase.rpc('review_registration', { p_registration_id: id, p_status: input.status, p_reviewer_id: req.administrator!.id })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, `registration.${input.status}`, 'registration', id)
      return res.json({ success: true, result: data })
    } catch (error) { next(error) }
  })

  router.post('/tournaments/:id/bracket', authenticated, async (req, res, next) => {
    try {
      const tournamentId = uuidSchema.parse(req.params.id)
      const input = bracketSchema.parse(req.body)
      const { data, error } = await supabase.rpc('generate_bracket', { p_tournament_id: tournamentId, p_contestant_ids: input.contestantIds })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'bracket.generated', 'tournament', tournamentId, { participants: input.contestantIds.length })
      return res.json({ success: true, result: data })
    } catch (error) { next(error) }
  })

  router.post('/matches/:id/action', authenticated, async (req, res, next) => {
    try {
      const matchId = uuidSchema.parse(req.params.id)
      const input = matchActionSchema.parse(req.body)
      const rpcName = input.action === 'start' ? 'start_match' : input.action === 'pause' ? 'pause_match' : input.action === 'resume' ? 'resume_match' : 'finish_match'
      const parameters = input.action === 'finish' ? { p_match_id: matchId, p_tie_winner_id: input.tieWinnerId ?? null } : { p_match_id: matchId }
      const { data, error } = await supabase.rpc(rpcName, parameters)
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, `match.${input.action}`, 'match', matchId)
      return res.json({ success: true, result: data })
    } catch (error) { next(error) }
  })

  router.post('/tournaments/:id/reset', onlyAdmin, async (req, res, next) => {
    try {
      const tournamentId = uuidSchema.parse(req.params.id)
      const { error } = await supabase.rpc('reset_tournament', { p_tournament_id: tournamentId })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'tournament.reset', 'tournament', tournamentId)
      return res.json({ success: true, message: 'El bracket y los votos se reiniciaron.' })
    } catch (error) { next(error) }
  })

  router.post('/collaborators', onlyAdmin, async (req, res, next) => {
    try {
      const input = collaboratorSchema.parse(req.body)
      const passwordHash = await bcrypt.hash(input.password, 12)
      const { data, error } = await supabase.from('administrators').insert({ usuario: input.username, contrasenia_hash: passwordHash, rol: 'collaborator' }).select('id').single()
      if (error?.code === '23505') return res.status(409).json({ error: 'Ese usuario ya existe.' })
      if (error) throw error
      await audit(supabase, req.administrator!.id, 'collaborator.created', 'administrator', data.id)
      return res.status(201).json({ success: true, message: 'Colaborador agregado.' })
    } catch (error) { next(error) }
  })

  return router
}
