import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ImagePlus, LoaderCircle, X } from 'lucide-react'
import { api } from '../lib/api'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (message: string) => void
}

export function ParticipationModal({ open, onClose, onCreated }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const payload = new FormData(event.currentTarget)
      const result = await api.register(payload)
      onCreated(result.message)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible completar el registro.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-700/30 p-4 backdrop-blur-md" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="participation-title" tabIndex={-1} className="modal-clay my-8 w-full max-w-lg p-6 outline-none sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.22em] text-fuchsia-700">Entra al torneo</p>
            <h2 id="participation-title" className="mt-2 font-display text-3xl font-extrabold text-primary">Registra tu aura</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">Tu solicitud llegará al panel del torneo y aparecerá solo cuando sea aprobada.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar registro" className="icon-action shrink-0">
            <X size={20} />
          </button>
        </div>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="field-label">Nombre</span>
            <input name="nombre" type="text" minLength={2} maxLength={60} required autoComplete="given-name" className="field-input" placeholder="Tu nombre" />
          </label>
          <label className="block">
            <span className="field-label">Apellidos</span>
            <input name="apellidos" type="text" minLength={2} maxLength={80} required autoComplete="family-name" className="field-input" placeholder="Tus apellidos" />
          </label>
          <label className="block">
            <span className="field-label">Carrera</span>
            <input name="carrera" type="text" minLength={2} maxLength={100} required className="field-input" placeholder="Ej. Ingeniería de Software" />
          </label>
          <label className="block">
            <span className="field-label">Cuatrimestre / grupo</span>
            <input name="grupo" type="text" minLength={1} maxLength={40} required className="field-input" placeholder="Ej. 8A" />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Nombre artístico (opcional)</span>
              <input name="alias" type="text" maxLength={50} className="field-input" placeholder="El nombre del duelo" />
            </label>
            <label className="block">
              <span className="field-label">Instagram (opcional)</span>
              <input name="instagram" type="text" maxLength={31} className="field-input" placeholder="@usuario" />
            </label>
          </div>
          <label className="block">
            <span className="field-label">Foto (opcional, máximo 3 MB)</span>
            <span className="photo-picker mt-2 flex min-h-28 cursor-pointer items-center gap-4 p-4">
              {preview ? <img src={preview} alt="Vista previa" className="size-20 rounded-xl object-cover" /> : <span className="grid size-14 place-items-center rounded-xl bg-cyan-100 text-cyan-800"><ImagePlus /></span>}
              <span className="text-sm text-secondary"><strong className="block text-primary">Elige una imagen</strong>JPG, PNG o WebP</span>
              <input
                name="foto"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  if (preview) URL.revokeObjectURL(preview)
                  setPreview(event.target.files?.[0] ? URL.createObjectURL(event.target.files[0]) : null)
                }}
              />
            </span>
          </label>

          {error && <p role="alert" className="notice-error">{error}</p>}

          <button type="submit" disabled={submitting} aria-busy={submitting} className="primary-action min-h-13 w-full">
            {submitting && <LoaderCircle className="animate-spin" size={18} />}
            {submitting ? 'Registrando...' : 'Quiero participar'}
          </button>
        </form>
      </div>
    </div>
  )
}
