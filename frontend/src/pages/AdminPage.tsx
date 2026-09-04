import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Activity, BookOpenCheck, Check, CircleStop, Clock3, LayoutDashboard, LogOut, Menu, Pause, Play, Plus, Radio, RefreshCw, RotateCcw, Shield, Sparkles, Trash2, Trophy, UserCheck, UserPlus, UserX, Users, Wifi, WifiOff, X } from 'lucide-react'
import { api } from '../lib/api'
import { subscribeToAdminPresence, type OnlineAdministrator } from '../lib/adminPresence'
import { subscribeToTournament } from '../lib/realtime'
import { ensureVoterSession } from '../lib/supabase'
import type { AdminDashboard, AdminSession, AuraMatch, TournamentFormat } from '../types'
import { BrandMark } from '../components/BrandMark'
import { StageAgenda } from '../components/StageAgenda'
import { Countdown } from '../components/Countdown'
import { StandingsTable } from '../components/StandingsTable'
import { TournamentBracket } from '../components/TournamentBracket'
import { FreeMatchForm, TournamentManager } from '../components/TournamentManager'
import { durationLabel, suggestedMatchDuration, tournamentPlan } from '../lib/tournamentPlan'
import { ServerHealthPanel } from '../components/ServerHealthPanel'

const SESSION_KEY = 'farmear-aura-admin-session'

function storedSession(): AdminSession | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as AdminSession | null }
  catch { return null }
}

