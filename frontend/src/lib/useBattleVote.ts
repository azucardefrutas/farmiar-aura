import { useState } from 'react'
import { api } from './api'
import type { TournamentSnapshot } from '../types'

export function useBattleVote(snapshot: TournamentSnapshot | null, reload: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null)
  const [omittedId, setOmittedId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const match = snapshot?.activeMatch
  const hasVoted = Boolean(match && snapshot?.viewerVote?.matchId === match.id)
  const omitted = Boolean(match && omittedId === match.id)
  const canVote = match?.status === 'live' && !hasVoted && !omitted && !busy

  async function vote(contestantId: string) {
    if (!match || !canVote) return
    setBusy(contestantId); setError(''); setMessage('')
    try {
      const result = await api.vote(match.id, contestantId)
      setMessage(result.message)
      await reload()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible registrar tu voto.') }
    finally { setBusy(null) }
  }

  function omit() {
    if (!match || busy || hasVoted) return
    setOmittedId(omitted ? null : match.id)
    setMessage(''); setError('')
  }
  return { busy, hasVoted, omitted, canVote, message, error, vote, omit }
}
