// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ParticipationPage } from './ParticipationPage'
import { api } from '../lib/api'
import { subscribeToCalls } from '../lib/realtime'
vi.mock('../lib/api', () => ({ api: { registrationCalls: vi.fn() } }))
vi.mock('../lib/supabase', () => ({ ensureVoterSession: vi.fn().mockResolvedValue({}) }))
vi.mock('../lib/realtime', () => ({ subscribeToCalls: vi.fn().mockReturnValue(() => {}) }))
vi.mock('../components/PublicNavigation', () => ({ PublicNavigation: () => null }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const roots: ReturnType<typeof createRoot>[] = []
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); vi.clearAllMocks() })
async function mount() {
  const node = document.createElement('div'); const root = createRoot(node); roots.push(root)
  await act(async () => { root.render(<ParticipationPage />) })
  return node
}
const calls = [{ id: 'a', name: 'Primera edición', status: 'registration' as const, format: 'single_elimination' as const, isCurrent: true, registered: false, durationSeconds: 90, auraPerVote: 100 }, { id: 'b', name: 'Segunda edición', status: 'registration' as const, format: 'single_elimination' as const, isCurrent: false, registered: false, durationSeconds: 90, auraPerVote: 100 }]
it('does not report zero calls when the server request fails', async () => {
  vi.mocked(api.registrationCalls).mockRejectedValue(new Error('Servidor no disponible'))
  const node = await mount()
  expect(node.querySelector('[role="alert"]')?.textContent).toContain('Servidor no disponible')
  expect(node.textContent).not.toContain('Abiertas · 0')
  expect(node.textContent).not.toContain('No hay inscripciones abiertas')
})
it('keeps the chosen form and its values when realtime closes that call', async () => {
  vi.mocked(api.registrationCalls).mockResolvedValue({ calls })
  const node = await mount()
  expect(node.querySelector('form')).toBeNull()
  await act(async () => { node.querySelector<HTMLInputElement>('input[value="b"]')!.click() })
  const name = node.querySelector<HTMLInputElement>('input[name="nombre"]')!
  name.value = 'María'
  vi.mocked(api.registrationCalls).mockResolvedValue({ calls: [calls[0], { ...calls[1], status: 'ready' }] })
  const refresh = vi.mocked(subscribeToCalls).mock.calls[0][0]
  await act(async () => { await refresh() })
  expect(node.querySelector('form h2')?.textContent).toBe('Segunda edición')
  expect(name.value).toBe('María')
  expect(node.querySelector<HTMLFieldSetElement>('form fieldset')!.disabled).toBe(true)
})