export function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(storedSession)
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>()
  const loadSequence = useRef(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [onlineAdministrators, setOnlineAdministrators] = useState<OnlineAdministrator[]>([])
  const collaboratorKey = dashboard?.collaborators.map((item) => `${item.username}:${item.role}`).join('|') ?? ''
  const contestantKey = dashboard?.contestants.map((item) => item.id).join('|') ?? ''

  const load = useCallback(async () => {
    if (!session) return
    const sequence = ++loadSequence.current
    try {
      const next = await api.dashboard(session.token, selectedTournamentId)
      if (sequence !== loadSequence.current) return
      setDashboard(next); setError('')
    }
    catch (caught) {
      if (sequence !== loadSequence.current) return
      const message = caught instanceof Error ? caught.message : 'No fue posible cargar el panel.'
      setError(message)
      if (message.toLowerCase().includes('sesión')) logout()
    }
  }, [session, selectedTournamentId])

  useEffect(() => { void load(); return () => { loadSequence.current += 1 } }, [load])
  useEffect(() => {
    if (!dashboard) return
    let disposed = false
    let cleanup: () => void = () => undefined
    void ensureVoterSession().then(() => { if (!disposed) cleanup = subscribeToTournament(dashboard.tournament.id, dashboard.activeMatch?.id, () => load()) }).catch(() => undefined)
    return () => { disposed = true; cleanup() }
  }, [dashboard?.tournament.id, dashboard?.activeMatch?.id, load])

  useEffect(() => {
    if (!dashboard || !session) return
    let disposed = false
    let cleanup: () => void = () => undefined
    const allowedUsernames = new Set(dashboard.collaborators.map((item) => item.username))
    void subscribeToAdminPresence('team', session.user, allowedUsernames, setOnlineAdministrators)
      .then((nextCleanup) => {
        if (disposed) nextCleanup()
        else cleanup = nextCleanup
      })
      .catch(() => { if (!disposed) setOnlineAdministrators([]) })
    return () => { disposed = true; cleanup() }
  }, [session?.user.username, session?.user.role, collaboratorKey])

  useEffect(() => {
    if (!dashboard) return
    setSelected((current) => {
      const validIds = new Set(dashboard.contestants.map((contestant) => contestant.id))
      const retained = [...current].filter((id) => validIds.has(id))
      return new Set(retained.length > 0 ? retained : validIds)
    })
  }, [contestantKey])

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setSession(null)
    setDashboard(null)
    setOnlineAdministrators([])
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

  async function createCall(name: string, format: TournamentFormat, maxParticipants: number, autoCloseWhenFull: boolean) {
    if (!session) return
    setBusy('create-call'); setError('')
    try {
      const created = await api.createCall(session.token, name, format, 90, 100, maxParticipants, autoCloseWhenFull)
      setDashboard(null); setSelectedTournamentId(created.id)
      setNotice('Convocatoria creada como borrador. Publícala cuando esté lista.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible crear la convocatoria.') }
    finally { setBusy('') }
  }

  async function deleteCall() {
    if (!session || !dashboard) return
    const callName = dashboard.tournament.name
    setBusy('delete-call'); setError(''); setNotice('')
    try {
      await api.deleteCall(session.token, dashboard.tournament.id)
      setDashboard(null)
      setSelectedTournamentId(undefined)
      setNotice(`Convocatoria “${callName}” eliminada.`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible eliminar la convocatoria.') }
    finally { setBusy('') }
  }

  const bracketCountValid = selected.size >= 2 && selected.size <= 32
  const registrations = dashboard?.registrations ?? []

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
      <aside className={`admin-sidebar ${menuOpen ? 'is-open' : ''}`}><div className="flex items-center justify-between"><BrandMark /><button type="button" className="icon-action nav-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={18} /></button></div><nav className="mt-9 grid gap-2"><a className="sidebar-link is-active" href="#resumen" onClick={() => setMenuOpen(false)}><LayoutDashboard size={18} /> Resumen</a><a className="sidebar-link" href="#servidor" onClick={() => setMenuOpen(false)}><Activity size={18} /> Servidor</a><a className="sidebar-link" href="#convocatorias" onClick={() => setMenuOpen(false)}><Trophy size={18} /> Convocatorias</a><a className="sidebar-link" href="#inscripciones" onClick={() => setMenuOpen(false)}><UserPlus size={18} /> Inscripciones <span className="sidebar-count">{registrations.length}</span></a><a className="sidebar-link" href="#reglas" onClick={() => setMenuOpen(false)}><BookOpenCheck size={18} /> Reglas</a><a className="sidebar-link" href="#torneo" onClick={() => setMenuOpen(false)}><Trophy size={18} /> Llave y batallas</a><a className="sidebar-link" href="#equipo" onClick={() => setMenuOpen(false)}><Users size={18} /> Colaboradores <span className="sidebar-count">{onlineAdministrators.length}/{dashboard?.collaborators.length ?? 0}</span></a></nav><div className="mt-auto space-y-3"><p className="text-xs text-muted">{session.user.username} · {session.user.role}</p><Link to="/live" className="secondary-action w-full"><Radio size={17} /> Pantalla Live</Link><button type="button" onClick={logout} className="secondary-action w-full"><LogOut size={17} /> Cerrar sesión</button></div></aside>
      <main id="resumen" className="admin-content page-shell py-8 sm:py-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.24em] text-fuchsia-700">Centro de control</p><h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-.04em] text-primary">{dashboard?.tournament.name ?? 'Batallas de Aura'}</h1><p className="mt-3 text-secondary">Todo cambio confirmado se publica a votantes y pantalla en vivo por WebSocket.</p></div>
          <button type="button" className="secondary-action" onClick={() => void load()}><RefreshCw size={17} /> Actualizar</button>
        </div>
        <div aria-live="polite" className="mt-5 space-y-3">{notice && <p className="notice-success">{notice}</p>}{error && <p role="alert" className="notice-error">{error}</p>}</div>

        {!dashboard ? <div className="mt-8 h-44 animate-pulse rounded-2xl bg-panel" /> : (
          <>
            <section className="admin-section mt-8 grid grid-cols-3 gap-px overflow-hidden p-0">
              <AdminMetric label="Participantes" value={dashboard.summary.contestants} icon={<Users />} />
              <AdminMetric label="Votos confirmados" value={dashboard.summary.votes} icon={<Check />} />
              <AdminMetric label="Aura total" value={dashboard.summary.totalAura.toLocaleString('es-MX')} icon={<Radio />} />
            </section>

            <ServerHealthPanel token={session.token} />

            <TournamentManager calls={dashboard.calls} selectedId={dashboard.tournament.id} busy={Boolean(busy)}
              onSelect={(id) => { if (id !== dashboard.tournament.id) { setDashboard(null); setSelectedTournamentId(id) } }}
              onCreate={createCall}
              canOpenRegistrations={dashboard.tournament.status === 'draft' || (dashboard.tournament.status === 'ready' && dashboard.rounds.length === 0 && dashboard.contestants.length < dashboard.tournament.rules.maxParticipants)}
              onOpenRegistrations={() => void perform('open-registration', () => api.openRegistrations(session.token, dashboard.tournament.id), 'Inscripciones abiertas, sin cambiar el escenario actual.')}
              onPublish={() => { if (window.confirm('¿Llevar esta convocatoria al escenario de votación? El historial anterior se conserva.')) void perform('publish', () => api.publishCall(session.token, dashboard.tournament.id), 'Convocatoria publicada.') }}
              canDelete={session.user.role === 'admin'}
              onDelete={() => { if (window.confirm(`¿Eliminar “${dashboard.tournament.name}”? Se borrarán sus inscripciones, participantes, batallas, votos y fotos. No se puede deshacer.`)) void deleteCall() }}
            />
            <StageAgenda stage={dashboard.stage} isCurrent={dashboard.tournament.isCurrent} busy={Boolean(busy)} onStart={(matchId) => void perform('stage-next', () => api.startNextStage(session.token, dashboard.tournament.id, matchId), 'Siguiente batalla iniciada.')} />
            {dashboard.activeMatch && ['live', 'paused'].includes(dashboard.activeMatch.status) && <ActiveMatchControl serverTime={dashboard.serverTime} match={dashboard.activeMatch} auraPerVote={dashboard.tournament.rules.auraPerVote} busy={busy} onAction={(action, tieWinnerId) => perform(`match-${action}`, () => api.matchAction(session.token, dashboard.activeMatch!.id, action, tieWinnerId), `Batalla ${action === 'start' ? 'iniciada' : action === 'pause' ? 'pausada' : action === 'resume' ? 'reanudada' : 'finalizada'}.`)} />}

            <TournamentRulesForm
              key={`${dashboard.tournament.id}-${dashboard.tournament.rules.durationSeconds}-${dashboard.tournament.rules.auraPerVote}-${dashboard.tournament.rules.maxParticipants}-${dashboard.tournament.rules.autoCloseWhenFull}`}
              participantCount={dashboard.contestants.length}
              knockout={dashboard.tournament.format === 'single_elimination'}
              durationSeconds={dashboard.tournament.rules.durationSeconds}
              auraPerVote={dashboard.tournament.rules.auraPerVote}
              maxParticipants={dashboard.tournament.rules.maxParticipants}
              autoCloseWhenFull={dashboard.tournament.rules.autoCloseWhenFull}
              busy={busy === 'settings'}
              onSubmit={(durationSeconds, auraPerVote, maxParticipants, autoCloseWhenFull) => perform('settings', () => api.updateTournamentSettings(session.token, dashboard.tournament.id, durationSeconds, auraPerVote, maxParticipants, autoCloseWhenFull), 'Reglas, duración y cupo actualizados.')}
            />

            <section id="inscripciones" className="admin-section scroll-mt-6">
              <div className="section-heading"><div><p className="eyebrow">Bandeja en vivo</p><h2>Personas inscritas</h2></div><span className="count-badge">{registrations.length}</span></div>
              <p className="mb-5 text-sm text-secondary">Las nuevas inscripciones quedan confirmadas automáticamente y aparecen aquí por WebSocket.</p>
              {registrations.length === 0 ? <p className="empty-row">Todavía no hay personas inscritas.</p> : <div className="grid gap-4 lg:grid-cols-2">{registrations.map((item) => (
                <article key={item.id} className="registration-card">
                  {item.foto_url ? <img src={item.foto_url} alt="" width="80" height="80" className="size-20 rounded-xl object-cover" /> : <div className="grid size-20 place-items-center rounded-xl bg-fuchsia-100 font-display text-xl font-extrabold text-fuchsia-900">{item.nombre[0]}{item.apellidos[0]}</div>}
                  <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="font-bold text-primary">{item.alias || `${item.nombre} ${item.apellidos}`}</h3><span className={`registration-status status-${item.status}`}>{item.status === 'approved' ? 'Inscrito' : item.status === 'pending' ? 'Pendiente' : 'Rechazado'}</span></div><p className="mt-1 text-sm text-secondary">{item.edad} años · {item.carrera} · {item.grupo}</p>{item.status === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="compact-action compact-approve" disabled={Boolean(busy)} onClick={() => void perform(`approve-${item.id}`, () => api.review(session.token, item.id, 'approved'), 'Participante aprobado.')}><UserCheck size={16} /> Aprobar</button><button type="button" className="compact-action compact-reject" disabled={Boolean(busy)} onClick={() => void perform(`reject-${item.id}`, () => api.review(session.token, item.id, 'rejected'), 'Solicitud rechazada.')}><UserX size={16} /> Rechazar</button></div>}<button type="button" className="compact-action compact-reject mt-3" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`¿Eliminar la inscripción de ${item.nombre} ${item.apellidos} y su foto? No se puede deshacer.`)) void perform(`delete-registration-${item.id}`, () => api.deleteRegistration(session.token, item.id), 'Inscripción eliminada.') }}><Trash2 size={14} /> Eliminar inscripción</button></div>
                </article>
              ))}</div>}
            </section>

            <section id="torneo" className="admin-section scroll-mt-6">
              <div className="section-heading"><div><p className="eyebrow">{dashboard.tournament.format === 'single_elimination' ? 'Eliminación directa' : 'Sin eliminación'}</p><h2>Alineación y batallas</h2></div>{dashboard.tournament.status === 'registration' && <button type="button" className="primary-action" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`¿Cerrar inscripciones con ${dashboard.contestants.length} participantes?`)) void perform('close-registration', () => api.closeRegistrations(session.token, dashboard.tournament.id), 'Inscripciones cerradas.') }}><Trophy size={17} /> Cerrar inscripciones ({dashboard.contestants.length})</button>}</div>
              {dashboard.tournament.format === 'single_elimination' ? <>
                <p className="mb-5 text-sm text-secondary">De 2 a 32 participantes. Los cruces se sortean; los cupos libres son pases directos, sin dejar a nadie fuera. La final define 1.º y 2.º; con 4 o más hay duelo por el 3.º, con 3 corresponde al perdedor de la semifinal.</p>
                <details className="mb-5 rounded-2xl border border-white bg-white/40 p-4"><summary className="min-h-11 cursor-pointer font-bold">Seleccionar participantes ({selected.size})</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dashboard.contestants.map((contestant) => <label key={contestant.id} className="select-contestant"><input type="checkbox" checked={selected.has(contestant.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(contestant.id) ? next.delete(contestant.id) : next.add(contestant.id); return next })} /><span>{contestant.name}<small>{contestant.program}</small></span></label>)}</div>
                  <button type="button" className="secondary-action mt-4" disabled={!bracketCountValid || Boolean(busy)} onClick={() => { if (!dashboard.rounds.length || window.confirm('¿Volver a sortear los cruces pendientes?')) void perform('bracket', () => api.generateBracket(session.token, dashboard.tournament.id, [...selected]), 'Llave generada.') }}>Generar con selección ({selected.size})</button>
                </details>
              </> : <>
                <p className="text-sm text-secondary">Crea los enfrentamientos que quieras. Nadie queda eliminado. Al cerrar, se ordenan por victorias y luego votos; los empates comparten lugar.</p>
                <FreeMatchForm key={dashboard.tournament.id} contestants={dashboard.contestants} duration={dashboard.tournament.rules.durationSeconds} busy={Boolean(busy)} onCreate={(a, b, seconds) => perform('free-match', () => api.createFreeMatch(session.token, dashboard.tournament.id, a, b, seconds), 'Batalla programada.')} />
                {dashboard.tournament.status !== 'finished' && <button type="button" className="secondary-action mb-5" disabled={Boolean(busy)} onClick={() => { if (window.confirm('¿Cerrar las batallas libres y calcular los lugares finales?')) void perform('finish-call', () => api.finishCall(session.token, dashboard.tournament.id), 'Convocatoria finalizada; clasificación calculada.') }}>Finalizar convocatoria</button>}
              </>}
              <TournamentBracket rounds={dashboard.rounds} renderActions={(match) => <MatchControl match={match} busy={busy} turn={dashboard.stage?.queue.find(slot => slot.matchId === match.id)?.number}
                onAction={(action) => perform(`${match.id}-${action}`, () => api.matchAction(session.token, match.id, action), 'Estado de batalla actualizado.')}
                onDelete={() => { if (window.confirm('¿Eliminar esta batalla y todos sus votos? No se puede deshacer.')) void perform('delete-match', () => api.deleteMatch(session.token, match.id), 'Batalla eliminada.') }}
                onReplay={() => { if (window.confirm('¿Crear revancha de exhibición con votos nuevos? El resultado oficial y la clasificación NO cambian.')) void perform('replay', () => api.replayMatch(session.token, match.id), 'Revancha de exhibición creada. El resultado original se conserva.') }}
              />} />
              {dashboard.standings.length > 0 && <div className="mt-9"><div className="section-heading"><div><p className="eyebrow">Resultados</p><h2>Tabla de posiciones</h2></div></div><p className="mb-4 text-xs text-secondary">— indica lugar aún sin definir. En eliminatoria, quienes caen en la misma ronda comparten posición. Las revanchas de exhibición no cambian la clasificación.</p><StandingsTable standings={dashboard.standings} placements={dashboard.placements} /></div>}
            </section>

            <section id="equipo" className="admin-section scroll-mt-6">
              <div className="section-heading"><div><p className="eyebrow">Presencia en tiempo real</p><h2>Equipo administrador</h2></div><span className="presence-total"><Wifi size={16} /> En línea {onlineAdministrators.length}/{dashboard.collaborators.length}</span></div>
              <p className="mb-5 text-sm text-secondary">El contador usa conexiones activas de Supabase Realtime Presence. No se calcula ni se simula.</p>
              <div className="collaborator-list">{dashboard.collaborators.map((collaborator) => {
                const isOnline = onlineAdministrators.some((item) => item.username === collaborator.username)
                return <article key={collaborator.username} className="collaborator-row"><span className={`presence-dot ${isOnline ? 'is-online' : ''}`} aria-hidden="true" /> <div><strong>{collaborator.username}</strong><small>{collaborator.role === 'admin' ? 'Administrador' : 'Colaborador'}</small></div><span className="presence-label">{isOnline ? <><Wifi size={14} /> En línea</> : <><WifiOff size={14} /> Fuera de línea</>}</span></article>
              })}</div>
              <div className="mt-8 grid gap-8 border-t border-slate-300/60 pt-7 lg:grid-cols-2">
                <div><div className="section-heading"><div><p className="eyebrow">Equipo</p><h2>Agregar administrador</h2></div></div><p className="mb-4 text-sm leading-6 text-secondary">El nuevo integrante podrá revisar solicitudes, controlar batallas y administrar el torneo contigo.</p><CollaboratorForm busy={busy === 'collaborator'} onSubmit={(username, password) => perform('collaborator', () => api.addCollaborator(session.token, username, password), 'Administrador colaborativo agregado.')} /></div>
                <div><div className="section-heading"><div><p className="eyebrow text-red-700">Seguridad</p><h2>Reiniciar torneo</h2></div></div><p className="text-sm leading-6 text-secondary">Elimina bracket y votos, conserva participantes aprobados y vuelve a registro.</p>{session.user.role === 'admin' && <button type="button" className="danger-action mt-5" disabled={Boolean(busy)} onClick={() => { if (window.confirm('¿Reiniciar bracket y eliminar todos los votos?')) void perform('reset', () => api.reset(session.token, dashboard.tournament.id), 'Torneo reiniciado.') }}><RotateCcw size={17} /> Reiniciar torneo</button>}</div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function AdminMetric({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return <div className="bg-white/40 p-3 sm:p-6"><span className="text-fuchsia-700">{icon}</span><strong className="mt-2 block font-display text-2xl font-extrabold tabular-nums sm:mt-4 sm:text-3xl text-primary">{value}</strong><span className="mt-1 block text-xs text-secondary sm:text-sm">{label}</span></div>
}

function ActiveMatchControl({ match, auraPerVote, busy, onAction, serverTime }: { serverTime: string; match: AuraMatch; auraPerVote: number; busy: string; onAction: (action: 'start' | 'pause' | 'resume' | 'finish', tieWinnerId?: string) => void }) {
  const tied = match.votesA === match.votesB
  return <section className="admin-section live-control"><div><p className="eyebrow">Batalla actual · {match.status}</p><h2 className="mt-2 font-display text-3xl font-extrabold text-primary">{match.contestantA?.name ?? 'Por definir'} <span className="text-tertiary">vs</span> {match.contestantB?.name ?? 'Por definir'}</h2><p className="mt-3 text-secondary">{match.votesA} – {match.votesB} votos · {(match.totalVotes * auraPerVote).toLocaleString('es-MX')} Aura</p></div><div className="mt-6 flex flex-wrap items-center gap-3"><div className="timer-panel mr-auto"><Countdown endsAt={match.endsAt} pausedSeconds={match.remainingSeconds} status={match.status} durationSeconds={match.durationSeconds} serverTime={serverTime} /></div>{match.status === 'scheduled' && <button className="primary-action" disabled={Boolean(busy)} onClick={() => onAction('start')}><Play size={17} /> Iniciar</button>}{match.status === 'live' && <button className="secondary-action" disabled={Boolean(busy)} onClick={() => onAction('pause')}><Pause size={17} /> Pausar</button>}{match.status === 'paused' && <button className="primary-action" disabled={Boolean(busy)} onClick={() => onAction('resume')}><Play size={17} /> Reanudar</button>}{['live', 'paused'].includes(match.status) && <button className="danger-action" disabled={Boolean(busy)} onClick={() => { if (tied) { const winner = window.prompt(`Empate. Escribe A para ${match.contestantA?.name} o B para ${match.contestantB?.name}`); onAction('finish', winner?.toUpperCase() === 'A' ? match.contestantA?.id : winner?.toUpperCase() === 'B' ? match.contestantB?.id : undefined) } else onAction('finish') }}><CircleStop size={17} /> Finalizar</button>}</div></section>
}

function TournamentRulesForm({ durationSeconds, auraPerVote, maxParticipants, autoCloseWhenFull, participantCount, knockout, busy, onSubmit }: { durationSeconds: number; auraPerVote: number; maxParticipants: number; autoCloseWhenFull: boolean; participantCount: number; knockout: boolean; busy: boolean; onSubmit: (durationSeconds: number, auraPerVote: number, maxParticipants: number, autoCloseWhenFull: boolean) => Promise<void> }) {
  const [duration, setDuration] = useState(durationSeconds)
  const [aura, setAura] = useState(auraPerVote)
  const [capacity, setCapacity] = useState(maxParticipants)
  const [autoClose, setAutoClose] = useState(autoCloseWhenFull)
  const plan = tournamentPlan(participantCount, duration)
  return <section id="reglas" className="admin-section scroll-mt-6"><div className="section-heading"><div><p className="eyebrow">Configuración activa</p><h2>Reglas, duración y cupo</h2></div></div>
    <div className="rules-layout"><form className="rules-form" onSubmit={(event) => { event.preventDefault(); void onSubmit(duration, aura, capacity, autoClose) }}>
      <label><span className="field-label">Tiempo por batalla</span><span className="field-with-unit"><Clock3 size={17} /><input className="field-input" name="durationSeconds" type="number" min={30} max={600} step={1} value={duration} onChange={(event) => setDuration(Number(event.target.value))} required /><small>segundos</small></span></label>
      <label><span className="field-label">Aura por voto</span><span className="field-with-unit"><Sparkles size={17} /><input className="field-input" name="auraPerVote" type="number" min={10} max={1000} value={aura} onChange={(event) => setAura(Number(event.target.value))} required /><small>Aura</small></span></label>
      <label><span className="field-label">Cupo máximo</span><span className="field-with-unit"><Users size={17} /><input className="field-input" name="maxParticipants" type="number" min={Math.max(2, participantCount)} max={32} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} required /><small>personas</small></span></label>
      <div className="grid grid-cols-4 gap-2">{[4, 8, 12, 16].map((amount) => <button key={amount} type="button" aria-pressed={capacity === amount} disabled={amount < participantCount} className={`min-h-10 rounded-xl border text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${capacity === amount ? 'border-fuchsia-500 bg-fuchsia-100 text-fuchsia-900' : 'border-white bg-white/60 text-secondary'}`} onClick={() => setCapacity(amount)}>{amount}</button>)}</div>
      <label className="select-contestant"><input type="checkbox" checked={autoClose} onChange={(event) => setAutoClose(event.target.checked)} /><span>Cerrar automáticamente al llenarse<small>El último lugar se confirma y las solicitudes adicionales se bloquean.</small></span></label>
      <button className="secondary-action justify-center" disabled={busy}>{busy ? 'Guardando...' : 'Guardar reglas'}</button>
    </form><div className="rules-summary"><p><Check size={16} /> Cupo real: {participantCount}/{capacity}. La base de datos protege el último lugar aunque se inscriban varias personas a la vez.</p><p><Check size={16} /> Un voto por sesión anónima y batalla. Omitir no suma puntos.</p><p><Check size={16} /> Tiempo real desde el servidor. Los cambios de duración afectan solo batallas pendientes.</p><p><Check size={16} /> Gana quien recibe más votos. En empate, el administrador decide.</p><p><Check size={16} /> {knockout ? 'Quien pierde sale de la llave; las semifinales definen el duelo por el tercer lugar.' : 'Nadie queda fuera; los lugares se calculan al finalizar la convocatoria.'}</p></div></div>
    {knockout && participantCount >= 2 && <div className="mt-5 rounded-2xl bg-fuchsia-50/70 p-4">
      <div className="grid grid-cols-3 gap-3 text-center text-xs text-secondary"><p><strong className="block text-lg text-primary">{plan.matches}</strong>batallas reales</p><p><strong className="block text-lg text-primary">{plan.byes}</strong>pases directos</p><p><strong className="block text-lg text-primary">{durationLabel(plan.estimatedSeconds)}</strong>estimado total</p></div>
      <p className="mt-3 text-xs leading-5 text-secondary">Estimación con todos los inscritos, tercer lugar cuando aplica y 20 s entre encuentros. Las pausas, empates y revanchas pueden alargar el evento.</p>
      <div className="mt-3 flex flex-wrap gap-2">{[15, 20].map((minutes) => <button key={minutes} type="button" className="secondary-action text-xs" onClick={() => setDuration(suggestedMatchDuration(participantCount, minutes))}>Proponer para {minutes} min</button>)}</div><p className="mt-2 text-xs text-muted">La propuesta mantiene batallas entre 30 s y 3 min. Pulsa Guardar reglas para aplicarla.</p>
    </div>}
  </section>
}

