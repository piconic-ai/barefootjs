/**
 * `attachFlowSubsystems` must NOT stamp the store onto the host element.
 *
 * It used to, as an escape hatch for "descendants that miss `FlowContext`" —
 * on the premise that `<Flow renderNode={Fn}>` hydrates its children as a
 * top-level scope outside the `FlowContext.Provider`. That premise does not
 * hold in the rendered DOM: the provider's context map sits on the
 * `<div class="bf-flow">` host itself, which is an ancestor of every
 * `.bf-flow__node`, and `useContext` walks `parentElement` — so any connected
 * descendant resolves the store regardless of which scope it was hydrated as.
 * The one shape that genuinely failed was a child initialising while its row
 * was still detached, fixed at the root in the runtime (#2431).
 *
 * Nothing ever read the property, so it was a write-only global whose comment
 * asserted a live product defect that did not exist — and that misreading fed
 * a wrong priority call. This test pins the removal so it cannot come back
 * without a reader to justify it.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

describe('attachFlowSubsystems keeps no second store-lookup path', () => {
  test('does not stamp `__bfFlowStore` on the host element', async () => {
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

    expect((el as HTMLElement & { __bfFlowStore?: unknown }).__bfFlowStore).toBeUndefined()
    // The attach itself still has to have happened — otherwise this test
    // would pass against a no-op `attachFlowSubsystems`.
    expect(store.domNode()).toBe(el)
  })
})
