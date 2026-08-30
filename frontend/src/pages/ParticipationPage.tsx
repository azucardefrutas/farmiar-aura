import { Clock3, Radio, ShieldCheck } from 'lucide-react'
import { PublicNavigation } from '../components/PublicNavigation'
import { RegistrationForm } from '../components/RegistrationForm'

export function ParticipationPage() {
  return <div className="public-page min-h-dvh bg-arena text-primary"><PublicNavigation /><main className="public-content page-shell py-7 sm:py-10"><div className="registration-layout"><section><span className="status-pill status-live"><span /> Inscripciones abiertas</span><p className="eyebrow mt-6">Entra a la competencia</p><h1 className="page-title">Registra tu Aura</h1><p className="page-lead">Completa tus datos una sola vez. Tu inscripción se confirma automáticamente y el equipo la verá en vivo.</p><div className="registration-steps"><div><ShieldCheck /><span><strong>1. Perfil seguro</strong><small>Tus datos viajan por una operación validada.</small></span></div><div><Radio /><span><strong>2. Alta inmediata</strong><small>Apareces en la bandeja de colaboradores.</small></span></div><div><Clock3 /><span><strong>3. Espera la llave</strong><small>Al cerrar registros se generan los cruces.</small></span></div></div></section><section className="admin-section mt-0"><RegistrationForm /></section></div></main></div>
}
