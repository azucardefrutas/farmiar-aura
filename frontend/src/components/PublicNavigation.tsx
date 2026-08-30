import { useEffect, useState } from 'react'
import { Home, Menu, Radio, Trophy, UserPlus, Vote, X } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { BrandMark } from './BrandMark'

const items = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/participar', label: 'Inscribirme', icon: UserPlus },
  { to: '/votar', label: 'Votar', icon: Vote },
  { to: '/votar#llave', label: 'Llave y posiciones', icon: Trophy },
]

export function PublicNavigation() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  return (
    <>
      <header className="public-mobile-bar">
        <BrandMark />
        <button type="button" className="icon-action" onClick={() => setOpen(true)} aria-label="Abrir menú" aria-expanded={open}><Menu size={20} /></button>
      </header>
      {open && <button type="button" className="nav-backdrop" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
      <aside className={`public-sidebar ${open ? 'is-open' : ''}`} aria-label="Navegación del torneo">
        <div className="flex items-center justify-between gap-3"><BrandMark /><button type="button" className="icon-action nav-close" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={19} /></button></div>
        <nav className="mt-9 grid gap-2">
          {items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}><Icon size={19} /><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-live-card"><span className="status-pill status-live"><span /> Tiempo real</span><p>Marcador, reloj y llave sincronizados con Supabase.</p><Link to="/live" className="secondary-action w-full"><Radio size={17} /> Pantalla en vivo</Link></div>
      </aside>
    </>
  )
}
