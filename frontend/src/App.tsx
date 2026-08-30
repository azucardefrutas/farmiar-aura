import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })))
const TournamentPage = lazy(() => import('./pages/TournamentPage').then((module) => ({ default: module.TournamentPage })))
const LivePage = lazy(() => import('./pages/LivePage').then((module) => ({ default: module.LivePage })))
const WelcomePage = lazy(() => import('./pages/WelcomePage').then((module) => ({ default: module.WelcomePage })))
const ParticipationPage = lazy(() => import('./pages/ParticipationPage').then((module) => ({ default: module.ParticipationPage })))

const configuredAdminUrl = (import.meta.env.VITE_ADMIN_URL as string | undefined)?.replace(/\/$/, '')
const isDedicatedAdminBuild = import.meta.env.VITE_ADMIN_MODE === 'true'

function AdminEntry() {
  const isAdminHost = isDedicatedAdminBuild || window.location.hostname.toLowerCase().startsWith('admin-aura.')

  if (configuredAdminUrl && !isAdminHost) {
    window.location.replace(`${configuredAdminUrl}/admin`)
    return <div className="grid min-h-dvh place-items-center bg-arena text-sm font-bold uppercase tracking-[.22em] text-muted">Abriendo administración...</div>
  }

  return <AdminPage />
}

export default function App() {
  const isAdminHost = isDedicatedAdminBuild || window.location.hostname.toLowerCase().startsWith('admin-aura.')

  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center bg-arena text-sm font-bold uppercase tracking-[.22em] text-muted">Cargando torneo...</div>}>
      <Routes>
        <Route path="/" element={isAdminHost ? <Navigate to="/admin" replace /> : <WelcomePage />} />
        <Route path="/participar" element={isAdminHost ? <Navigate to="/admin" replace /> : <ParticipationPage />} />
        <Route path="/votar" element={isAdminHost ? <Navigate to="/admin" replace /> : <TournamentPage />} />
        <Route path="/admin" element={<AdminEntry />} />
        <Route path="/live" element={isAdminHost ? <Navigate to="/admin" replace /> : <LivePage />} />
        <Route path="*" element={<Navigate to={isAdminHost ? '/admin' : '/'} replace />} />
      </Routes>
    </Suspense>
  )
}
