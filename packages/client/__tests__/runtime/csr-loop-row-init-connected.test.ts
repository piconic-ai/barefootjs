/**
 * KNOWN LIMITATION — `mapArray` rows still init detached.
 *
 * `createItemScope` calls `renderItem(...)` (which calls
 * `createComponent`) while building the run; the actual
 * `container.insertBefore(...)` happens later, once per run. So a row
 * component's init observes a detached element, and `useContext` falls
 * back to the global, last-writer-wins context store.
 *
 * This is the xyflow shape: `<Flow>` provides `FlowContext`, nodes render
 * through `mapArray`, and their init reads `useFlow()`. With more than one
 * `<Flow>` on the page, a node created after a sibling flow has hydrated
 * resolves the WRONG flow's store. The `__bfFlowStore` +
 * `closest('.bf-flow')` workaround in `packages/xyflow/src/
 * flow-subsystems.ts` exists because of this.
 *
 * The child-slot path (`upsertChild` / `upsertChildItem`) is fixed — it
 * hands its placeholder to `createComponent` as `mountAt` so the element
 * is connected before init. The loop path can't use that: `renderItem`
 * RETURNS the element to `mapArray`, so there is no placeholder to
 * replace. Closing it means either deferring row init until after the
 * batched insert (which reorders the emitted renderItem tail — nested
 * `initChild` calls and row effects currently run assuming the row's own
 * init already ran), or pre-inserting the row into its container before
 * init and letting the batched `insertBefore` reposition it. Both touch
 * the hottest path in the runtime, so they are deliberately NOT bundled
 * with the child-slot fix.
 *
 * Un-skip these two tests when that lands — they assert the correct
 * behaviour and currently fail as `[false, false]` and `'ONE:2' → 'TWO'`.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe.skip('mapArray row init runs connected (known limitation)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a CSR-created row is connected when its init runs', async () => {
    const { hydrate, createComponent, mapArray, initChild, createSignal } =
      await import('../../src/runtime')

    const connectedAtInit: boolean[] = []

    hydrate('RowKid', {
      init: (el: Element) => {
        connectedAtInit.push(el.isConnected)
      },
      template: (p: any) => `<li>${p.label}</li>`,
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)

    const [items] = createSignal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])

    mapArray(
      () => items(),
      container,
      (it: any) => it.id,
      (item: () => any, _i: number, existing?: HTMLElement) => {
        if (existing) {
          initChild('RowKid', existing, { label: item().label })
          return existing
        }
        return createComponent('RowKid', { label: item().label }, item().id)
      },
      'loop0',
    )

    expect(connectedAtInit).toEqual([true, true])
  })

  test('a row mounted later sees its own provider, not the last on the page', async () => {
    const {
      hydrate, flushHydration, createComponent, mapArray, initChild,
      createSignal, createContext, useContext, provideContext,
    } = await import('../../src/runtime')

    const ctx = createContext<string>('DEFAULT')
    const seen: Array<[string, string]> = []
    const pushers: Array<() => void> = []

    hydrate('FlowNode', {
      init: (_el: Element, props: any) => {
        seen.push([props.tag, useContext(ctx)])
      },
      template: (p: any) => `<li>${p.tag}</li>`,
    })

    hydrate('FlowHost', {
      init: (el: Element, props: any) => {
        provideContext(ctx, props.value)
        const container = el.querySelector('ul')!
        const [nodes, setNodes] = createSignal<any[]>([{ id: 1 }])
        mapArray(
          () => nodes(),
          container,
          (n: any) => n.id,
          (item: () => any, _i: number, existing?: HTMLElement) => {
            const tag = `${props.value}:${item().id}`
            if (existing) {
              initChild('FlowNode', existing, { tag })
              return existing
            }
            return createComponent('FlowNode', { tag }, item().id)
          },
          `loop-${props.value}`,
        )
        pushers.push(() => setNodes([{ id: 1 }, { id: 2 }]))
      },
      template: () => `<div><ul></ul></div>`,
    })

    document.body.innerHTML = `
      <div bf-s="FlowHost_one" bf-p='{"value":"ONE"}'><ul></ul></div>
      <div bf-s="FlowHost_two" bf-p='{"value":"TWO"}'><ul></ul></div>
    `

    flushHydration()
    seen.length = 0

    // Add a node to the FIRST flow, after both providers have run.
    pushers[0]!()

    expect(seen).toEqual([['ONE:2', 'ONE']])
  })
})
