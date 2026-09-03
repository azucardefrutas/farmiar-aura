import { describe, expect, it } from 'vitest'
import { summarizeRequests } from './serverMetrics.js'

describe('summarizeRequests', () => {
  it('calculates real recent traffic, p95 latency and server error rate', () => {
    const now = 1_000_000
    const summary = summarizeRequests([
      { completedAt: now - 10_000, durationMs: 20, statusCode: 200 },
      { completedAt: now - 20_000, durationMs: 80, statusCode: 500 },
      { completedAt: now - 70_000, durationMs: 40, statusCode: 200 },
      { completedAt: now - 400_000, durationMs: 900, statusCode: 500 },
    ], now, 2)

    expect(summary).toEqual({
      active: 2,
      perMinute: 2,
      p95LatencyMs: 80,
      errorRatePercent: 33.33,
      sampleWindowMinutes: 5,
    })
  })

  it('returns a stable zero state without inventing activity', () => {
    expect(summarizeRequests([], Date.now(), 0)).toEqual({
      active: 0,
      perMinute: 0,
      p95LatencyMs: 0,
      errorRatePercent: 0,
      sampleWindowMinutes: 5,
    })
  })
})
