import type { ErrorRequestHandler } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: error.issues[0]?.message || 'Los datos enviados no son válidos.' })
  }
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'La foto supera el máximo de 3 MB.' : 'No fue posible procesar la foto.' })
  }
  if (error instanceof Error && error.message === 'La foto debe ser JPG, PNG o WebP.') {
    return res.status(400).json({ error: error.message })
  }
  console.error('Unhandled API error', error)
  return res.status(500).json({ error: 'Ocurrió un error interno. Intenta de nuevo.' })
}
