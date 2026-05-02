/**
 * `<Flow renderNode={Fn}>` hydrates the rendered bridge as a top-level
 * scope outside Flow's `FlowContext.Provider`, so consumers that look up
 * the store via `useFlow()` get back `undefined`. As an escape hatch,
 * `attachFlowSubsystems` stamps the host `<div class="bf-flow">` with
 * `__bfFlowStore` so children can walk up the DOM and read the store
 * without going through the context system.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

describe('attachFlowSubsystems exposes the store on the host element', () => {
  test('sets `__bfFlowStore` on the element it attaches to', async () => {
    // Lazy import so happy-dom globals are in place before xyflow loads.
    const { attachFlowSubsystems } = await import('../flow-subsystems')
    const { createFlowStore } = await import('../store')

    const el = document.createElement('div')
    el.className = 'bf-flow'
    document.body.appendChild(el)

    // biome-ignore lint/suspicious/noExplicitAny: minimal props for unit test
    const store = createFlowStore({} as any)
    // biome-ignore lint/suspicious/noExplicitAny: minimal props for unit test
    attachFlowSubsystems(el, store as any, {} as any)

    expect((el as HTMLElement & { __bfFlowStore?: unknown }).__bfFlowStore).toBe(store)
  })
})
