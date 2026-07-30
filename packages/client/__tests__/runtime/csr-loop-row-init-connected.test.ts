/**
 * Loop rows init CONNECTED — the `createComponent` row shape (fixed), and the
 * template-clone row shape (still open).
 *
 * A loop row has no placeholder to replace, so it could not use the
 * `mountAt` "connect before init" contract that the child-slot path
 * (`upsertChild` / `upsertChildItem`) uses. Its `init` therefore observed a
 * detached element, and `useContext` fell back to the global,
 * last-writer-wins context store: with more than one provider of the same
 * context on the page, a row created after a sibling provider had hydrated
 * resolved the WRONG provider's value.
 *
 * FIXED for rows whose root comes from `createComponent` (a component loop,
 * `items.map(i => <Row item={i}/>)` — the xyflow node shape). `mapArray`
 * hands the row's container + anchor down via `setRowMountPoint`, and the
 * outermost `createComponent` inside `renderItem` connects there before
 * running `init` — the same guarantee `mountAt` gives, applied to a shape
 * that has no placeholder. The reorder needs no change: a mounted row
 * participates in the LIS walk like any other attached scope, and the LIS
 * argument never depended on new rows being absent from it.
 *
 * STILL OPEN for rows whose root is a TEMPLATE CLONE (composite / plain
 * loops — an inline-markup or Fragment loop body). There is no
 * `createComponent` for the row root to hand a mount point to; the clone is
 * only handed to `mapArray` as `renderItem`'s return value, by which time
 * the row's nested `upsertChild` children have already initialised against a
 * detached row. Closing that requires the emitted body to hand the element
 * over BEFORE its tail runs — a compiler-side change. Pinned by the skipped
 * test at the bottom.
 *
 * WHY THE TWO EARLIER ATTEMPTS FAILED (both measured by running site/ui e2e
 * locally; the counts below are deltas against whatever that same local run
 * reported for the unmodified branch, which is the only comparison they
 * support — CI is the authority on absolute pass/fail):
 *
 *   1. Defer row init until after the batched insert  →  6 failed
 *      (+3 `file-upload`: per-row start / progress / remove).
 *      `createComponent` is atomic and must stay so: getter `children` are
 *      deliberately evaluated AFTER `initFn` (`component.ts` step 10) so the
 *      row's own context providers are in place first. The renderItem tail's
 *      `insert(__csrEl, '^sN', ...)` calls resolve conditional-slot markers
 *      that live inside exactly that getter-children HTML, so deferring init
 *      also defers the markers into existence and the branch slots never
 *      wire up. Splitting `createComponent` is the wrong seam.
 *
 *   2. Park the row in its container before init, but EXCLUDE fresh rows from
 *      the LIS walk  →  7 failed (+4 `file-upload`, i.e. worse).
 *      The exclusion is what broke it: a row that is in the DOM but absent
 *      from `domOrderIndices` makes the walk disagree with the live DOM, and
 *      the reorder then computes its runs against a stale picture. Parking is
 *      right; excluding is not.
 *
 * `qsa-item.ts`'s documented reliance on detachment (its step 3, the
 * `__bfExtras` stash) is real but was NOT what broke attempt 2 — none of the
 * three components in that e2e baseline (`file-upload-demo`,
 * `form-builder-demo`, `studio-canvas`) emits `qsaItem`, `upsertChildItem`,
 * or `__bfExtras` at all, because the multi-root path only applies to
 * Fragment loop bodies. Multi-root rows never take the `createComponent` row
 * path either, so `createItemScope` un-parks a row that turns out to carry
 * extras rather than leaving it half-inserted.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('mapArray row init runs connected', () => {
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

  test('mounting the row before init does not change the reconciled order', async () => {
    const { hydrate, createComponent, mapArray, initChild, createSignal } =
      await import('../../src/runtime')

    hydrate('OrderKid', {
      init: () => {},
      template: (p: any) => `<li>${p.label}</li>`,
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)

    const [items, setItems] = createSignal([{ id: 2, label: 'b' }])

    mapArray(
      () => items(),
      container,
      (it: any) => String(it.id),
      (item: () => any, _i: number, existing?: HTMLElement) => {
        if (existing) {
          initChild('OrderKid', existing, { label: item().label })
          return existing
        }
        return createComponent('OrderKid', { label: item().label }, item().id)
      },
      'loop-order',
    )

    // A fresh row that belongs BEFORE the existing one is mounted at the end
    // of the range first, so the reorder has to move something. Both orders
    // below must come out exactly as the array says.
    setItems([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])
    expect([...container.querySelectorAll('li')].map(el => el.textContent)).toEqual(['a', 'b'])

    setItems([{ id: 3, label: 'c' }, { id: 2, label: 'b' }, { id: 1, label: 'a' }])
    expect([...container.querySelectorAll('li')].map(el => el.textContent)).toEqual(['c', 'b', 'a'])
  })
})

/**
 * KNOWN LIMITATION — a composite / plain loop row (template clone) still
 * initialises its nested children detached. See the header: the row root is
 * never handed to `mapArray` until `renderItem` returns, so there is no
 * mount point to give it, and `upsertChild` connects the child relative to a
 * still-detached row.
 *
 * Un-skip when the emitted renderItem body hands its element over before the
 * tail runs. Currently fails as `[false, false]`.
 */
describe.skip('composite loop row nested child init runs connected (known limitation)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a nested child of a template-cloned row is connected at init', async () => {
    const { hydrate, mapArray, createSignal, upsertChild } = await import('../../src/runtime')

    const connectedAtInit: boolean[] = []

    hydrate('Inner', {
      init: (el: Element) => { connectedAtInit.push(el.isConnected) },
      template: () => `<span>inner</span>`,
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    const [items] = createSignal([{ id: 1 }, { id: 2 }])

    mapArray(
      () => items(),
      container,
      (it: any) => String(it.id),
      (_item: () => any, _i: number, existing?: HTMLElement) => {
        if (existing) return existing
        const tpl = document.createElement('template')
        tpl.innerHTML = `<li><span data-bf-ph="Inner"></span></li>`
        const el = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement
        upsertChild(el, 'Inner', null, {})
        return el
      },
      'loop0',
    )

    expect(connectedAtInit).toEqual([true, true])
  })
})
