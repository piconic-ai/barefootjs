/**
 * `<Flow disableDefaultNodeStyles>` lets consumers opt out of the
 * per-node chrome (white background, dark border, padding, grab
 * cursor, centered text) injected by `attachFlowSubsystems`.
 *
 * The escape exists because `<NodeWrapper>`'s reactive className
 * binding rebuilds the class string from `(selected | group | child)`
 * state on every store update, wiping any consumer-added class
 * (`bf-flow__node--custom` or otherwise). With the flag on, no
 * `.bf-flow__node` chrome is in the injected stylesheet at all, so
 * the consumer doesn't need to fight the rebind.
 */
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

afterEach(() => {
  document.getElementById('bf-flow-styles')?.remove()
})

describe('attachFlowSubsystems disableDefaultNodeStyles', () => {
  test('default: emits .bf-flow__node chrome rules', async () => {
    const { attachFlowSubsystems } = await import('../flow-subsystems')
    const { createFlowStore } = await import('../store')
    const el = document.createElement('div')
    document.body.appendChild(el)
    // biome-ignore lint/suspicious/noExplicitAny: minimal props for unit test
    const store = createFlowStore({} as any)
    // biome-ignore lint/suspicious/noExplicitAny: minimal props for unit test
    attachFlowSubsystems(el, store as any, {} as any)
    const css = document.getElementById('bf-flow-styles')!.textContent ?? ''
    expect(css).toContain('background-color: #fff')
    expect(css).toContain('cursor: grab')
  })

  test('disableDefaultNodeStyles: omits .bf-flow__node chrome rules', async () => {
    const { attachFlowSubsystems } = await import('../flow-subsystems')
    const { createFlowStore } = await import('../store')
    const el = document.createElement('div')
    document.body.appendChild(el)
    // biome-ignore lint/suspicious/noExplicitAny: minimal props for unit test
    const store = createFlowStore({} as any)
    // biome-ignore lint/suspicious/noExplicitAny: minimal props for unit test
    attachFlowSubsystems(el, store as any, { disableDefaultNodeStyles: true } as any)
    const css = document.getElementById('bf-flow-styles')!.textContent ?? ''
    expect(css).not.toContain('background-color: #fff')
    expect(css).not.toContain('cursor: grab')
    // Layout/edge/handle/resize rules still ship.
    expect(css).toContain('.bf-flow__edge')
    expect(css).toContain('.bf-flow__handle')
    expect(css).toContain('.bf-flow__resize-handle')
  })
})
