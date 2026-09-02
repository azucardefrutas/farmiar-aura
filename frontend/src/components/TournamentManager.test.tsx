// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { TournamentManager } from './TournamentManager'
import type { TournamentCall } from '../types'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const roots: ReturnType<typeof createRoot>[] = []
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()) })

const calls: TournamentCall[] = [
  { id: 'draft', name: 'Convocatoria de prueba', status: 'draft', format: 'single_elimination', isCurrent: false },
  { id: 'current', name: 'Convocatoria en vivo', status: 'registration', format: 'single_elimination', isCurrent: true },
]

async function mount(selectedId: string, canDelete = true) {
  const onDelete = vi.fn()
  const node = document.createElement('div')
  const root = createRoot(node); roots.push(root)
  await act(() => root.render(<TournamentManager
    calls={calls}
    selectedId={selectedId}
    busy={false}
    canDelete={canDelete}
    onDelete={onDelete}
    onSelect={vi.fn()}
    onCreate={vi.fn(async () => undefined)}
    onPublish={vi.fn()}
    onOpenRegistrations={vi.fn()}
  />))
  return { node, onDelete }
}

it('allows an administrator to delete a non-current call', async () => {
  const { node, onDelete } = await mount('draft')
  const button = [...node.querySelectorAll('button')].find((item) => item.textContent?.includes('Eliminar convocatoria'))!
  expect(button.disabled).toBe(false)
  await act(() => button.click())
  expect(onDelete).toHaveBeenCalledOnce()
})

it('blocks deletion of the call currently on stage', async () => {
  const { node, onDelete } = await mount('current')
  const button = [...node.querySelectorAll('button')].find((item) => item.textContent?.includes('Eliminar convocatoria'))!
  expect(button.disabled).toBe(true)
  expect(node.textContent).toContain('primero lleva otra convocatoria al escenario')
  await act(() => button.click())
  expect(onDelete).not.toHaveBeenCalled()
})

it('does not show the destructive action to collaborators', async () => {
  const { node } = await mount('draft', false)
  expect(node.textContent).not.toContain('Eliminar convocatoria')
})
