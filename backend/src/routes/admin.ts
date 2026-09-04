import { Router } from 'express'
import { performance } from 'node:perf_hooks'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import type { AppConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'
import { requireAdmin } from '../middleware/auth.js'
import { bracketSchema, collaboratorSchema, freeMatchSchema, loginSchema, matchActionSchema, nextStageMatchSchema, reviewSchema, tournamentCallSchema, tournamentSettingsSchema, uuidSchema } from '../schemas.js'
import { getTournamentSnapshot } from '../services/tournament.js'
import { buildBracketSlots } from '../services/bracket.js'
import type { ServerMetricsCollector } from '../services/serverMetrics.js'

async function audit(supabase: SupabaseAdmin, adminId: string, action: string, entityType: string, entityId?: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from('audit_logs').insert({ administrator_id: adminId, action, entity_type: entityType, entity_id: entityId, metadata })
  if (error) console.error('Audit log failed', error.message)
}

export function createAdminRouter(supabase: SupabaseAdmin, config: AppConfig, serverMetrics: ServerMetricsCollector) {
  const router = Router()
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados intentos. Espera 15 minutos.' } })
  const actionLimiter = rateLimit({ windowMs: 60_000, limit: 45, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiadas acciones administrativas. Espera un minuto.' } })
  const metricsLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.administrator?.id ?? 'unknown-admin',
    message: { error: 'La telemetría se está consultando demasiado rápido. Espera unos segundos.' },
  })
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

  router.get('/dashboard', authenticated, async (req, res, next) => {
    try {
      const tournamentId = req.query.tournamentId ? uuidSchema.parse(req.query.tournamentId) : undefined
      const snapshot = await getTournamentSnapshot(supabase, undefined, tournamentId)
      const [registrations, logs, collaborators, calls] = await Promise.all([
        supabase.from('participant_registrations').select('id,nombre,apellidos,edad,carrera,grupo,alias,instagram,foto_url,status,creado_en').eq('tournament_id', snapshot.tournament.id).order('creado_en', { ascending: false }),
        supabase.from('audit_logs').select('id,action,entity_type,entity_id,metadata,creado_en,administrator_id').order('creado_en', { ascending: false }).limit(30),
        supabase.from('administrators').select('usuario,rol,activo,creado_en').eq('activo', true).order('creado_en'),
        supabase.from('tournaments').select('id,nombre,status,format,is_current,max_participants,auto_close_when_full,creado_en').order('creado_en', { ascending: false }).limit(50),
      ])
      if (registrations.error) throw registrations.error
      if (logs.error) throw logs.error
      if (collaborators.error) throw collaborators.error
      if (calls.error) throw calls.error
      const callIds = (calls.data ?? []).map((item) => item.id)
      const callContestants = callIds.length
        ? await supabase.from('contestants').select('tournament_id').eq('status', 'approved').in('tournament_id', callIds)
        : { data: [], error: null }
      if (callContestants.error) throw callContestants.error
      const callCounts = new Map<string, number>()
      for (const contestant of callContestants.data ?? []) {
        callCounts.set(contestant.tournament_id, (callCounts.get(contestant.tournament_id) ?? 0) + 1)
      }
      return res.json({
        ...snapshot,
        registrations: registrations.data,
        auditLogs: logs.data,
        calls: (calls.data ?? []).map((item) => ({
          id: item.id,
          name: item.nombre,
          status: item.status,
          format: item.format,
          isCurrent: item.is_current,
          maxParticipants: item.max_participants,
          autoCloseWhenFull: item.auto_close_when_full,
          registeredCount: callCounts.get(item.id) ?? 0,
        })),
        collaborators: (collaborators.data ?? []).map((item) => ({
          username: item.usuario,
          role: item.rol,
          active: item.activo,
          createdAt: item.creado_en,
        })),
      })
    } catch (error) { next(error) }
  })

  router.get('/server-metrics', authenticated, metricsLimiter, async (_req, res, next) => {
    try {
      const databaseStartedAt = performance.now()
      const databaseCheck = await supabase.from('tournaments').select('id').limit(1)
      const databaseLatencyMs = Math.round(performance.now() - databaseStartedAt)
      const metrics = await serverMetrics.snapshot()
      const database = {
        reachable: !databaseCheck.error,
        latencyMs: databaseLatencyMs,
      }
      const status = !database.reachable
        ? 'critical'
        : metrics.status === 'warning' || databaseLatencyMs >= 1_500
          ? 'warning'
          : 'healthy'

      res.setHeader('Cache-Control', 'no-store')
      return res.json({ ...metrics, status, database })
    } catch (error) { next(error) }
  })

  router.use(actionLimiter)

  router.post('/tournaments', authenticated, async (req, res, next) => {
    try {
      const input = tournamentCallSchema.parse(req.body)
      const { data, error } = await supabase.rpc('create_tournament_call_with_capacity', {
        p_name: input.name, p_format: input.format, p_duration: input.durationSeconds, p_aura: input.auraPerVote,
        p_max_participants: input.maxParticipants, p_auto_close_when_full: input.autoCloseWhenFull,
      })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'tournament.created', 'tournament', data.id, {
        format: input.format,
        maxParticipants: input.maxParticipants,
        autoCloseWhenFull: input.autoCloseWhenFull,
      })
      return res.status(201).json({ success: true, id: data.id })
    } catch (error) { next(error) }
  })

  router.post('/tournaments/:id/publish', authenticated, async (req, res, next) => {
    try {
      const id = uuidSchema.parse(req.params.id)
      const { error } = await supabase.rpc('publish_tournament_call', { p_tournament_id: id })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'tournament.published', 'tournament', id)
      return res.json({ success: true })
    } catch (error) { next(error) }
  })

  router.delete('/tournaments/:id', onlyAdmin, async (req, res, next) => {
    try {
      const tournamentId = uuidSchema.parse(req.params.id)
      const { data: registrations, error: registrationsError } = await supabase
        .from('participant_registrations')
        .select('id')
        .eq('tournament_id', tournamentId)
      if (registrationsError) throw registrationsError

      const { data, error } = await supabase.rpc('delete_tournament_call', { p_tournament_id: tournamentId })
      if (error) return res.status(409).json({ error: error.message })

      const photoPaths = (registrations ?? []).flatMap(({ id }) =>
        ['jpg', 'png', 'webp'].map((extension) => `${tournamentId}/${id}.${extension}`),
      )
      for (let offset = 0; offset < photoPaths.length; offset += 100) {
        const { error: photoError } = await supabase.storage.from('participant-photos').remove(photoPaths.slice(offset, offset + 100))
        if (photoError) console.error('Tournament photo cleanup failed', photoError.message)
      }

      await audit(supabase, req.administrator!.id, 'tournament.deleted', 'tournament', tournamentId, { name: data.name })
      return res.json({ success: true, message: 'Convocatoria eliminada.' })
    } catch (error) { next(error) }
  })

  router.post('/tournaments/:id/registrations/open', authenticated, async (req, res, next) => {
    try {
      const id = uuidSchema.parse(req.params.id)
      const { error } = await supabase.rpc('open_tournament_registrations', { p_tournament_id: id })
      if (error) return res.status(409).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'registrations.opened', 'tournament', id)
      return res.json({ success: true })
    } catch (error) { next(error) }
  })

  router.post('/tournaments/:id/stage/next', authenticated, async (req, res, next) => {
    try {
      const id = uuidSchema.parse(req.params.id)
      const input = nextStageMatchSchema.parse(req.body)
      const { data, error } = await supabase.rpc('start_next_stage_match', { p_tournament_id: id, p_expected_match_id: input.matchId })
      if (error) return res.status(409).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'stage.next.started', 'match', data.matchId)
      return res.json({ success: true, result: data })
    } catch (error) { next(error) }
  })

  router.post('/tournaments/:id/finish', authenticated, async (req, res, next) => {
    try {
      const id = uuidSchema.parse(req.params.id)
      const { error } = await supabase.rpc('finish_free_tournament', { p_tournament_id: id })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'tournament.finished', 'tournament', id)
      return res.json({ success: true })
    } catch (error) { next(error) }
  })

  router.post('/tournaments/:id/matches', authenticated, async (req, res, next) => {
    try {
      const id = uuidSchema.parse(req.params.id)
      const input = freeMatchSchema.parse(req.body)
      const { data, error } = await supabase.rpc('create_free_match', {
        p_tournament_id: id, p_contestant_a: input.contestantAId, p_contestant_b: input.contestantBId, p_duration: input.durationSeconds,
      })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'match.created', 'match', data.id)
      return res.status(201).json({ success: true, id: data.id })
    } catch (error) { next(error) }
  })

  router.delete('/matches/:id', authenticated, async (req, res, next) => {
    try {
      const id = uuidSchema.parse(req.params.id)
      const { error } = await supabase.rpc('delete_free_match', { p_match_id: id })
      if (error) return res.status(409).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'match.deleted', 'match', id)
      return res.json({ success: true })
    } catch (error) { next(error) }
  })

  router.post('/matches/:id/replay', authenticated, async (req, res, next) => {
    try {
      const id = uuidSchema.parse(req.params.id)
      const { data, error } = await supabase.rpc('replay_match', { p_match_id: id })
      if (error) return res.status(409).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'match.replay.created', 'match', data.id, { originalMatchId: id, exhibition: true })
      return res.status(201).json({ success: true, id: data.id })
    } catch (error) { next(error) }
  })

  router.delete('/registrations/:id', authenticated, async (req, res, next) => {
    try {
      const id = uuidSchema.parse(req.params.id)
      const { data, error } = await supabase.rpc('delete_participant_registration', { p_registration_id: id })
      if (error) return res.status(409).json({ error: error.message })
      const tournamentId = uuidSchema.parse(data.tournamentId)
      const { error: photoError } = await supabase.storage.from('participant-photos').remove(['jpg', 'png', 'webp'].map((extension) => `${tournamentId}/${id}.${extension}`))
      if (photoError) console.error('Participant photo cleanup failed', photoError.message)
      await audit(supabase, req.administrator!.id, 'registration.deleted', 'registration', id)
      return res.json({ success: true })
    } catch (error) { next(error) }
  })

  router.patch('/tournaments/:id/settings', authenticated, async (req, res, next) => {
    try {
      const tournamentId = uuidSchema.parse(req.params.id)
      const input = tournamentSettingsSchema.parse(req.body)
      const { data, error } = await supabase.rpc('update_tournament_settings_with_capacity', {
        p_tournament_id: tournamentId,
        p_duration_seconds: input.durationSeconds,
        p_aura_per_vote: input.auraPerVote,
        p_max_participants: input.maxParticipants,
        p_auto_close_when_full: input.autoCloseWhenFull,
      })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'tournament.settings.updated', 'tournament', tournamentId, input)
      return res.json({ success: true, settings: data, message: 'Reglas del torneo actualizadas.' })
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
      const slots = buildBracketSlots(input.contestantIds)
      const { data, error } = await supabase.rpc('generate_bracket', { p_tournament_id: tournamentId, p_contestant_ids: slots })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'bracket.generated', 'tournament', tournamentId, { participants: input.contestantIds.length })
      return res.json({ success: true, result: data })
    } catch (error) { next(error) }
  })

  router.post('/tournaments/:id/registrations/close', authenticated, async (req, res, next) => {
    try {
      const tournamentId = uuidSchema.parse(req.params.id)
      const { data: tournament, error: tournamentError } = await supabase.from('tournaments').select('format').eq('id', tournamentId).single()
      if (tournamentError) throw tournamentError
      if (tournament.format === 'free_battles') {
        const { error } = await supabase.from('tournaments').update({ status: 'ready', actualizado_en: new Date().toISOString() }).eq('id', tournamentId).eq('status', 'registration')
        if (error) throw error
        await audit(supabase, req.administrator!.id, 'registrations.closed', 'tournament', tournamentId)
        return res.json({ success: true, message: 'Inscripciones cerradas. Crea las batallas manualmente.' })
      }
      const { data: contestants, error: contestantsError } = await supabase
        .from('contestants')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('status', 'approved')
        .order('creado_en')
      if (contestantsError) throw contestantsError
      const contestantIds = (contestants ?? []).map((contestant) => contestant.id)
      const slots = buildBracketSlots(contestantIds)
      const { data, error } = await supabase.rpc('generate_bracket', { p_tournament_id: tournamentId, p_contestant_ids: slots })
      if (error) return res.status(400).json({ error: error.message })
      await audit(supabase, req.administrator!.id, 'registrations.closed', 'tournament', tournamentId, {
        participants: contestantIds.length,
        slots: slots.length,
        byes: slots.length - contestantIds.length,
      })
      return res.json({ success: true, result: data, message: 'Inscripciones cerradas y llave generada.' })
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
      const { data, error } = await supabase.from('administrators').insert({ usuario: input.username, contrasenia_hash: passwordHash, rol: 'admin' }).select('id').single()
      if (error?.code === '23505') return res.status(409).json({ error: 'Ese usuario ya existe.' })
      if (error) throw error
      await audit(supabase, req.administrator!.id, 'administrator.created', 'administrator', data.id)
      return res.status(201).json({ success: true, message: 'Administrador colaborativo agregado.' })
    } catch (error) { next(error) }
  })

  return router
}
