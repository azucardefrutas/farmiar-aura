import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Radio, Trophy } from 'lucide-react'
import { api } from '../lib/api'
import { subscribeToTournament } from '../lib/realtime'
import type { TournamentSnapshot } from '../types'
import { BattleContestant } from '../components/BattleContestant'
import { BrandMark } from '../components/BrandMark'
import { Countdown } from '../components/Countdown'
import { ScoreRail } from '../components/ScoreRail'

export function LivePage() {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try { setSnapshot(await api.tournament()); setError('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible cargar la transmisión.') }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => snapshot ? subscribeToTournament(snapshot.tournament.id, snapshot.activeMatch?.id, () => void load()) : undefined, [snapshot?.tournament.id, snapshot?.activeMatch?.id, load])

  const match = snapshot?.activeMatch
  const auraPerVote = snapshot?.tournament.rules.auraPerVote ?? 100
  return (
    <main className="live-stage min-h-dvh text-primary">
      <header className="flex items-center justify-between gap-4 p-5 sm:p-8"><BrandMark /><div className="flex items-center gap-3"><span className={`status-pill status-${match?.status ?? 'scheduled'}`}><span />{match?.status === 'live' ? 'En vivo' : match?.status === 'paused' ? 'Pausada' : 'En espera'}</span><Link to="/" className="secondary-action">Volver</Link></div></header>
      {error && <p role="alert" className="mx-auto mt-6 max-w-2xl notice-error">{error}</p>}
      {match?.contestantA && match.contestantB ? (
        <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col justify-center px-5 pb-10 sm:px-8">
          <div className="mb-8 text-center"><p className="text-sm font-bold uppercase tracking-[.3em] text-fuchsia-700">Ronda {match.roundNumber} · Batalla {match.position}</p><div className="mt-4"><Countdown endsAt={match.endsAt} pausedSeconds={match.remainingSeconds} status={match.status} large onComplete={() => void load()} /></div></div>
          <ScoreRail votesA={match.votesA} votesB={match.votesB} />
          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <BattleContestant contestant={match.contestantA} aura={match.auraA} votes={match.votesA} auraPerVote={auraPerVote} side="amber" canVote={false} selected={false} busy={false} onVote={() => undefined} readOnly />
            <BattleContestant contestant={match.contestantB} aura={match.auraB} votes={match.votesB} auraPerVote={auraPerVote} side="indigo" canVote={false} selected={false} busy={false} onVote={() => undefined} readOnly />
          </div>
          <p className="mt-6 text-center text-sm font-bold uppercase tracking-[.2em] text-secondary"><Radio className="mr-2 inline" size={17} /> {match.totalVotes} votos confirmados en tiempo real</p>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center px-5 text-center"><div><Trophy size={56} className="mx-auto text-fuchsia-700" /><h1 className="mt-6 font-display text-5xl font-extrabold tracking-[-.04em]">Próxima batalla en preparación</h1><p className="mt-4 text-xl text-secondary">Esta pantalla cambiará automáticamente cuando inicie.</p></div></div>
      )}
    </main>
  )
}
