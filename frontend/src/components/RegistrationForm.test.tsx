// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { RegistrationForm } from './RegistrationForm'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({ api: { register: vi.fn().mockResolvedValue({ message: 'Inscripción confirmada' }) } }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const roots: ReturnType<typeof createRoot>[] = []
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); vi.clearAllMocks() })
const props = { tournamentId: 'selected-call', tournamentName: 'Edición elegida', acceptingRegistrations: true, registered: false, registeredCount: 3, maxParticipants: 8 }
async function mount() {
  const node = document.createElement('div'); const root = createRoot(node); roots.push(root)
  await act(() => root.render(<RegistrationForm {...props} />))
  return { node, root }
}
it('submits to the selected call, resets safely, and confirms only once', async () => {
  const { node } = await mount()
  await act(async () => { node.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await vi.mocked(api.register).mock.results[0].value })
  expect(vi.mocked(api.register).mock.calls[0][0].get('tournamentId')).toBe('selected-call')
  expect(node.textContent).toContain('Convocatoria: Edición elegida')
  expect(node.querySelector('[role="alert"]')).toBeNull()
  await act(() => node.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(api.register).toHaveBeenCalledOnce()
})
it('preserves entered values and prevents submission when the call closes', async () => {
  const { node, root } = await mount()
  node.querySelector<HTMLInputElement>('[name="nombre"]')!.value = 'María'
  await act(() => root.render(<RegistrationForm {...props} acceptingRegistrations={false} />))
  expect(node.querySelector<HTMLInputElement>('[name="nombre"]')!.value).toBe('María')
  expect(node.querySelector('fieldset')!.disabled).toBe(true)
  await act(() => node.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(api.register).not.toHaveBeenCalled()
})
