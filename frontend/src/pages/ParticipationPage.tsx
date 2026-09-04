import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronRight, Trophy } from 'lucide-react'
import { PublicNavigation } from '../components/PublicNavigation'
import { RegistrationForm } from '../components/RegistrationForm'
import { api } from '../lib/api'
import { subscribeToCalls } from '../lib/realtime'
import { ensureVoterSession } from '../lib/supabase'
import type { RegistrationCall } from '../types'

export function ParticipationPage() {
  const [calls, setCalls] = useState<RegistrationCall[]>([])
  const [selected, setSelected] = useState<RegistrationCall | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const load = useCallback(async () => {
    const request = ++sequence.current
    try {
      const result = await api.registrationCalls()
      if (request !== sequence.current) return
      setCalls(result.calls); setError('')
      // A half-filled form must never move to a different call after a realtime update.
      setSelected(current => current ? result.calls.find(call => call.id === current.id) ?? { ...current, status: 'archived' } : null)
    } catch (caught) { if (request === sequence.current) setError(caught instanceof Error ? caught.message : 'No fue posible cargar las convocatorias.') }
    finally { if (request === sequence.current) setLoading(false) }
  }, [])
  useEffect(() => {
    let disposed = false
    let cleanup = () => {}
    // Load first: do not initiate a second anonymous sign-in alongside the API request.
    void load().then(async () => { if (!disposed) { await ensureVoterSession(); if (!disposed) cleanup = subscribeToCalls(load) } }).catch(() => {})
    return () => { disposed = true; sequence.current += 1; cleanup() }
  }, [load])
  const acceptsRegistration = (call: RegistrationCall) => call.status === 'registration' && call.registeredCount < call.maxParticipants
  const open = calls.filter(acceptsRegistration)
  const closed = calls.filter(call => !acceptsRegistration(call))
  return <div className="public-page min-h-dvh bg-arena text-primary"><PublicNavigation />
    <main className="public-content page-shell py-7 sm:py-10">
      <div className="registration-layout">
        <section>
          <p className="eyebrow">Elige tu próxima batalla</p><h1 className="page-title">Convocatorias</h1>
          <p className="page-lead">Selecciona una edición abierta y registra tu Aura. Tu inscripción se confirma al enviarla y llega al equipo en tiempo real.</p>
          {error && <p role="alert" className="notice-error mt-5">{error} <button className="underline" onClick={() => void load()}>Reintentar</button></p>}
          {loading ? <p role="status" className="mt-6 text-secondary">Cargando convocatorias…</p> : error && !calls.length ? null : <fieldset className="mt-6 grid gap-3"><legend className="field-label mb-3">Abiertas · {open.length}</legend>
            {open.length === 0 && <p className="rounded-2xl border border-white bg-white/60 p-5 text-sm text-secondary">No hay inscripciones abiertas por ahora. Las próximas convocatorias aparecerán aquí.</p>}
            {open.map(call => <label key={call.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${selected?.id === call.id ? 'border-fuchsia-400 bg-fuchsia-50' : 'border-white bg-white/60 hover:border-fuchsia-200'}`}>
              <input type="radio" name="convocatoria" value={call.id} checked={selected?.id === call.id} onChange={() => setSelected(call)} className="mt-1 size-5 shrink-0 accent-fuchsia-700" />
              <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-fuchsia-800"><span>Convocatoria abierta</span><span className="tabular-nums">{call.registeredCount}/{call.maxParticipants} lugares</span></span><strong className="mt-1 block break-words text-base">{call.name}</strong><span className="mt-1 block text-xs leading-5 text-secondary">{call.format === 'single_elimination' ? 'Eliminación directa · 1 vs 1' : 'Batallas libres'} · {call.durationSeconds} s por batalla</span><span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-gradient-to-r from-fuchsia-600 to-cyan-500 transition-[width] duration-500" style={{ width: `${Math.min(100, Math.round((call.registeredCount / call.maxParticipants) * 100))}%` }} /></span><span className="mt-2 block text-xs text-secondary">Quedan {call.maxParticipants - call.registeredCount} lugares{call.autoCloseWhenFull ? ' · cierre automático' : ''}</span>{call.registered && <span className="mt-2 flex items-center gap-1 text-xs text-emerald-800"><CheckCircle2 size={14} /> Inscripción enviada</span>}</span><ChevronRight className="mt-1 shrink-0 text-fuchsia-700" size={18} />
            </label>)}
          </fieldset>}
          {closed.length > 0 && <details className="mt-5 rounded-2xl border border-white bg-white/40 p-4"><summary className="min-h-11 cursor-pointer text-sm font-bold">Inscripciones cerradas ({closed.length})</summary><ul className="grid gap-3 border-t border-slate-200 pt-3">{closed.map(call => <li key={call.id} className="text-sm"><strong className="block">{call.name}</strong><span className="text-xs text-secondary">{call.registeredCount >= call.maxParticipants ? `Cupo lleno · ${call.registeredCount}/${call.maxParticipants}` : call.status === 'finished' ? 'Finalizada' : 'Registro cerrado'}{call.registered ? ' · Tu inscripción está registrada' : ''}</span></li>)}</ul></details>}
        </section>
        <section className="admin-section mt-0 self-start">
          {selected ? <RegistrationForm key={selected.id} tournamentId={selected.id} tournamentName={selected.name} acceptingRegistrations={acceptsRegistration(selected)} registered={selected.registered} registeredCount={selected.registeredCount} maxParticipants={selected.maxParticipants} onCreated={() => void load()} /> : <div className="grid min-h-64 content-center justify-items-start gap-4 p-2"><Trophy className="text-fuchsia-700" size={28} /><h2 className="font-display text-xl font-bold">Primero, elige tu convocatoria</h2><p className="max-w-sm text-sm leading-6 text-secondary">Después completa tu nombre, edad, carrera, grupo y foto. Así tu inscripción llegará a la edición correcta.</p></div>}
        </section>
      </div>
    </main>
  </div>
}
