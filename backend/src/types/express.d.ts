declare global {
  namespace Express {
    interface Request {
      voter?: { id: string }
      administrator?: { id: string; username: string; role: 'admin' | 'collaborator' }
    }
  }
}

export {}
