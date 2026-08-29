import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { AppConfig } from '../config.js'
import type { SupabaseAdmin } from '../lib/supabase.js'

function bearerToken(req: Request): string | null {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? []
  return scheme === 'Bearer' && token ? token : null
}

export function requireVoter(supabase: SupabaseAdmin) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req)
    if (!token) return res.status(401).json({ error: 'Se requiere una sesión de votante.' })

    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return res.status(401).json({ error: 'La sesión de votante no es válida.' })
    req.voter = { id: data.user.id }
    next()
  }
}

interface AdminClaims extends jwt.JwtPayload {
  sub: string
  username: string
  role: 'admin' | 'collaborator'
}

export function requireAdmin(config: AppConfig, requiredRole?: 'admin') {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req)
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' })
    try {
      const claims = jwt.verify(token, config.ADMIN_JWT_SECRET, {
        algorithms: ['HS256'], issuer: 'farmear-aura-api', audience: 'farmear-aura-admin',
      }) as AdminClaims
      if (!claims.sub || !claims.username || !['admin', 'collaborator'].includes(claims.role)) throw new Error('Claims inválidos')
      if (requiredRole && claims.role !== requiredRole) return res.status(403).json({ error: 'Esta acción requiere rol de administrador.' })
      req.administrator = { id: claims.sub, username: claims.username, role: claims.role }
      next()
    } catch {
      return res.status(401).json({ error: 'La sesión administrativa venció o no es válida.' })
    }
  }
}
