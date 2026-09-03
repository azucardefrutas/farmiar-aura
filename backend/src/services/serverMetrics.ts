import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { performance } from 'node:perf_hooks'
import type { RequestHandler } from 'express'

const SAMPLE_WINDOW_MS = 5 * 60_000
const ONE_MINUTE_MS = 60_000

interface RequestSample {
  completedAt: number
  durationMs: number
  statusCode: number
}

export interface RequestSummary {
  active: number
  perMinute: number
  p95LatencyMs: number
  errorRatePercent: number
  sampleWindowMinutes: number
}

export interface ServerMetricsSnapshot {
  sampledAt: string
  source: 'render-container' | 'local-process'
  status: 'healthy' | 'warning'
  uptimeSeconds: number
  cpu: { percent: number; limitCores: number | null }
  memory: { usedBytes: number; limitBytes: number | null; percent: number | null }
  requests: RequestSummary
  eventLoopUtilizationPercent: number
}

export interface ServerMetricsCollector {
  middleware: RequestHandler
  snapshot(): Promise<ServerMetricsSnapshot>
}

function rounded(value: number, decimals = 1) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function summarizeRequests(samples: RequestSample[], now: number, active: number): RequestSummary {
  const recent = samples.filter((sample) => now - sample.completedAt <= SAMPLE_WINDOW_MS)
  const lastMinute = recent.filter((sample) => now - sample.completedAt <= ONE_MINUTE_MS)
  const orderedDurations = recent.map((sample) => sample.durationMs).sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(orderedDurations.length * 0.95) - 1)
  const failures = recent.filter((sample) => sample.statusCode >= 500).length

  return {
    active,
    perMinute: lastMinute.length,
    p95LatencyMs: orderedDurations.length ? Math.round(orderedDurations[p95Index] ?? 0) : 0,
    errorRatePercent: recent.length ? rounded((failures / recent.length) * 100, 2) : 0,
    sampleWindowMinutes: SAMPLE_WINDOW_MS / ONE_MINUTE_MS,
  }
}

async function readFirst(paths: string[]) {
  for (const path of paths) {
    try { return (await readFile(path, 'utf8')).trim() }
    catch { /* Not running inside this cgroup layout. */ }
  }
  return null
}

async function containerMemory() {
  const [usedText, limitText] = await Promise.all([
    readFirst(['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes']),
    readFirst(['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']),
  ])
  const used = Number(usedText)
  const limit = limitText === 'max' ? Number.NaN : Number(limitText)
  if (!Number.isFinite(used) || !Number.isSafeInteger(limit) || limit <= 0) return null
  return { usedBytes: used, limitBytes: limit }
}

async function containerCpuLimit() {
  const cpuMax = await readFirst(['/sys/fs/cgroup/cpu.max'])
  if (cpuMax) {
    const [quotaText, periodText] = cpuMax.split(/\s+/)
    const quota = Number(quotaText)
    const period = Number(periodText)
    if (quotaText !== 'max' && Number.isFinite(quota) && Number.isFinite(period) && period > 0) return quota / period
  }

  const [quotaText, periodText] = await Promise.all([
    readFirst(['/sys/fs/cgroup/cpu/cpu.cfs_quota_us']),
    readFirst(['/sys/fs/cgroup/cpu/cpu.cfs_period_us']),
  ])
  const quota = Number(quotaText)
  const period = Number(periodText)
  return Number.isFinite(quota) && quota > 0 && Number.isFinite(period) && period > 0 ? quota / period : null
}

export function createServerMetricsCollector(): ServerMetricsCollector {
  const samples: RequestSample[] = []
  let activeRequests = 0
  let previousCpu = process.cpuUsage()
  let previousCpuAt = process.hrtime.bigint()
  let previousEventLoop = performance.eventLoopUtilization()

  const middleware: RequestHandler = (_req, res, next) => {
    activeRequests += 1
    const startedAt = performance.now()
    let recorded = false
    const record = () => {
      if (recorded) return
      recorded = true
      activeRequests = Math.max(0, activeRequests - 1)
      const now = Date.now()
      samples.push({ completedAt: now, durationMs: performance.now() - startedAt, statusCode: res.statusCode })
      while (samples[0] && now - samples[0].completedAt > SAMPLE_WINDOW_MS) samples.shift()
    }
    res.once('finish', record)
    res.once('close', record)
    next()
  }

  return {
    middleware,
    async snapshot() {
      const now = Date.now()
      const [memoryLimit, cpuLimit] = await Promise.all([containerMemory(), containerCpuLimit()])
      const memoryUsage = process.memoryUsage()
      const usedBytes = memoryLimit?.usedBytes ?? memoryUsage.rss
      const limitBytes = memoryLimit?.limitBytes ?? null
      const memoryPercent = limitBytes ? rounded((usedBytes / limitBytes) * 100) : null

      const currentCpuAt = process.hrtime.bigint()
      const cpuDelta = process.cpuUsage(previousCpu)
      const wallMicroseconds = Number(currentCpuAt - previousCpuAt) / 1_000
      const allocatedCores = cpuLimit ?? Math.max(1, os.availableParallelism())
      const cpuPercent = wallMicroseconds > 0
        ? rounded(Math.min(100, ((cpuDelta.user + cpuDelta.system) / wallMicroseconds / allocatedCores) * 100))
        : 0
      previousCpu = process.cpuUsage()
      previousCpuAt = currentCpuAt

      const eventLoop = performance.eventLoopUtilization(previousEventLoop)
      previousEventLoop = performance.eventLoopUtilization()
      const eventLoopUtilizationPercent = rounded(eventLoop.utilization * 100)
      const requests = summarizeRequests(samples, now, Math.max(0, activeRequests - 1))
      const warning = cpuPercent >= 80
        || (memoryPercent !== null && memoryPercent >= 80)
        || requests.errorRatePercent >= 5
        || requests.p95LatencyMs >= 1_500
        || eventLoopUtilizationPercent >= 80

      return {
        sampledAt: new Date(now).toISOString(),
        source: memoryLimit || process.env.RENDER === 'true' ? 'render-container' : 'local-process',
        status: warning ? 'warning' : 'healthy',
        uptimeSeconds: Math.floor(process.uptime()),
        cpu: { percent: cpuPercent, limitCores: cpuLimit ? rounded(cpuLimit, 2) : null },
        memory: { usedBytes, limitBytes, percent: memoryPercent },
        requests,
        eventLoopUtilizationPercent,
      }
    },
  }
}
