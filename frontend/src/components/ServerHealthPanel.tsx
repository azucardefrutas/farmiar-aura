import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Activity, CheckCircle2, Clock3, Database, Gauge, MemoryStick, RefreshCw, Server, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api'
import type { ServerMetrics } from '../types'

const POLL_INTERVAL_MS = 5_000

type MetricsLoader = (token: string, signal?: AbortSignal) => Promise<ServerMetrics>

interface Props {
  token: string
  loadMetrics?: MetricsLoader
}

interface HistoryPoint {
  sampledAt: string
  cpu: number
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days) return `${days} d ${hours} h`
  if (hours) return `${hours} h ${minutes} min`
  return `${minutes} min`
}

function statusCopy(status: ServerMetrics['status']) {
  if (status === 'critical') return { label: 'Requiere atención', detail: 'La base de datos no respondió.', icon: <TriangleAlert size={16} /> }
  if (status === 'warning') return { label: 'Carga elevada', detail: 'Hay una métrica cerca del límite preventivo.', icon: <TriangleAlert size={16} /> }
  return { label: 'Operando normal', detail: 'El servidor tiene margen disponible.', icon: <CheckCircle2 size={16} /> }
}

export function ServerHealthPanel({ token, loadMetrics = api.serverMetrics }: Props) {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await loadMetrics(token, signal)
      if (signal?.aborted) return
      setMetrics(next)
      setHistory((current) => [...current, { sampledAt: next.sampledAt, cpu: next.cpu.percent }].slice(-24))
      setError('')
    } catch (caught) {
      if (signal?.aborted) return
      setError(caught instanceof Error ? caught.message : 'No fue posible leer la telemetría.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [loadMetrics, token])

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const schedule = () => { timer = window.setTimeout(poll, POLL_INTERVAL_MS) }
    const poll = async () => {
      if (!document.hidden) await refresh(controller.signal)
      if (!controller.signal.aborted) schedule()
    }
    const resume = () => {
      if (document.hidden || controller.signal.aborted) return
      if (timer) window.clearTimeout(timer)
      void poll()
    }

    void poll()
    document.addEventListener('visibilitychange', resume)
    return () => {
      controller.abort()
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [refresh, refreshKey])

  const status = metrics ? statusCopy(metrics.status) : null
  const memoryValue = metrics
    ? metrics.memory.limitBytes
      ? `${formatBytes(metrics.memory.usedBytes)} / ${formatBytes(metrics.memory.limitBytes)}`
      : formatBytes(metrics.memory.usedBytes)
    : '—'

  return (
    <section id="servidor" className="admin-section server-health scroll-mt-6" aria-labelledby="server-health-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Telemetría en vivo</p>
          <h2 id="server-health-title">Servidor del torneo</h2>
        </div>
        <div className="server-health-actions">
          {status && <span className={`server-status server-status-${metrics?.status}`}>{status.icon}{status.label}</span>}
          <button type="button" className="compact-action" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading} aria-label="Actualizar estadísticas del servidor">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      <div className="server-health-context">
        <div><span className="server-pulse" aria-hidden="true" /><p><strong>Datos reales del proceso en Render</strong><small>Se consultan cada 5 segundos solo mientras este panel está abierto.</small></p></div>
        {metrics && <time dateTime={metrics.sampledAt}>Última lectura {new Date(metrics.sampledAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>}
      </div>

      {error && <p role="alert" className="notice-error server-health-error">{error} {metrics && 'Se conserva la última lectura válida.'}</p>}
      {!metrics && loading ? <div className="server-health-skeleton" aria-label="Cargando estadísticas reales" /> : metrics && <>
        <div className="server-metrics-grid" aria-live="polite">
          <ServerMetric icon={<Gauge size={18} />} label="CPU" value={`${metrics.cpu.percent.toFixed(1)}%`} detail={metrics.cpu.limitCores ? `de ${metrics.cpu.limitCores} CPU asignada` : 'del proceso'} percent={metrics.cpu.percent} />
          <ServerMetric icon={<MemoryStick size={18} />} label="Memoria" value={memoryValue} detail={metrics.memory.percent === null ? 'RSS del proceso' : `${metrics.memory.percent.toFixed(1)}% del límite`} percent={metrics.memory.percent ?? undefined} />
          <ServerMetric icon={<Activity size={18} />} label="Solicitudes" value={`${metrics.requests.perMinute}/min`} detail={`${metrics.requests.active} activas ahora`} />
          <ServerMetric icon={<Clock3 size={18} />} label="Latencia API p95" value={`${metrics.requests.p95LatencyMs} ms`} detail={`ventana de ${metrics.requests.sampleWindowMinutes} min`} />
          <ServerMetric icon={<TriangleAlert size={18} />} label="Errores del servidor" value={`${metrics.requests.errorRatePercent.toFixed(2)}%`} detail="respuestas 5xx recientes" />
          <ServerMetric icon={<Database size={18} />} label="Supabase" value={metrics.database.reachable ? `${metrics.database.latencyMs} ms` : 'Sin respuesta'} detail={metrics.database.reachable ? 'conexión confirmada' : 'revisa la conexión'} />
        </div>

        <div className="server-health-footer">
          <div className="server-history-copy"><Server size={18} /><p><strong>{status?.detail}</strong><small>Activo hace {formatUptime(metrics.uptimeSeconds)} · bucle de eventos {metrics.eventLoopUtilizationPercent.toFixed(1)}%</small></p></div>
          <div className="server-history" aria-label={`Historial de CPU de ${history.length} lecturas reales`}>
            {history.map((point) => <span key={point.sampledAt} style={{ height: `${Math.max(1, Math.min(100, point.cpu))}%` }} title={`${point.cpu.toFixed(1)}% CPU`} />)}
          </div>
        </div>
      </>}
      <p className="server-health-note">Mide esta API y su contenedor; no incluye facturación ni el tráfico interno de toda la plataforma Render. El número de colaboradores conectados se muestra por separado con Supabase Presence.</p>
    </section>
  )
}

function ServerMetric({ icon, label, value, detail, percent }: { icon: ReactNode; label: string; value: string; detail: string; percent?: number }) {
  return <article className="server-metric">
    <div className="server-metric-label"><span>{icon}</span><p>{label}</p></div>
    <strong>{value}</strong>
    <small>{detail}</small>
    {percent !== undefined && <div className="server-meter" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>}
  </article>
}
