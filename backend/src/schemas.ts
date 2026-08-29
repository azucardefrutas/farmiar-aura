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

export const matchActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('finish'), tieWinnerId: uuidSchema.nullish() }),
])
