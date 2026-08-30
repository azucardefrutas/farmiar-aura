import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleStop, LayoutDashboard, LogOut, Menu, Pause, Play, Plus, Radio, RefreshCw, RotateCcw, Shield, SkipForward, Trophy, UserCheck, UserPlus, UserX, Users, X } from 'lucide-react'
import { api } from '../lib/api'
import { subscribeToTournament } from '../lib/realtime'
import { ensureVoterSession } from '../lib/supabase'
import type { AdminDashboard, AdminSession, AuraMatch } from '../types'
import { BrandMark } from '../components/BrandMark'
import { Countdown } from '../components/Countdown'
import { StandingsTable } from '../components/StandingsTable'

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
  const [menuOpen, setMenuOpen] = useState(false)

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

  const bracketCountValid = selected.size >= 4 && selected.size <= 32
  const pending = dashboard?.registrations.filter((item) => item.status === 'pending') ?? []
  const registrations = dashboard?.registrations ?? []
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
    <div className="admin-page min-h-dvh bg-arena text-primary">
      <header className="public-mobile-bar"><BrandMark /><button type="button" className="icon-action" onClick={() => setMenuOpen(true)} aria-label="Abrir menú administrativo"><Menu size={20} /></button></header>
      {menuOpen && <button type="button" className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`admin-sidebar ${menuOpen ? 'is-open' : ''}`}><div className="flex items-center justify-between"><BrandMark /><button type="button" className="icon-action nav-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={18} /></button></div><nav className="mt-9 grid gap-2"><a className="sidebar-link is-active" href="#resumen" onClick={() => setMenuOpen(false)}><LayoutDashboard size={18} /> Resumen</a><a className="sidebar-link" href="#inscripciones" onClick={() => setMenuOpen(false)}><UserPlus size={18} /> Inscripciones <span className="sidebar-count">{registrations.length}</span></a><a className="sidebar-link" href="#torneo" onClick={() => setMenuOpen(false)}><Trophy size={18} /> Llave y batallas</a><a className="sidebar-link" href="#equipo" onClick={() => setMenuOpen(false)}><Users size={18} /> Colaboradores</a></nav><div className="mt-auto space-y-3"><p className="text-xs text-muted">{session.user.username} · {session.user.role}</p><Link to="/live" className="secondary-action w-full"><Radio size={17} /> Pantalla Live</Link><button type="button" onClick={logout} className="secondary-action w-full"><LogOut size={17} /> Cerrar sesión</button></div></aside>
      <main id="resumen" className="admin-content page-shell py-8 sm:py-10">
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

            <section id="inscripciones" className="admin-section scroll-mt-6">
              <div className="section-heading"><div><p className="eyebrow">Bandeja en vivo</p><h2>Personas inscritas</h2></div><span className="count-badge">{registrations.length}</span></div>
              <p className="mb-5 text-sm text-secondary">Las nuevas inscripciones quedan confirmadas automáticamente y aparecen aquí por WebSocket.</p>
              {registrations.length === 0 ? <p className="empty-row">Todavía no hay personas inscritas.</p> : <div className="grid gap-4 lg:grid-cols-2">{registrations.map((item) => (
                <article key={item.id} className="registration-card">
                  {item.foto_url ? <img src={item.foto_url} alt="" width="80" height="80" className="size-20 rounded-xl object-cover" /> : <div className="grid size-20 place-items-center rounded-xl bg-fuchsia-100 font-display text-xl font-extrabold text-fuchsia-900">{item.nombre[0]}{item.apellidos[0]}</div>}
                  <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="font-bold text-primary">{item.alias || `${item.nombre} ${item.apellidos}`}</h3><span className={`registration-status status-${item.status}`}>{item.status === 'approved' ? 'Inscrito' : item.status === 'pending' ? 'Pendiente' : 'Rechazado'}</span></div><p className="mt-1 text-sm text-secondary">{item.edad} años · {item.carrera} · {item.grupo}</p>{item.status === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="compact-action compact-approve" disabled={Boolean(busy)} onClick={() => void perform(`approve-${item.id}`, () => api.review(session.token, item.id, 'approved'), 'Participante aprobado.')}><UserCheck size={16} /> Aprobar</button><button type="button" className="compact-action compact-reject" disabled={Boolean(busy)} onClick={() => void perform(`reject-${item.id}`, () => api.review(session.token, item.id, 'rejected'), 'Solicitud rechazada.')}><UserX size={16} /> Rechazar</button></div>}</div>
                </article>
              ))}</div>}
            </section>

            <section id="torneo" className="admin-section scroll-mt-6">
              <div className="section-heading"><div><p className="eyebrow">Torneo</p><h2>Participantes y llave</h2></div>{dashboard.tournament.status === 'registration' ? <button type="button" className="primary-action" disabled={dashboard.contestants.length < 4 || Boolean(busy)} onClick={() => { if (window.confirm(`¿Cerrar inscripciones con ${dashboard.contestants.length} participantes y generar la llave?`)) void perform('close-registration', () => api.closeRegistrations(session.token, dashboard.tournament.id), 'Inscripciones cerradas y llave generada.') }}><Trophy size={17} /> Cerrar inscripciones ({dashboard.contestants.length})</button> : <span className={`status-pill status-${dashboard.tournament.status}`}><span />{dashboard.tournament.status}</span>}</div>
              <p className="mb-5 text-sm text-secondary">Con 4 a 32 personas, el sistema sortea siembras, distribuye descansos cuando hacen falta y crea final y tercer lugar. La selección manual queda disponible para reorganizar antes de iniciar.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dashboard.contestants.map((contestant) => <label key={contestant.id} className="select-contestant"><input type="checkbox" checked={selected.has(contestant.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(contestant.id) ? next.delete(contestant.id) : next.add(contestant.id); return next })} /><span>{contestant.name}<small>{contestant.program}</small></span></label>)}</div>
              <div className="mt-5 flex justify-end"><button type="button" className="secondary-action" disabled={!bracketCountValid || Boolean(busy)} onClick={() => void perform('bracket', () => api.generateBracket(session.token, dashboard.tournament.id, [...selected]), 'Llave regenerada.')}>Regenerar con selección ({selected.size})</button></div>
              {dashboard.rounds.length > 0 && <div className="mt-8 overflow-x-auto"><div className="flex min-w-max gap-5">{dashboard.rounds.map((round) => <div key={round.id} className="w-80"><p className="eyebrow mb-3">{round.name}</p>{round.matches.map((match) => <MatchControl key={match.id} match={match} busy={busy} onAction={(action) => perform(`${match.id}-${action}`, () => api.matchAction(session.token, match.id, action), 'Estado de batalla actualizado.')} />)}</div>)}</div></div>}
              {dashboard.standings.length > 0 && <div className="mt-9"><div className="section-heading"><div><p className="eyebrow">Resultados</p><h2>Tabla de posiciones</h2></div></div><StandingsTable standings={dashboard.standings} placements={dashboard.placements} /></div>}
            </section>

            <section id="equipo" className="admin-section grid scroll-mt-6 gap-8 lg:grid-cols-2">
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
