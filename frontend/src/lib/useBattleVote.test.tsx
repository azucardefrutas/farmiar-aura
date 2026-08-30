// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TournamentSnapshot } from '../types'
import { useBattleVote } from './useBattleVote'
import { api } from './api'

vi.mock('./api', () => ({ api: { vote: vi.fn().mockResolvedValue({ message: 'Voto confirmado' }) } }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const reload = vi.fn().mockResolvedValue(undefined)
const snapshot = { activeMatch: { id: 'battle-1', status: 'live' }, viewerVote: null } as TournamentSnapshot
let controls: ReturnType<typeof useBattleVote>
const roots: ReturnType<typeof createRoot>[] = []
function Harness({ data = snapshot }: { data?: TournamentSnapshot }) { controls = useBattleVote(data, reload); return null }
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); vi.clearAllMocks() })
async function render(data = snapshot) { const root = createRoot(document.createElement('div')); roots.push(root); await act(() => root.render(<Harness data={data} />)); return root }

describe('real vote or local omission', () => {
  it('omits without an HTTP vote, and allows changing one’s mind', async () => {
    await render()
    await act(() => controls.omit())
    expect(controls.omitted).toBe(true)
    expect(controls.canVote).toBe(false)
    await act(() => controls.vote('contestant-a'))
    expect(api.vote).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    await act(() => controls.omit())
    await act(() => controls.vote('contestant-a'))
    expect(api.vote).toHaveBeenCalledExactlyOnceWith('battle-1', 'contestant-a')
    expect(reload).toHaveBeenCalledOnce()
  })
  it('does not carry omission into another battle', async () => {
    const root = await render()
    await act(() => controls.omit())
    await act(() => root.render(<Harness data={{ ...snapshot, activeMatch: { ...snapshot.activeMatch!, id: 'battle-2' } }} />))
    expect(controls.omitted).toBe(false)
    expect(controls.canVote).toBe(true)
  })
  it('cannot vote or omit again after a confirmed vote', async () => {
    await render({ ...snapshot, viewerVote: { matchId: 'battle-1', contestantId: 'contestant-a' } })
    await act(() => controls.vote('contestant-b'))
    await act(() => controls.omit())
    expect(api.vote).not.toHaveBeenCalled()
    expect(controls.omitted).toBe(false)
  })
})
