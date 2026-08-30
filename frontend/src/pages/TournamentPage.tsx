import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Shield, Trophy, UserPlus, Users } from 'lucide-react'
import { api } from '../lib/api'
import { subscribeToTournament } from '../lib/realtime'
import type { TournamentSnapshot } from '../types'
import { BattleContestant } from '../components/BattleContestant'
import { Countdown } from '../components/Countdown'
import { ScoreRail } from '../components/ScoreRail'
import { PublicNavigation } from '../components/PublicNavigation'
import { TournamentBracket } from '../components/TournamentBracket'
import { StandingsTable } from '../components/StandingsTable'

export function TournamentPage() {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyContestant, setBusyContestant] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setSnapshot(await api.tournament())
      setError('')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No fue posible cargar el torneo.'
      setError(message.includes('Anonymous sign-ins') ? 'Activa Anonymous Sign-Ins en Supabase Auth para abrir la votación.' : message)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!snapshot) return
    return subscribeToTournament(snapshot.tournament.id, snapshot.activeMatch?.id, () => void load())
  }, [snapshot?.tournament.id, snapshot?.activeMatch?.id, load])

  async function vote(contestantId: string) {
    if (!snapshot?.activeMatch) return
    setBusyContestant(contestantId)
    try {
      const result = await api.vote(snapshot.activeMatch.id, contestantId)
      setNotice(result.message)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible registrar tu voto.')
    } finally { setBusyContestant(null) }
  }

  const match = snapshot?.activeMatch
  const auraPerVote = snapshot?.tournament.rules.auraPerVote ?? 100
  const hasVoted = Boolean(match && snapshot?.viewerVote?.matchId === match.id)
  const isLive = match?.status === 'live'

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
            <h1 className="mt-4 max-w-3xl font-display text-3xl font-extrabold leading-[1.04] tracking-[-.04em] text-primary sm:text-5xl">{match ? 'La batalla del momento' : 'La arena está por abrir'}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-secondary">Un voto por batalla. Cada voto confirmado vale {auraPerVote} Aura y el ganador avanza automáticamente.</p>
          </div>
          {match && <div className="timer-panel"><span className="text-xs font-bold uppercase tracking-[.2em] text-tertiary">Tiempo restante</span><Countdown endsAt={match.endsAt} pausedSeconds={match.remainingSeconds} status={match.status} onComplete={() => void load()} /></div>}
        </section>

        <div aria-live="polite" className="mb-5 space-y-3">
          {notice && <p className="notice-success">{notice}</p>}
          {error && <p role="alert" className="notice-error">{error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
        </div>

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2" aria-label="Cargando batalla"><div className="battle-skeleton" /><div className="battle-skeleton" /></div>
        ) : match?.contestantA && match.contestantB ? (
          <section aria-label="Batalla activa">
            <div className="admin-section mb-6 mt-0 p-4 sm:p-5">
              <ScoreRail votesA={match.votesA} votesB={match.votesB} />
              <div className="mt-3 flex justify-between text-xs font-bold uppercase tracking-[.16em] text-tertiary"><span>{match.contestantA.name}</span><span>{match.totalVotes} votos</span><span>{match.contestantB.name}</span></div>
            </div>
            <div className="relative grid gap-5 md:grid-cols-2">
              <BattleContestant contestant={match.contestantA} aura={match.auraA} votes={match.votesA} auraPerVote={auraPerVote} side="amber" canVote={isLive && !hasVoted} selected={snapshot?.viewerVote?.contestantId === match.contestantA.id} busy={busyContestant === match.contestantA.id} onVote={() => void vote(match.contestantA!.id)} />
              <div className="versus-mark" aria-hidden="true">VS</div>
              <BattleContestant contestant={match.contestantB} aura={match.auraB} votes={match.votesB} auraPerVote={auraPerVote} side="indigo" canVote={isLive && !hasVoted} selected={snapshot?.viewerVote?.contestantId === match.contestantB.id} busy={busyContestant === match.contestantB.id} onVote={() => void vote(match.contestantB!.id)} />
            </div>
          </section>
        ) : (
          <section className="empty-arena">
            <Trophy size={42} className="text-fuchsia-700" />
            <h2 className="mt-5 font-display text-3xl font-extrabold text-primary">Esperando la primera batalla</h2>
            <p className="mt-3 max-w-xl text-secondary">Las solicitudes están abiertas. Cuando el administrador apruebe participantes y genere la llave, este espacio se actualizará en tiempo real.</p>
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
            <section id="llave" className="mt-10 scroll-mt-8"><div className="section-heading"><div><p className="eyebrow">Eliminación directa</p><h2 id="tournament-summary">Llave del torneo</h2></div></div><TournamentBracket rounds={snapshot.rounds} /></section>
            {snapshot.standings.length > 0 && <section id="posiciones" className="mt-10 scroll-mt-8"><div className="section-heading"><div><p className="eyebrow">Clasificación</p><h2>Tabla de posiciones</h2></div></div><StandingsTable standings={snapshot.standings} placements={snapshot.placements} /></section>}
          </section>
        )}
      </main>

      <footer className="public-content page-shell flex items-center justify-between border-t border-slate-300/60 py-6 text-xs text-muted"><span>Batallas de Aura</span><Link to="/admin" className="inline-flex min-h-11 items-center gap-2 px-2 hover:text-primary"><Shield size={15} /> Administración</Link></footer>
    </div>
  )
}
