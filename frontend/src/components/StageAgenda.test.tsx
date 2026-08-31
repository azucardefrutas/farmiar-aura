// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { StageAgenda } from './StageAgenda'
import type { StageSchedule } from '../types'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const roots: ReturnType<typeof createRoot>[] = []
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()) })
const stage: StageSchedule = { currentMatchId: null, nextMatchId: 'next', completed: 0, total: 2, pendingVoteSeconds: 180, queue: [
  { number: 1, matchId: 'now', status: 'finished', label: 'Semifinal', contestantA: 'A', contestantB: 'B', ready: true },
  { number: 2, matchId: 'next', status: 'scheduled', label: 'Gran final', contestantA: 'A', contestantB: 'C', ready: true },
] }
async function mount(data: StageSchedule, isCurrent = true) {
  const onStart = vi.fn()
  const node = document.createElement('div')
  const root = createRoot(node); roots.push(root)
  await act(() => root.render(<StageAgenda stage={data} isCurrent={isCurrent} onStart={onStart} />))
  return { node, onStart }
}
it('starts exactly the displayed next turn', async () => {
  const { node, onStart } = await mount(stage)
  await act(() => node.querySelector('button')!.click())
  expect(onStart).toHaveBeenCalledExactlyOnceWith('next')
  expect(node.textContent).toContain('A continuación · turno 2')
})
it.each(['live', 'paused'] as const)('cannot start a second fight while %s', async status => {
  const { node, onStart } = await mount({ ...stage, currentMatchId: 'now', queue: [{ ...stage.queue[0], status }, stage.queue[1]] })
  expect(node.querySelector('button')!.disabled).toBe(true)
  await act(() => node.querySelector('button')!.click())
  expect(onStart).not.toHaveBeenCalled()
})
it('does not allow a non-current call to start', async () => {
  const { node } = await mount(stage, false)
  expect(node.querySelector('button')!.disabled).toBe(true)
})
it('does not skip a pending opponent', async () => {
  const { node } = await mount({ ...stage, queue: [stage.queue[0], { ...stage.queue[1], ready: false }] })
  expect(node.querySelector('button')!.disabled).toBe(true)
})
