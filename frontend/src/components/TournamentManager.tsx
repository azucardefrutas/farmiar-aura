import { useState } from 'react'
import { Check, ChevronDown, Plus, Radio, Trash2, Trophy, Users } from 'lucide-react'
import type { Contestant, TournamentCall, TournamentFormat } from '../types'

interface Props {
  calls: TournamentCall[]
  selectedId: string
  busy: boolean
  onSelect: (id: string) => void
  onCreate: (name: string, format: TournamentFormat, maxParticipants: number, autoCloseWhenFull: boolean) => Promise<void>
  onPublish: () => void
  onOpenRegistrations: () => void
  canDelete: boolean
  canOpenRegistrations: boolean
  onDelete: () => void
}

export function TournamentManager({ calls = [], selectedId, busy, onSelect, onCreate, onPublish, onOpenRegistrations, canDelete, canOpenRegistrations, onDelete }: Props) {
  const [creating, setCreating] = useState(false)
  const [capacity, setCapacity] = useState(8)
  const [autoClose, setAutoClose] = useState(true)
  const selected = calls.find((call) => call.id === selectedId)
  const selectedPercent = selected ? Math.min(100, Math.round((selected.registeredCount / selected.maxParticipants) * 100)) : 0
  return <section id="convocatorias" className="admin-section scroll-mt-6">
    <div className="section-heading"><div><p className="eyebrow">Cada edición, su historia</p><h2>Convocatorias</h2></div><button type="button" className="secondary-action" onClick={() => setCreating(!creating)}><Plus size={17} /> Nueva</button></div>
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
      <details className="min-w-0 flex-1 rounded-2xl border border-white bg-white/60 p-3"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold">{selected?.name ?? 'Seleccionar convocatoria'}<ChevronDown size={17} /></summary><div className="mt-2 grid max-h-64 gap-1 overflow-y-auto">{calls.map((call) => <button type="button" key={call.id} disabled={busy} aria-pressed={selectedId === call.id} className={`rounded-xl px-3 py-3 text-left text-sm ${selectedId === call.id ? 'bg-fuchsia-100 text-fuchsia-900' : 'hover:bg-slate-100'}`} onClick={(event) => { onSelect(call.id); event.currentTarget.closest('details')?.removeAttribute('open') }}><strong className="block">{call.name}</strong><span className="text-xs">{call.format === 'single_elimination' ? 'Eliminación directa' : 'Batallas libres'} · {call.registeredCount}/{call.maxParticipants} lugares · {call.isCurrent ? 'En escenario' : call.status === 'draft' ? 'Borrador' : call.status === 'registration' ? 'Inscripciones abiertas' : 'Historial'}</span></button>)}</div></details>
      {selected?.isCurrent ? <span className="status-pill status-live"><span /> En escenario</span> : <button type="button" className="primary-action" disabled={busy} onClick={onPublish}><Radio size={17} /> Llevar al escenario</button>}
    </div>
    {selected && <div className="mt-4 rounded-2xl border border-white bg-white/50 p-4" aria-label={`${selected.registeredCount} de ${selected.maxParticipants} lugares ocupados`}>
      <div className="flex items-center justify-between gap-4 text-sm"><span className="flex items-center gap-2 font-bold"><Users size={17} className="text-fuchsia-700" /> Cupo de la convocatoria</span><strong className="tabular-nums">{selected.registeredCount}/{selected.maxParticipants}</strong></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-600 to-cyan-500 transition-[width] duration-500" style={{ width: `${selectedPercent}%` }} /></div>
      <p className="mt-2 text-xs text-secondary">{selected.registeredCount >= selected.maxParticipants ? 'Cupo lleno.' : `${selected.maxParticipants - selected.registeredCount} lugares disponibles.`} {selected.autoCloseWhenFull ? 'Cierre automático activado.' : 'El cierre es manual.'}</p>
    </div>}
    {canOpenRegistrations && <button type="button" className="secondary-action mt-3" disabled={busy} onClick={onOpenRegistrations}>Abrir inscripciones</button>}
    {canDelete && <div className="mt-5 border-t border-red-200/70 pt-5">
      <button type="button" className="danger-action" disabled={busy || selected?.isCurrent || calls.length <= 1} onClick={onDelete}><Trash2 size={17} /> Eliminar convocatoria</button>
      <p className="mt-2 text-xs leading-5 text-secondary">{selected?.isCurrent ? 'Para eliminarla, primero lleva otra convocatoria al escenario.' : calls.length <= 1 ? 'Debe existir al menos una convocatoria.' : 'Elimina esta convocatoria y todo su historial. Esta acción no se puede deshacer.'}</p>
    </div>}
    <p className="mt-3 text-xs leading-5 text-secondary">Puedes abrir varias convocatorias para inscripción, pero solo una ocupa el escenario. Seleccionar cambia tu vista; llevar al escenario cambia lo que ven los votantes, sin borrar el historial.</p>
    {creating && <form className="mt-5 grid gap-4 border-t border-slate-200 pt-5" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onCreate(String(form.get('name')), String(form.get('format')) as TournamentFormat, capacity, autoClose) }}>
      <label><span className="field-label">Nombre de la convocatoria</span><input className="field-input" name="name" minLength={3} maxLength={100} placeholder="Batallas de Aura · Segunda edición" required /></label>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="field-label mb-2">Modalidad</legend>
        <label className="select-contestant"><input type="radio" name="format" value="single_elimination" defaultChecked /><span>Eliminación directa<small>Llave, final y tercer lugar. Quien pierde queda fuera.</small></span></label>
        <label className="select-contestant"><input type="radio" name="format" value="free_battles" /><span>Batallas libres<small>Elige cada cruce. Clasificación por victorias y votos.</small></span></label>
      </fieldset>
      <fieldset><legend className="field-label mb-2">Cupo máximo</legend>
        <div className="grid grid-cols-4 gap-2">{[4, 8, 12, 16].map((amount) => <button key={amount} type="button" aria-pressed={capacity === amount} className={`min-h-11 rounded-xl border px-3 text-sm font-bold transition-colors ${capacity === amount ? 'border-fuchsia-500 bg-fuchsia-100 text-fuchsia-900' : 'border-white bg-white/60 text-secondary hover:border-fuchsia-200'}`} onClick={() => setCapacity(amount)}>{amount}</button>)}</div>
        <label className="mt-3 block"><span className="text-xs text-secondary">Otra cantidad (2 a 32)</span><input className="field-input mt-1" name="maxParticipants" type="number" min={2} max={32} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} required /></label>
      </fieldset>
      <label className="select-contestant"><input type="checkbox" checked={autoClose} onChange={(event) => setAutoClose(event.target.checked)} /><span><span className="flex items-center gap-2">{autoClose && <Check size={15} />} Cerrar al llenarse</span><small>La base de datos rechazará lugares extra. Tú confirmarás después la generación de la llave.</small></span></label>
      <button className="primary-action justify-self-start" disabled={busy}><Plus size={17} /> Crear borrador</button>
    </form>}
  </section>
}

