import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, ImagePlus, LoaderCircle } from 'lucide-react'
import { api } from '../lib/api'

export function RegistrationForm({ onCreated }: { onCreated?: (message: string) => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const formData = new FormData(formElement)
    setSubmitting(true); setError(''); setSuccess('')
    try {
      const result = await api.register(formData)
      setSuccess(result.message); onCreated?.(result.message); formElement.reset()
      if (preview) URL.revokeObjectURL(preview)
      setPreview(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible completar tu inscripción.')
    } finally { setSubmitting(false) }
  }

  return (
    <form className="registration-form" onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label><span className="field-label">Nombre</span><input className="field-input" name="nombre" required minLength={2} maxLength={60} autoComplete="given-name" placeholder="Tu nombre" /></label>
        <label><span className="field-label">Apellidos</span><input className="field-input" name="apellidos" required minLength={2} maxLength={80} autoComplete="family-name" placeholder="Tus apellidos" /></label>
      </div>
      <div className="grid gap-5 sm:grid-cols-[.65fr_1.35fr]">
        <label><span className="field-label">Edad</span><input className="field-input" name="edad" type="number" inputMode="numeric" required min={15} max={99} placeholder="18" /></label>
        <label><span className="field-label">Carrera</span><input className="field-input" name="carrera" required minLength={2} maxLength={100} placeholder="Ej. Ingeniería de Software" /></label>
      </div>
      <label><span className="field-label">Cuatrimestre / grupo</span><input className="field-input" name="grupo" required maxLength={40} placeholder="Ej. 8A" /></label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label><span className="field-label">Nombre artístico <small>(opcional)</small></span><input className="field-input" name="alias" maxLength={50} placeholder="Nombre para la batalla" /></label>
        <label><span className="field-label">Instagram <small>(opcional)</small></span><input className="field-input" name="instagram" maxLength={31} placeholder="@usuario" /></label>
      </div>
      <label><span className="field-label">Foto <small>(opcional, máximo 3 MB)</small></span><span className="photo-picker mt-2 flex min-h-28 cursor-pointer items-center gap-4 p-4">{preview ? <img src={preview} alt="Vista previa de tu foto" className="size-20 rounded-xl object-cover" /> : <span className="grid size-14 place-items-center rounded-xl bg-cyan-100 text-cyan-800"><ImagePlus /></span>}<span className="text-sm text-secondary"><strong className="block text-primary">Selecciona tu foto</strong>JPG, PNG o WebP</span><input name="foto" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { if (preview) URL.revokeObjectURL(preview); setPreview(event.target.files?.[0] ? URL.createObjectURL(event.target.files[0]) : null) }} /></span></label>
      {error && <p role="alert" className="notice-error">{error}</p>}
      {success && <p role="status" className="notice-success flex items-start gap-2"><CheckCircle2 className="mt-0.5 shrink-0" size={18} />{success}</p>}
      <button className="primary-action min-h-13 w-full" disabled={submitting} aria-busy={submitting}>{submitting && <LoaderCircle className="animate-spin" size={18} />}{submitting ? 'Confirmando inscripción...' : 'Confirmar mi inscripción'}</button>
      <p className="text-center text-xs leading-5 text-muted">Al enviarla, tu lugar aparece de inmediato en la bandeja del torneo. Una inscripción por persona.</p>
    </form>
  )
}
