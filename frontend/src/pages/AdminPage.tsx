import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleStop, LogOut, Pause, Play, Plus, Radio, RefreshCw, RotateCcw, Shield, SkipForward, UserCheck, UserX, Users } from 'lucide-react'
import { api } from '../lib/api'
import { subscribeToTournament } from '../lib/realtime'
import { ensureVoterSession } from '../lib/supabase'
import type { AdminDashboard, AdminSession, AuraMatch } from '../types'
import { BrandMark } from '../components/BrandMark'
import { Countdown } from '../components/Countdown'

const SESSION_KEY = 'farmear-aura-admin-session'

function storedSession(): AdminSession | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as AdminSession | null }
  catch { return null }
}

export function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(storedSession)
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!session) return
    try { setDashboard(await api.dashboard(session.token)); setError('') }
    catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No fue posible cargar el panel.'
      setError(message)
      if (message.toLowerCase().includes('sesión')) logout()
    }
  }, [session])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!dashboard) return
    let cleanup: () => void = () => undefined
    void ensureVoterSession().then(() => { cleanup = subscribeToTournament(dashboard.tournament.id, dashboard.activeMatch?.id, () => void load()) }).catch(() => undefined)
    return () => cleanup()
  }, [dashboard?.tournament.id, dashboard?.activeMatch?.id, load])

  useEffect(() => {
    if (!dashboard || dashboard.rounds.length > 0 || selected.size > 0) return
    setSelected(new Set(dashboard.contestants.map((contestant) => contestant.id)))
  }, [dashboard, selected.size])

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setSession(null)
    setDashboard(null)
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('login'); setError('')
    const form = new FormData(event.currentTarget)
    try {
      const next = await api.login(String(form.get('username')), String(form.get('password')))
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); setSession(next)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible iniciar sesión.') }
    finally { setBusy('') }
  }

  async function perform(key: string, action: () => Promise<unknown>, message: string) {
    setBusy(key); setError('')
    try { await action(); setNotice(message); await load() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'La acción no pudo completarse.') }
    finally { setBusy('') }
  }

  const bracketCountValid = [2, 4, 8, 16, 32].includes(selected.size)
  const pending = dashboard?.registrations.filter((item) => item.status === 'pending') ?? []
  const matches = dashboard?.rounds.flatMap((round) => round.matches) ?? []

  if (!session) {
    return (
      <main className="grid min-h-dvh place-items-center bg-arena p-5 text-primary">
        <section className="admin-section mt-0 w-full max-w-md p-7 sm:p-9">
          <BrandMark />
          <p className="mt-10 text-xs font-bold uppercase tracking-[.24em] text-fuchsia-700">Control de torneo</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-.03em] text-primary">Acceso administrativo</h1>
          <p className="mt-3 text-secondary">Inicia sesión con las credenciales creadas en el servidor.</p>
          <form onSubmit={login} className="mt-7 space-y-5">
            <label className="block"><span className="field-label">Usuario</span><input className="field-input" name="username" autoComplete="username" required minLength={3} /></label>
            <label className="block"><span className="field-label">Contraseña</span><input className="field-input" name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
            {error && <p role="alert" className="notice-error">{error}</p>}
            <button className="primary-action w-full" disabled={busy === 'login'} aria-busy={busy === 'login'}><Shield size={18} />{busy === 'login' ? 'Verificando...' : 'Entrar al control'}</button>
          </form>
          <Link to="/" className="mt-6 inline-flex min-h-11 items-center text-sm text-secondary hover:text-primary">Volver al torneo</Link>
        </section>
      </main>
    )
  }

  return (
    <div className="min-h-dvh bg-arena text-primary">
      <header className="event-header"><div className="page-shell flex min-h-20 items-center justify-between gap-4 py-4"><BrandMark /><div className="flex items-center gap-2"><span className="hidden text-sm text-secondary sm:inline">{session.user.username} · {session.user.role}</span><Link to="/live" className="secondary-action"><Radio size={17} /> Live</Link><button type="button" onClick={logout} className="icon-action" aria-label="Cerrar sesión"><LogOut size={18} /></button></div></div></header>
      <main className="page-shell py-8 sm:py-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.24em] text-fuchsia-700">Centro de control</p><h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-.04em] text-primary">Batallas de Aura</h1><p className="mt-3 text-secondary">Todo cambio confirmado se publica a votantes y pantalla en vivo por WebSocket.</p></div>
          <button type="button" className="secondary-action" onClick={() => void load()}><RefreshCw size={17} /> Actualizar</button>
        </div>
        <div aria-live="polite" className="mt-5 space-y-3">{notice && <p className="notice-success">{notice}</p>}{error && <p role="alert" className="notice-error">{error}</p>}</div>

        {!dashboard ? <div className="mt-8 h-44 animate-pulse rounded-2xl bg-panel" /> : (
          <>
            <section className="admin-section mt-8 grid gap-px overflow-hidden p-0 sm:grid-cols-3">
              <AdminMetric label="Participantes" value={dashboard.summary.contestants} icon={<Users />} />
              <AdminMetric label="Votos confirmados" value={dashboard.summary.votes} icon={<Check />} />
              <AdminMetric label="Aura total" value={dashboard.summary.totalAura.toLocaleString('es-MX')} icon={<Radio />} />
            </section>

            {dashboard.activeMatch && <ActiveMatchControl match={dashboard.activeMatch} busy={busy} onAction={(action, tieWinnerId) => perform(`match-${action}`, () => api.matchAction(session.token, dashboard.activeMatch!.id, action, tieWinnerId), `Batalla ${action === 'start' ? 'iniciada' : action === 'pause' ? 'pausada' : action === 'resume' ? 'reanudada' : 'finalizada'}.`)} />}

            <section className="admin-section">
              <div className="section-heading"><div><p className="eyebrow">Personas</p><h2>Solicitudes pendientes</h2></div><span className="count-badge">{pending.length}</span></div>
              {pending.length === 0 ? <p className="empty-row">No hay solicitudes pendientes.</p> : <div className="grid gap-4 lg:grid-cols-2">{pending.map((item) => (
                <article key={item.id} className="registration-card">
                  {item.foto_url ? <img src={item.foto_url} alt="" width="80" height="80" className="size-20 rounded-xl object-cover" /> : <div className="grid size-20 place-items-center rounded-xl bg-fuchsia-100 font-display text-xl font-extrabold text-fuchsia-900">{item.nombre[0]}{item.apellidos[0]}</div>}
                  <div className="min-w-0 flex-1"><h3 className="font-bold text-primary">{item.alias || `${item.nombre} ${item.apellidos}`}</h3><p className="mt-1 text-sm text-secondary">{item.carrera} · {item.grupo}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="compact-action compact-approve" disabled={Boolean(busy)} onClick={() => void perform(`approve-${item.id}`, () => api.review(session.token, item.id, 'approved'), 'Participante aprobado.')}><UserCheck size={16} /> Aprobar</button><button type="button" className="compact-action compact-reject" disabled={Boolean(busy)} onClick={() => void perform(`reject-${item.id}`, () => api.review(session.token, item.id, 'rejected'), 'Solicitud rechazada.')}><UserX size={16} /> Rechazar</button></div></div>
                </article>
              ))}</div>}
            </section>

            <section className="admin-section">
              <div className="section-heading"><div><p className="eyebrow">Torneo</p><h2>Participantes y bracket</h2></div><button type="button" className="primary-action" disabled={!bracketCountValid || Boolean(busy)} onClick={() => void perform('bracket', () => api.generateBracket(session.token, dashboard.tournament.id, [...selected]), 'Llave generada.')}>Generar llave ({selected.size})</button></div>
              <p className="mb-5 text-sm text-secondary">Selecciona exactamente 2, 4, 8, 16 o 32 participantes. Generar de nuevo reemplaza la llave y sus votos.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dashboard.contestants.map((contestant) => <label key={contestant.id} className="select-contestant"><input type="checkbox" checked={selected.has(contestant.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(contestant.id) ? next.delete(contestant.id) : next.add(contestant.id); return next })} /><span>{contestant.name}<small>{contestant.program}</small></span></label>)}</div>
              {dashboard.rounds.length > 0 && <div className="mt-8 overflow-x-auto"><div className="flex min-w-max gap-5">{dashboard.rounds.map((round) => <div key={round.id} className="w-80"><p className="eyebrow mb-3">{round.name}</p>{round.matches.map((match) => <MatchControl key={match.id} match={match} busy={busy} onAction={(action) => perform(`${match.id}-${action}`, () => api.matchAction(session.token, match.id, action), 'Estado de batalla actualizado.')} />)}</div>)}</div></div>}
            </section>

            <section className="admin-section grid gap-8 lg:grid-cols-2">
              <div><div className="section-heading"><div><p className="eyebrow">Equipo</p><h2>Agregar administrador</h2></div></div><p className="mb-4 text-sm leading-6 text-secondary">El nuevo integrante podrá revisar solicitudes, controlar batallas y administrar el torneo contigo.</p><CollaboratorForm busy={busy === 'collaborator'} onSubmit={(username, password) => perform('collaborator', () => api.addCollaborator(session.token, username, password), 'Administrador colaborativo agregado.')} /></div>
              <div><div className="section-heading"><div><p className="eyebrow text-red-700">Seguridad</p><h2>Reiniciar torneo</h2></div></div><p className="text-sm leading-6 text-secondary">Elimina bracket y votos, conserva participantes aprobados y vuelve a registro.</p>{session.user.role === 'admin' && <button type="button" className="danger-action mt-5" disabled={Boolean(busy)} onClick={() => { if (window.confirm('¿Reiniciar bracket y eliminar todos los votos?')) void perform('reset', () => api.reset(session.token, dashboard.tournament.id), 'Torneo reiniciado.') }}><RotateCcw size={17} /> Reiniciar torneo</button>}</div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function AdminMetric({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return <div className="bg-white/40 p-6"><span className="text-fuchsia-700">{icon}</span><strong className="mt-4 block font-display text-3xl font-extrabold tabular-nums text-primary">{value}</strong><span className="mt-1 block text-sm text-secondary">{label}</span></div>
}

function ActiveMatchControl({ match, busy, onAction }: { match: AuraMatch; busy: string; onAction: (action: 'start' | 'pause' | 'resume' | 'finish', tieWinnerId?: string) => void }) {
  const tied = match.votesA === match.votesB
  return <section className="admin-section live-control"><div><p className="eyebrow">Batalla actual · {match.status}</p><h2 className="mt-2 font-display text-3xl font-extrabold text-primary">{match.contestantA?.name ?? 'Por definir'} <span className="text-tertiary">vs</span> {match.contestantB?.name ?? 'Por definir'}</h2><p className="mt-3 text-secondary">{match.votesA} – {match.votesB} votos · {(match.totalVotes * 100).toLocaleString('es-MX')} Aura</p></div><div className="mt-6 flex flex-wrap items-center gap-3"><div className="timer-panel mr-auto"><Countdown endsAt={match.endsAt} pausedSeconds={match.remainingSeconds} status={match.status} /></div>{match.status === 'scheduled' && <button className="primary-action" disabled={Boolean(busy)} onClick={() => onAction('start')}><Play size={17} /> Iniciar</button>}{match.status === 'live' && <button className="secondary-action" disabled={Boolean(busy)} onClick={() => onAction('pause')}><Pause size={17} /> Pausar</button>}{match.status === 'paused' && <button className="primary-action" disabled={Boolean(busy)} onClick={() => onAction('resume')}><Play size={17} /> Reanudar</button>}{['live', 'paused'].includes(match.status) && <button className="danger-action" disabled={Boolean(busy)} onClick={() => { if (tied) { const winner = window.prompt(`Empate. Escribe A para ${match.contestantA?.name} o B para ${match.contestantB?.name}`); onAction('finish', winner?.toUpperCase() === 'A' ? match.contestantA?.id : winner?.toUpperCase() === 'B' ? match.contestantB?.id : undefined) } else onAction('finish') }}><CircleStop size={17} /> Finalizar</button>}</div></section>
}

function MatchControl({ match, busy, onAction }: { match: AuraMatch; busy: string; onAction: (action: 'start' | 'pause' | 'resume' | 'finish') => Promise<void> }) {
  return <article className="bracket-match admin-match"><span>{match.contestantA?.name ?? 'Por definir'} <b>{match.votesA}</b></span><span>{match.contestantB?.name ?? 'Por definir'} <b>{match.votesB}</b></span>{match.status === 'scheduled' && match.contestantA && match.contestantB && <button disabled={Boolean(busy)} onClick={() => void onAction('start')}><Play size={14} /> Iniciar</button>}{match.status === 'live' && <button disabled={Boolean(busy)} onClick={() => void onAction('pause')}><Pause size={14} /> Pausar</button>}{match.status === 'paused' && <button disabled={Boolean(busy)} onClick={() => void onAction('resume')}><SkipForward size={14} /> Seguir</button>}</article>
}

function CollaboratorForm({ busy, onSubmit }: { busy: boolean; onSubmit: (username: string, password: string) => Promise<void> }) {
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit(String(form.get('username')), String(form.get('password'))) }}><label><span className="field-label">Usuario</span><input className="field-input" name="username" required minLength={3} /></label><label><span className="field-label">Contraseña temporal (12+ caracteres)</span><input className="field-input" name="password" type="password" required minLength={12} /></label><button className="secondary-action justify-center" disabled={busy}><Plus size={17} /> {busy ? 'Agregando...' : 'Agregar administrador'}</button></form>
}
