import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Shield, Trophy, UserPlus, Users } from 'lucide-react'
import { api } from '../lib/api'
import { subscribeToTournament } from '../lib/realtime'
import type { TournamentSnapshot } from '../types'
import { BattleContestant } from '../components/BattleContestant'
import { StageAgenda } from '../components/StageAgenda'
import { Countdown } from '../components/Countdown'
import { RecentBattleResult } from '../components/RecentBattleResult'
import { ScoreRail } from '../components/ScoreRail'
import { PublicNavigation } from '../components/PublicNavigation'
import { TournamentBracket } from '../components/TournamentBracket'
import { StandingsTable } from '../components/StandingsTable'
import { SkipVote } from '../components/SkipVote'
import { useBattleVote } from '../lib/useBattleVote'

export function TournamentPage() {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSequence = useRef(0)
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    try {
      const next = await api.tournament()
      if (sequence !== loadSequence.current) return
      setSnapshot(next)
      setError('')
    } catch (caught) {
      if (sequence !== loadSequence.current) return
      const message = caught instanceof Error ? caught.message : 'No fue posible cargar el torneo.'
      setError(message.includes('Anonymous sign-ins') ? 'Activa Anonymous Sign-Ins en Supabase Auth para abrir la votación.' : message)
    } finally { if (sequence === loadSequence.current) setLoading(false) }
  }, [])

  useEffect(() => { void load(); return () => { loadSequence.current += 1 } }, [load])
  useEffect(() => {
    if (!snapshot) return
    return subscribeToTournament(snapshot.tournament.id, snapshot.activeMatch?.id, () => load())
  }, [snapshot?.tournament.id, snapshot?.activeMatch?.id, load])

  const match = snapshot?.activeMatch
  const voting = useBattleVote(snapshot, load)
  const auraPerVote = snapshot?.tournament.rules.auraPerVote ?? 100

  return (
    <div className="public-page min-h-dvh bg-arena text-primary">
      <a href="#main" className="skip-link">Saltar al torneo</a>
      <PublicNavigation />

      <main id="main" className="public-content page-shell py-7 sm:py-10">
        <section className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`status-pill status-${match?.status ?? snapshot?.tournament.status ?? 'draft'}`}><span />{match?.status === 'live' ? 'En vivo' : match?.status === 'paused' ? 'Pausada' : snapshot?.tournament.status === 'registration' ? 'Registro abierto' : 'Próximamente'}</span>
              {match && <span className="text-xs font-bold uppercase tracking-[.2em] text-tertiary">Ronda {match.roundNumber} · Batalla {match.position}</span>}
            </div>
            <h1 className="mt-4 max-w-3xl font-display text-3xl font-extrabold leading-[1.04] tracking-[-.04em] text-primary sm:text-5xl">{match ? match.status === 'scheduled' ? 'Siguiente batalla' : 'La batalla del momento' : snapshot?.tournament.status === 'finished' ? 'Torneo finalizado' : 'La arena está por abrir'}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-secondary">Un voto por batalla. Cada voto confirmado vale {auraPerVote} Aura. {snapshot?.tournament.format === 'free_battles' ? 'Las victorias suman a la clasificación.' : 'El ganador avanza automáticamente.'}</p>
          </div>
          {match && <div className="timer-panel"><span className="text-xs font-bold uppercase tracking-[.2em] text-tertiary">Tiempo restante</span><Countdown endsAt={match.endsAt} pausedSeconds={match.remainingSeconds} status={match.status} durationSeconds={match.durationSeconds} serverTime={snapshot?.serverTime} onComplete={() => void load()} /></div>}
        </section>

        <div aria-live="polite" className="mb-5 space-y-3">
          {voting.message && <p className="notice-success">{voting.message}</p>}
          {voting.error && <p role="alert" className="notice-error">{voting.error}</p>}
          {error && <p role="alert" className="notice-error">{error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
        </div>

        {snapshot && <StageAgenda stage={snapshot.stage} />}
        {snapshot && <RecentBattleResult rounds={snapshot.rounds} />}
        {loading ? (
          <div className="grid gap-5 md:grid-cols-2" aria-label="Cargando batalla"><div className="battle-skeleton" /><div className="battle-skeleton" /></div>
        ) : match?.contestantA && match.contestantB ? (
          <section aria-label="Batalla activa">
            <div className="admin-section mb-6 mt-0 p-4 sm:p-5">
              <ScoreRail votesA={match.votesA} votesB={match.votesB} />
              <div className="mt-3 flex justify-between text-xs font-bold uppercase tracking-[.16em] text-tertiary"><span>{match.contestantA.name}</span><span>{match.totalVotes} votos</span><span>{match.contestantB.name}</span></div>
            </div>
            <div className="relative grid gap-5 md:grid-cols-2">
              <BattleContestant contestant={match.contestantA} aura={match.auraA} votes={match.votesA} auraPerVote={auraPerVote} side="amber" canVote={voting.canVote} selected={snapshot?.viewerVote?.contestantId === match.contestantA.id} busy={voting.busy === match.contestantA.id} onVote={() => void voting.vote(match.contestantA!.id)} readOnly={voting.omitted} />
              <div className="versus-mark" aria-hidden="true">VS</div>
              <BattleContestant contestant={match.contestantB} aura={match.auraB} votes={match.votesB} auraPerVote={auraPerVote} side="indigo" canVote={voting.canVote} selected={snapshot?.viewerVote?.contestantId === match.contestantB.id} busy={voting.busy === match.contestantB.id} onVote={() => void voting.vote(match.contestantB!.id)} readOnly={voting.omitted} />
            </div>
            {match.status === 'live' && !voting.hasVoted && <SkipVote omitted={voting.omitted} busy={Boolean(voting.busy)} onClick={voting.omit} />}
          </section>
        ) : (
          <section className="empty-arena">
            <Trophy size={42} className="text-fuchsia-700" />
            <h2 className="mt-5 font-display text-3xl font-extrabold text-primary">{snapshot?.tournament.status === 'finished' ? 'Ya tenemos resultados' : 'Esperando la primera batalla'}</h2>
            <p className="mt-3 max-w-xl text-secondary">{snapshot?.tournament.status === 'finished' ? 'Consulta los lugares finales y el recorrido de cada participante más abajo.' : 'Consulta las convocatorias para inscribirte. Al cerrar el registro, el equipo generará la llave y dará inicio a cada turno.'}</p>
            {snapshot?.tournament.status === 'registration' && <Link className="primary-action mt-6" to="/participar"><UserPlus size={18} /> Quiero participar</Link>}
          </section>
        )}

        {snapshot && (
          <section className="mt-9 border-t border-slate-300/60 pt-7" aria-labelledby="tournament-summary">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="metric-line"><Users /><span><strong>{snapshot.summary.contestants}</strong> participantes</span></div>
              <div className="metric-line"><Shield /><span><strong>{snapshot.summary.votes}</strong> votos confirmados</span></div>
              <div className="metric-line"><Trophy /><span><strong>{snapshot.summary.totalAura.toLocaleString('es-MX')}</strong> Aura generada</span></div>
            </div>
            <section id="llave" className="mt-10 scroll-mt-8"><div className="section-heading"><div><p className="eyebrow">{snapshot.tournament.format === 'free_battles' ? 'Batallas libres' : 'Eliminación directa'}</p><h2 id="tournament-summary">Llave del torneo</h2></div></div><TournamentBracket rounds={snapshot.rounds} /></section>
            {snapshot.standings.length > 0 && <section id="posiciones" className="mt-10 scroll-mt-8"><div className="section-heading"><div><p className="eyebrow">Clasificación</p><h2>Tabla de posiciones</h2></div></div><StandingsTable standings={snapshot.standings} placements={snapshot.placements} /></section>}
          </section>
        )}
      </main>

      <footer className="public-content page-shell flex items-center justify-between border-t border-slate-300/60 py-6 text-xs text-muted"><span>Batallas de Aura</span><Link to="/admin" className="inline-flex min-h-11 items-center gap-2 px-2 hover:text-primary"><Shield size={15} /> Administración</Link></footer>
    </div>
  )
}