function MatchControl({ match, busy, turn, onAction, onDelete, onReplay }: { match: AuraMatch; busy: string; turn?: number; onAction: (action: 'start' | 'pause' | 'resume' | 'finish') => Promise<void>; onDelete: () => void; onReplay: () => void }) {
  return <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-2 text-xs">
    {turn && <span className="self-center text-xs text-secondary">Turno {turn}</span>}
    {match.isReplay && match.status === 'scheduled' && match.contestantA && match.contestantB && <button className="compact-action compact-approve" disabled={Boolean(busy)} onClick={() => void onAction('start')}><Play size={14} /> Iniciar exhibición</button>}
    {match.status === 'live' && <button className="compact-action" disabled={Boolean(busy)} onClick={() => void onAction('pause')}><Pause size={14} /> Pausar</button>}
    {match.status === 'paused' && <button className="compact-action" disabled={Boolean(busy)} onClick={() => void onAction('resume')}><Play size={14} /> Seguir</button>}
    {match.status === 'finished' && match.matchType !== 'bye' && <button className="compact-action" disabled={Boolean(busy)} onClick={onReplay}><RotateCcw size={14} /> Repetir · exhibición</button>}
    {match.matchType === 'exhibition' && !['live', 'paused'].includes(match.status) && <button className="compact-action compact-reject" disabled={Boolean(busy)} onClick={onDelete}><Trash2 size={14} /> Eliminar</button>}
  </div>
}

function CollaboratorForm({ busy, onSubmit }: { busy: boolean; onSubmit: (username: string, password: string) => Promise<void> }) {
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit(String(form.get('username')), String(form.get('password'))) }}><label><span className="field-label">Usuario</span><input className="field-input" name="username" required minLength={3} /></label><label><span className="field-label">Contraseña temporal (12+ caracteres)</span><input className="field-input" name="password" type="password" required minLength={12} /></label><button className="secondary-action justify-center" disabled={busy}><Plus size={17} /> {busy ? 'Agregando...' : 'Agregar administrador'}</button></form>
}
