/**
 * `setupNodeSelection` — click-to-select on a node element (#3267).
 *
 * The registry `<NodeWrapper>` calls it from its ref for every node; the
 * click → selected wiring through `<Flow>` is covered by the "Node
 * Selection" E2E in `site/ui/e2e/xyflow.spec.ts`. These pin the helper's
 * own contract: plain click selects only this node, shift-click toggles it
 * into the selection, non-primary buttons are ignored, and the listener
 * goes away with its owner.
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

async function setup() {
  const { createRoot } = await import('@barefootjs/client')
  const { createFlowStore } = await import('../store')
  const { setupNodeSelection } = await import('../selection')

  let dispose = () => {}
  const store = createRoot((d) => {
    dispose = d
    return createFlowStore({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b', selected: true }],
    })
  })
  const elA = document.createElement('div')
  const elB = document.createElement('div')
  createRoot((d) => {
    const prev = dispose
    dispose = () => {
      d()
      prev()
    }
    setupNodeSelection(elA, 'a', store)
    setupNodeSelection(elB, 'b', store)
  })

  const press = (el: HTMLElement, init: MouseEventInit = {}) =>
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...init }))
  const selectedIds = () =>
    store
      .nodes()
      .filter((n) => n.selected)
      .map((n) => n.id)

  return { store, elA, elB, press, selectedIds, dispose: () => dispose() }
}

describe('setupNodeSelection (#3267)', () => {
  test('a click selects the node and clears the rest of the selection', async () => {
    const { store, elA, elB, press, selectedIds } = await setup()
    press(elA)
    expect(selectedIds()).toEqual(['a'])
    expect(store.edges()[0].selected).toBe(false)

    press(elB)
    expect(selectedIds()).toEqual(['b'])
  })

  test('shift-click adds to the selection and toggles a selected node off', async () => {
    const { elA, elB, press, selectedIds } = await setup()
    press(elA)
    press(elB, { shiftKey: true })
    expect(selectedIds()).toEqual(['a', 'b'])

    press(elA, { shiftKey: true })
    expect(selectedIds()).toEqual(['b'])
  })

  test('ignores non-primary buttons', async () => {
    const { elA, press, selectedIds } = await setup()
    press(elA, { button: 2 })
    expect(selectedIds()).toEqual([])
  })

  test('removes its listener when the owner is disposed', async () => {
    const { elA, press, selectedIds, dispose } = await setup()
    dispose()
    press(elA)
    expect(selectedIds()).toEqual([])
  })
})
