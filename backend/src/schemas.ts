import { z } from 'zod'

export const uuidSchema = z.uuid()

const cleanText = (min: number, max: number) => z.string().trim().min(min).max(max)

export const voteSchema = z.object({
  matchId: uuidSchema,
  contestantId: uuidSchema,
}).strict()

export const registrationSchema = z.object({
  nombre: cleanText(2, 60),
  apellidos: cleanText(2, 80),
  edad: z.coerce.number().int().min(15).max(99),
  carrera: cleanText(2, 100),
  grupo: cleanText(1, 40),
  alias: z.string().trim().max(50).optional().transform((value) => value || null),
  instagram: z.string().trim().max(31).optional().transform((value) => value || null)
    .refine((value) => value === null || /^@?[A-Za-z0-9._]{1,30}$/.test(value), 'Instagram inválido'),
}).strict()

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(128),
}).strict()

export const collaboratorSchema = z.object({
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(12).max(128),
}).strict()

export const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
}).strict()

export const bracketSchema = z.object({
  contestantIds: z.array(uuidSchema).min(2).max(32)
    .refine((ids) => new Set(ids).size === ids.length, 'No se permiten participantes repetidos'),
}).strict()

export const tournamentSettingsSchema = z.object({
  durationSeconds: z.coerce.number().int().min(30).max(600),
  auraPerVote: z.coerce.number().int().min(10).max(1000),
}).strict()

export const tournamentCallSchema = tournamentSettingsSchema.extend({
  name: cleanText(3, 100),
  format: z.enum(['single_elimination', 'free_battles']),
}).strict()

export const freeMatchSchema = z.object({
  contestantAId: uuidSchema,
  contestantBId: uuidSchema,
  durationSeconds: z.coerce.number().int().min(30).max(600),
}).strict().refine((value) => value.contestantAId !== value.contestantBId, 'Selecciona dos participantes distintos')

export const matchActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('finish'), tieWinnerId: uuidSchema.nullish() }),
])