export function FreeMatchForm({ contestants, duration, busy, onCreate }: { contestants: Contestant[]; duration: number; busy: boolean; onCreate: (a: string, b: string, seconds: number) => Promise<void> }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  return <form className="my-5 grid gap-4 rounded-2xl border border-fuchsia-200/70 bg-white/50 p-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onCreate(a, b, Number(form.get('duration'))) }}>
    <h3 className="font-bold">Crear batalla sin eliminación</h3>
    <div className="grid gap-3 sm:grid-cols-2">{(['a', 'b'] as const).map((side) => <details key={side} className="rounded-xl border border-slate-200 p-3"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">{contestants.find((item) => item.id === (side === 'a' ? a : b))?.name ?? `Elegir participante ${side.toUpperCase()}`}<ChevronDown size={15} /></summary><div className="mt-2 grid max-h-52 gap-1 overflow-y-auto">{contestants.map((item) => <button type="button" key={item.id} className="rounded-lg px-2 py-3 text-left text-sm hover:bg-fuchsia-50 disabled:opacity-40" disabled={item.id === (side === 'a' ? b : a)} onClick={(event) => { if (side === 'a') setA(item.id); else setB(item.id); event.currentTarget.closest('details')?.removeAttribute('open') }}>{item.name}</button>)}</div></details>)}</div>
    <div className="flex flex-wrap items-end gap-3"><label className="max-w-48"><span className="field-label">Duración (segundos)</span><input className="field-input" name="duration" type="number" min={30} max={600} defaultValue={duration} required /></label><button className="primary-action" disabled={busy || !a || !b || a === b}><Trophy size={17} /> Crear batalla</button></div>
    {contestants.length < 2 && <p className="text-xs text-secondary">Necesitas dos personas inscritas en esta convocatoria.</p>}
  </form>
}
