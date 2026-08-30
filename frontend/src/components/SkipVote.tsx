import { SkipForward } from 'lucide-react'

export function SkipVote({ omitted, busy, onClick }: { omitted: boolean; busy: boolean; onClick: () => void }) {
  return <div className="mt-5 flex flex-col items-center gap-2 text-center">
    <button type="button" className="secondary-action" disabled={busy} onClick={onClick}><SkipForward size={17} />{omitted ? 'Cambiar de idea y votar' : 'Omitir voto'}</button>
    <p className="text-xs text-secondary" role="status">{omitted ? 'Te quedas como espectador en esta batalla. No se registró ningún voto.' : '¿No eliges bando? Puedes ver la batalla sin sumar puntos.'}</p>
  </div>
}
