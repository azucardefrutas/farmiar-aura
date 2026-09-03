// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ServerHealthPanel } from './ServerHealthPanel'
import type { ServerMetrics } from '../types'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const roots: ReturnType<typeof createRoot>[] = []
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()) })

const metrics: ServerMetrics = {
  sampledAt: '2026-09-03T02:00:00.000Z',
  source: 'render-container',
  status: 'healthy',
  uptimeSeconds: 3_720,
  cpu: { percent: 3.2, limitCores: 0.5 },
  memory: { usedBytes: 100 * 1024 * 1024, limitBytes: 512 * 1024 * 1024, percent: 19.5 },
  requests: { active: 2, perMinute: 14, p95LatencyMs: 82, errorRatePercent: 0, sampleWindowMinutes: 5 },
  eventLoopUtilizationPercent: 1.4,
  database: { reachable: true, latencyMs: 36 },
}

it('shows only the real telemetry returned by the protected API', async () => {
  const loadMetrics = vi.fn().mockResolvedValue(metrics)
  const node = document.createElement('div')
  const root = createRoot(node)
  roots.push(root)

  await act(async () => { root.render(<ServerHealthPanel token="admin-token" loadMetrics={loadMetrics} />) })

  expect(loadMetrics).toHaveBeenCalledWith('admin-token', expect.any(AbortSignal))
  expect(node.textContent).toContain('Operando normal')
  expect(node.textContent).toContain('3.2%')
  expect(node.textContent).toContain('100 MB / 512 MB')
  expect(node.textContent).toContain('14/min')
  expect(node.textContent).toContain('36 ms')
  expect(node.textContent).toContain('Datos reales del proceso en Render')
})
