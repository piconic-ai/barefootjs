/**
 * Unit tests for `mapArrayLazy` — the lazy row graph runtime
 * (spec/slot-unification.md §9, L2 of the stacked series).
 *
 * The row plans built here stand in for what the L3 compiler will emit:
 * `createRow` fully writes a row and records refs/dedup with no scan,
 * `applyItem` claims refs lazily on the first item-driven write, and
 * `applyOuter` applies outer-involving bindings to every entry with
 * read-compare-write seeding on its first run (§9.3(1)).
 */

import { describe, test, expect, beforeAll, beforeEach, spyOn } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const { createSignal, createSelector } = await import('../src/reactive')
const { mapArrayLazy } = await import('../src/runtime/map-array-lazy')
type LazyRowEntry<T> = import('../src/runtime/map-array-lazy').LazyRowEntry<T>
type LazyRowPlan<T> = import('../src/runtime/map-array-lazy').LazyRowPlan<T>

type Item = { id: string; label: string }

const item = (id: string, label: string): Item => ({ id, label })
const keyOf = (it: Item) => it.id

/** SSR-shaped row markup: `<li data-key=K class=C><span>LABEL</span></li>`. */
const rowHtml = (key: string | null, label: string, cls?: string) =>
  `<li${key !== null ? ` data-key="${key}"` : ''}${cls !== undefined ? ` class="${cls}"` : ''}><span>${label}</span></li>`

/** Container with scoped loop markers wrapping SSR-rendered rows. */
function ssrContainer(rowsHtml: string): HTMLElement {
  document.body.innerHTML = ''
  const parent = document.createElement('ul')
  parent.innerHTML = `<!--bf-loop:l0-->${rowsHtml}<!--bf-/loop:l0-->`
  document.body.appendChild(parent)
  return parent
}

type Refs = { label: Text }
type Last = { label?: string; cls?: string }

/**
 * Build a spy-instrumented row plan of the shape the compiler will emit.
 *
 * - `selected` (optional): an outer signal accessor. When given, rows carry
 *   a mixed item+outer `class` binding (`selected() === item.id`) that
 *   `createRow` writes eagerly and `applyItem` re-applies non-reactively.
 * - `withOuter`: also emit `applyOuter` for the class binding (the
 *   loop-level reactive side).
 * - `setKeyInCreate: false`: createRow skips `data-key` so the runtime's
 *   stamping path is observable.
 */
function makePlan(opts: {
  selected?: () => string
  withOuter?: boolean
  setKeyInCreate?: boolean
} = {}) {
  const createRowCalls: string[] = []
  const applyItemCalls: Array<{ key: string; prev: Item; next: Item }> = []
  const applyOuterCalls: Array<{ seed: boolean; keys: string[] }> = []
  let claimCount = 0

  // Lazy claim: scan within this one row, cached on entry.refs by applyItem.
  const claim = (entry: LazyRowEntry<Item>): Refs => {
    claimCount++
    const span = entry.primaryEl.querySelector('span')!
    if (!span.firstChild) span.appendChild(document.createTextNode(''))
    return { label: span.firstChild as Text }
  }

  const plan: LazyRowPlan<Item> = {
    createRow(entry, _index) {
      createRowCalls.push(entry.key)
      const li = document.createElement('li')
      if (opts.setKeyInCreate !== false) li.setAttribute('data-key', entry.key)
      const span = document.createElement('span')
      const text = document.createTextNode(entry.item.label)
      span.appendChild(text)
      li.appendChild(span)
      const last: Last = { label: entry.item.label }
      if (opts.selected) {
        // Contract: createRow writes ALL bindings, outer-involving included,
        // with current values — this outer-signal read must NOT subscribe
        // the reconciler (the runtime untracks createRow).
        const cls = opts.selected() === entry.item.id ? 'sel' : ''
        li.setAttribute('class', cls)
        last.cls = cls
      }
      entry.refs = { label: text }
      entry.last = last
      return li
    },
    applyItem(entry, prevItem) {
      applyItemCalls.push({ key: entry.key, prev: prevItem, next: entry.item })
      const refs = (entry.refs ?? (entry.refs = claim(entry))) as Refs
      const last = (entry.last ?? (entry.last = {})) as Last
      // Adopted rows seed their item-driven dedup from the previous item
      // (trusted hydration-consistent per §9.3(2)).
      if (last.label === undefined) last.label = prevItem.label
      if (last.label !== entry.item.label) {
        refs.label.nodeValue = entry.item.label
        last.label = entry.item.label
      }
      if (opts.selected) {
        // Mixed binding: non-reactive outer read (runtime untracks applyItem).
        const cls = opts.selected() === entry.item.id ? 'sel' : ''
        if (last.cls !== cls) {
          entry.primaryEl.setAttribute('class', cls)
          last.cls = cls
        }
      }
    },
  }

  if (opts.withOuter) {
    plan.applyOuter = (list, seed) => {
      const sel = opts.selected!() // the outer-signal read the effect subscribes to
      applyOuterCalls.push({ seed, keys: list.map((e) => e.key) })
      for (const en of list) {
        const cls = sel === en.item.id ? 'sel' : ''
        const last = (en.last ?? (en.last = {})) as Last
        if (seed) {
          // Read-compare-write seeding (§9.3(1)): read current DOM state,
          // write only where the computed value differs.
          const dom = en.primaryEl.getAttribute('class') ?? ''
          last.cls = dom
          if (dom !== cls) {
            en.primaryEl.setAttribute('class', cls)
            last.cls = cls
          }
        } else if (last.cls !== cls) {
          en.primaryEl.setAttribute('class', cls)
          last.cls = cls
        }
      }
    }
  }

  return { plan, createRowCalls, applyItemCalls, applyOuterCalls, claims: () => claimCount }
}

describe('mapArrayLazy — hydration adoption', () => {
  test('adoption performs zero DOM mutations', () => {
    const a = item('1', 'A')
    const b = item('2', 'B')
    const [items] = createSignal([a, b])
    const container = ssrContainer(rowHtml('1', 'A') + rowHtml('2', 'B'))
    const before = container.innerHTML

    const { plan, createRowCalls, applyItemCalls } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    expect(container.innerHTML).toBe(before)
    expect(createRowCalls.length).toBe(0)
    expect(applyItemCalls.length).toBe(0)
  })

  test('adopted rows without data-key fall back to getKey and are NOT stamped', () => {
    const a = item('1', 'A')
    const [items, setItems] = createSignal([a])
    const container = ssrContainer(rowHtml(null, 'A'))
    const before = container.innerHTML

    const { plan } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    // No data-key write on the adopted row — byte-identical adoption.
    expect(container.innerHTML).toBe(before)
    expect(container.querySelector('li')!.hasAttribute('data-key')).toBe(false)

    // The getKey fallback keyed the entry correctly: a same-key item change
    // updates the adopted row in place.
    setItems([item('1', 'A2')])
    expect(container.querySelector('span')!.textContent).toBe('A2')
  })

  test('SSR-fewer-than-items: missing rows are created via plan.createRow', () => {
    const [items] = createSignal([item('1', 'A'), item('2', 'B'), item('3', 'C')])
    const container = ssrContainer(rowHtml('1', 'A'))
    const adopted = container.querySelector('li')!

    const { plan, createRowCalls } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    expect(createRowCalls).toEqual(['2', '3'])
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(3)
    expect(lis[0]).toBe(adopted)
    expect(lis[1].getAttribute('data-key')).toBe('2')
    expect(lis[2].getAttribute('data-key')).toBe('3')
    expect(lis[2].textContent).toBe('C')
    // Created rows land inside the loop range (before the end marker).
    expect(lis[2].nextSibling!.nodeValue).toBe('bf-/loop:l0')
  })

  test('SSR-more-than-items: orphaned rows are removed, adopted rows untouched', () => {
    const [items] = createSignal([item('1', 'A'), item('2', 'B')])
    const container = ssrContainer(rowHtml('1', 'A') + rowHtml('2', 'B') + rowHtml('3', 'C'))

    const { plan, createRowCalls, applyItemCalls } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(lis[0].outerHTML).toBe(rowHtml('1', 'A'))
    expect(lis[1].outerHTML).toBe(rowHtml('2', 'B'))
    expect(createRowCalls.length).toBe(0)
    expect(applyItemCalls.length).toBe(0)
  })
})

describe('mapArrayLazy — item-driven updates', () => {
  test('item change calls applyItem with prev item, updates DOM, claims refs once', () => {
    const b = item('2', 'B')
    const [items, setItems] = createSignal([item('1', 'A'), b])
    const container = ssrContainer(rowHtml('1', 'A') + rowHtml('2', 'B'))

    const { plan, applyItemCalls, claims } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')
    expect(claims()).toBe(0) // adoption never claims

    setItems([item('1', 'A2'), b])
    expect(applyItemCalls.length).toBe(1)
    expect(applyItemCalls[0].key).toBe('1')
    expect(applyItemCalls[0].prev.label).toBe('A')
    expect(applyItemCalls[0].next.label).toBe('A2')
    expect(container.querySelectorAll('span')[0].textContent).toBe('A2')
    expect(claims()).toBe(1)

    // Second update to the same row: refs are cached, no re-claim.
    setItems([item('1', 'A3'), b])
    expect(container.querySelectorAll('span')[0].textContent).toBe('A3')
    expect(claims()).toBe(1)
  })

  test('unchanged items (same identity) do not call applyItem', () => {
    const a = item('1', 'A')
    const b = item('2', 'B')
    const [items, setItems] = createSignal([a, b])
    const container = ssrContainer(rowHtml('1', 'A') + rowHtml('2', 'B'))

    const { plan, applyItemCalls, claims } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    // New array, same item identities — reconcile runs, no row work.
    setItems([a, b])
    expect(applyItemCalls.length).toBe(0)
    expect(claims()).toBe(0)

    // Only the changed row is applied.
    setItems([a, item('2', 'B2')])
    expect(applyItemCalls.length).toBe(1)
    expect(applyItemCalls[0].key).toBe('2')
  })
})

describe('mapArrayLazy — CSR create / remove / reorder / clear', () => {
  test('CSR append creates via plan.createRow with data-key stamped by the runtime', () => {
    const a = item('1', 'A')
    const [items, setItems] = createSignal([a])
    const container = ssrContainer(rowHtml('1', 'A'))

    // createRow does NOT set data-key — the runtime must stamp it.
    const { plan, createRowCalls } = makePlan({ setKeyInCreate: false })
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    setItems([a, item('2', 'B')])
    expect(createRowCalls).toEqual(['2'])
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(lis[1].getAttribute('data-key')).toBe('2')
    expect(lis[1].textContent).toBe('B')
  })

  test('CSR mount (no SSR rows) creates every row', () => {
    const [items] = createSignal([item('1', 'A'), item('2', 'B')])
    const container = ssrContainer('')

    const { plan, createRowCalls } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    expect(createRowCalls).toEqual(['1', '2'])
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(lis[0].getAttribute('data-key')).toBe('1')
    expect(lis[1].getAttribute('data-key')).toBe('2')
  })

  test('removal detaches the row', () => {
    const a = item('1', 'A')
    const c = item('3', 'C')
    const [items, setItems] = createSignal([a, item('2', 'B'), c])
    const container = ssrContainer(rowHtml('1', 'A') + rowHtml('2', 'B') + rowHtml('3', 'C'))

    const { plan } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')
    const removed = container.querySelectorAll('li')[1]

    setItems([a, c])
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(removed.isConnected).toBe(false)
    expect(lis[0].getAttribute('data-key')).toBe('1')
    expect(lis[1].getAttribute('data-key')).toBe('3')
  })

  test('swap reorder preserves element identity (LIS path)', () => {
    const a = item('1', 'A')
    const b = item('2', 'B')
    const c = item('3', 'C')
    const [items, setItems] = createSignal([a, b, c])
    const container = ssrContainer(rowHtml('1', 'A') + rowHtml('2', 'B') + rowHtml('3', 'C'))

    const { plan, applyItemCalls, createRowCalls } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    const [elA, elB, elC] = Array.from(container.querySelectorAll('li'))

    // Swap first and last — same item identities, pure reorder.
    setItems([c, b, a])
    const lis = container.querySelectorAll('li')
    expect(lis[0]).toBe(elC)
    expect(lis[1]).toBe(elB)
    expect(lis[2]).toBe(elA)
    expect(applyItemCalls.length).toBe(0)
    expect(createRowCalls.length).toBe(0)
  })

  test('clear-all fast path empties the range and preserves markers', () => {
    const [items, setItems] = createSignal([item('1', 'A'), item('2', 'B')])
    const container = ssrContainer(rowHtml('1', 'A') + rowHtml('2', 'B'))

    const { plan, createRowCalls } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    setItems([])
    expect(container.querySelectorAll('li').length).toBe(0)
    expect(container.innerHTML).toBe('<!--bf-loop:l0--><!--bf-/loop:l0-->')

    // The list is fully forgotten: repopulating creates fresh rows in range.
    setItems([item('1', 'A')])
    expect(createRowCalls).toEqual(['1'])
    expect(container.querySelectorAll('li').length).toBe(1)
    expect(container.innerHTML).toBe(
      `<!--bf-loop:l0-->${rowHtml('1', 'A')}<!--bf-/loop:l0-->`,
    )
  })

  test('clear-all without markers bulk-clears the container', () => {
    document.body.innerHTML = ''
    const container = document.createElement('ul')
    document.body.appendChild(container)
    const [items, setItems] = createSignal([item('1', 'A'), item('2', 'B')])

    const { plan } = makePlan()
    mapArrayLazy(items, container, keyOf, plan)

    expect(container.children.length).toBe(2)
    setItems([])
    expect(container.children.length).toBe(0)
  })
})

describe('mapArrayLazy — duplicate-key warning', () => {
  test('warns once per unique duplicate key per reconcile', () => {
    const warnSpy = spyOn(console, 'warn')
    warnSpy.mockClear()
    const filterDupWarns = () =>
      warnSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('duplicate key'),
      )

    const [items] = createSignal([item('x', 'A'), item('x', 'B'), item('x', 'C')])
    const container = ssrContainer('')
    const { plan } = makePlan()
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    expect(filterDupWarns().length).toBe(1)
    expect(filterDupWarns()[0][0]).toContain('"x"')
  })
})

describe('mapArrayLazy — applyOuter loop-level effect', () => {
  test('seed=true exactly once; consistent SSR state produces zero writes', () => {
    const [selected] = createSignal('1')
    const a = item('1', 'A')
    const b = item('2', 'B')
    const [items] = createSignal([a, b])
    // SSR classes already agree with selected() === '1'.
    const container = ssrContainer(rowHtml('1', 'A', 'sel') + rowHtml('2', 'B', ''))
    const before = container.innerHTML

    const { plan, applyOuterCalls } = makePlan({ selected, withOuter: true })
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    expect(applyOuterCalls.length).toBe(1)
    expect(applyOuterCalls[0].seed).toBe(true)
    expect(applyOuterCalls[0].keys).toEqual(['1', '2'])
    // Read-compare-write: no divergence, no mutation.
    expect(container.innerHTML).toBe(before)
  })

  test('seed run patches only where computed value differs from DOM', () => {
    // Client-only outer state diverges from what SSR rendered (§9.3(1)):
    // SSR marked row 1 selected, but the client signal starts at '2'.
    const [selected] = createSignal('2')
    const [items] = createSignal([item('1', 'A'), item('2', 'B')])
    const container = ssrContainer(rowHtml('1', 'A', 'sel') + rowHtml('2', 'B', ''))

    const { plan, applyOuterCalls } = makePlan({ selected, withOuter: true })
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    expect(applyOuterCalls.length).toBe(1)
    expect(applyOuterCalls[0].seed).toBe(true)
    const lis = container.querySelectorAll('li')
    expect(lis[0].getAttribute('class')).toBe('')
    expect(lis[1].getAttribute('class')).toBe('sel')
  })

  test('re-runs on outer-signal change with seed=false, and again after a row-creating reconcile', () => {
    const [selected, setSelected] = createSignal('1')
    const a = item('1', 'A')
    const b = item('2', 'B')
    const [items, setItems] = createSignal([a, b])
    const container = ssrContainer(rowHtml('1', 'A', 'sel') + rowHtml('2', 'B', ''))

    const { plan, applyOuterCalls } = makePlan({ selected, withOuter: true })
    mapArrayLazy(items, container, keyOf, plan, 'l0')
    expect(applyOuterCalls.length).toBe(1)

    // Outer-signal change → effect re-runs, seed=false, writes with dedup.
    setSelected('2')
    expect(applyOuterCalls.length).toBe(2)
    expect(applyOuterCalls[1].seed).toBe(false)
    const lis = container.querySelectorAll('li')
    expect(lis[0].getAttribute('class')).toBe('')
    expect(lis[1].getAttribute('class')).toBe('sel')

    // A row-creating reconcile DOES re-run the outer effect — the
    // re-subscribe seam. This inverts the original L2 contract ("reconciles
    // never re-run it") on purpose: an outer read may subscribe PER KEY
    // (createSelector), in which case a freshly created row's key was never
    // registered and a later selection of it would be missed. See the seam's
    // comment in map-array-lazy.ts for the three reproduced sequences.
    setItems([item('3', 'C'), a, b])
    expect(applyOuterCalls.length).toBe(3)
    expect(applyOuterCalls[2].seed).toBe(false)
    // The created row was already consistent before that pass (createRow
    // wrote the class), so the extra run is dedup-guarded work, not a fix.
    expect(container.querySelector('[data-key="3"]')!.getAttribute('class')).toBe('')

    // That pass already saw the post-reconcile entry list, in order.
    expect(applyOuterCalls[2].keys).toEqual(['3', '1', '2'])

    // And a subsequent outer change still lands on the same list.
    setSelected('3')
    expect(applyOuterCalls.length).toBe(4)
    expect(applyOuterCalls[3].keys).toEqual(['3', '1', '2'])
    expect(container.querySelector('[data-key="3"]')!.getAttribute('class')).toBe('sel')
    expect(container.querySelector('[data-key="2"]')!.getAttribute('class')).toBe('')
  })

  test('no applyOuter → outer-signal changes trigger no plan calls at all', () => {
    const [selected, setSelected] = createSignal('1')
    const a = item('1', 'A')
    const [items] = createSignal([a])
    const container = ssrContainer(rowHtml('1', 'A', 'sel'))

    // Plan reads `selected` in createRow/applyItem but declares no applyOuter.
    const { plan, createRowCalls, applyItemCalls, applyOuterCalls } = makePlan({ selected })
    mapArrayLazy(items, container, keyOf, plan, 'l0')

    setSelected('2')
    setSelected('3')
    expect(applyOuterCalls.length).toBe(0)
    expect(createRowCalls.length).toBe(0)
    expect(applyItemCalls.length).toBe(0)
  })
})

describe('mapArrayLazy — reconciler tracking isolation', () => {
  test('outer-signal reads inside createRow/applyItem do not subscribe the reconciler', () => {
    const [selected, setSelected] = createSignal('1')
    const a = item('1', 'A')
    const [items, setItems] = createSignal([a])
    const container = ssrContainer('')

    let accessorRuns = 0
    const countingAccessor = () => {
      accessorRuns++
      return items()
    }

    // createRow and applyItem both read selected() (mixed class binding);
    // no applyOuter, so ONLY the reconciler effect exists.
    const { plan, createRowCalls, applyItemCalls } = makePlan({ selected })
    mapArrayLazy(countingAccessor, container, keyOf, plan, 'l0')
    expect(accessorRuns).toBe(1)
    expect(createRowCalls).toEqual(['1']) // createRow ran, read selected()

    // Changing the outer signal must NOT re-run the reconciler effect.
    setSelected('2')
    expect(accessorRuns).toBe(1)
    expect(createRowCalls.length).toBe(1)
    expect(applyItemCalls.length).toBe(0)

    // Same after an item-driven update (applyItem also reads selected()).
    setItems([item('1', 'A2')])
    expect(accessorRuns).toBe(2)
    expect(applyItemCalls.length).toBe(1)
    setSelected('3')
    expect(accessorRuns).toBe(2)
    expect(applyItemCalls.length).toBe(1)
  })
})

/**
 * Re-subscribe seam. `applyOuter` subscribes to
 * whatever its body reads; when an outer read is NOT a primable signal
 * getter — `createSelector`, whose returned selector subscribes the caller
 * per KEY — that set depends on the entries it iterated, so a reconcile can
 * strand it. Each test below is a sequence that was reproduced as broken
 * before the seam existed.
 */
describe('mapArrayLazy — re-subscribe seam', () => {
  type Row = { id: number; tag?: string }

  function perKeyLoop(opts: { initial: Row[]; key?: (r: Row) => string }) {
    const host = document.createElement('div')
    document.body.innerHTML = ''
    document.body.appendChild(host)
    host.innerHTML = '<!--bf-loop:l0--><!--bf-/loop:l0-->'
    const [rows, setRows] = createSignal<Row[]>(opts.initial)
    const [selected, setSelected] = createSignal(0)
    const isSelected = createSelector(selected)
    let outerRuns = 0

    const paint = (entry: { item: Row; primaryEl: HTMLElement; last: unknown }): void => {
      const next = isSelected(entry.item.id) ? 'ON' : 'off'
      const last = (entry.last as string[] | null) ?? (entry.last = [] as string[])
      if (last[0] !== next) {
        entry.primaryEl.textContent = next
        last[0] = next
      }
    }

    mapArrayLazy(() => rows(), host, opts.key ?? ((r) => String(r.id)), {
      createRow(entry) {
        const el = document.createElement('span')
        entry.primaryEl = el
        paint(entry as never)
        return el
      },
      applyItem(entry) {
        paint(entry as never)
      },
      applyOuter(entries) {
        outerRuns++
        for (const e of entries) paint(e as never)
      },
    }, 'l0')

    return {
      setRows,
      setSelected,
      texts: () => Array.from(host.querySelectorAll('span')).map((s) => s.textContent),
      runs: () => outerRuns,
    }
  }

  test('empty at the first run: rows added later still react to the outer change', () => {
    const t = perKeyLoop({ initial: [] })
    t.setRows([{ id: 1 }, { id: 2 }])
    t.setSelected(1)
    expect(t.texts()).toEqual(['ON', 'off'])
  })

  test('a row created while nothing is selected, then selected, is not stranded', () => {
    // The list is NEVER empty here — which is why an empty -> non-empty
    // trigger would not have caught this.
    const t = perKeyLoop({ initial: [{ id: 1 }, { id: 2 }] })
    t.setRows([{ id: 1 }, { id: 2 }, { id: 3 }])
    t.setSelected(3)
    expect(t.texts()).toEqual(['off', 'off', 'ON'])
  })

  test('an item change that moves the keyed value re-subscribes', () => {
    // Loop key is `tag`, but the binding keys on `id`: changing `id` under a
    // stable key strands the old per-key subscription.
    const t = perKeyLoop({
      initial: [{ id: 1, tag: 'a' }],
      key: (r) => r.tag!,
    })
    t.setRows([{ id: 9, tag: 'a' }])
    t.setSelected(9)
    expect(t.texts()).toEqual(['ON'])
  })

  test('a removal alone does not re-run applyOuter (removals strand nothing)', () => {
    // The surviving row keeps its item OBJECT: the reconciler compares items
    // with Object.is, so handing back a fresh `{ id: 1 }` would register as
    // an item change and legitimately bump. Removal on its own must not.
    const keep = { id: 1 }
    const t = perKeyLoop({ initial: [keep, { id: 2 }] })
    const before = t.runs()
    t.setRows([keep])
    expect(t.runs()).toBe(before)
  })

  test('an item change bumps even when identity is the only thing that moved', () => {
    // The flip side of the test above, pinned so the Object.is-based
    // stranding rule is explicit rather than incidental.
    const t = perKeyLoop({ initial: [{ id: 1 }] })
    const before = t.runs()
    t.setRows([{ id: 1 }])
    expect(t.runs()).toBe(before + 1)
  })

  test('the seam is unconditional — no plan flag turns it off', () => {
    // Deliberate: gating it on a compiler judgement about which outer reads
    // are per-key would make a misclassification silently wrong instead of
    // merely wasteful. Pinned so a future "optimization" that reintroduces
    // an opt-out has to change this test on purpose.
    const t = perKeyLoop({ initial: [{ id: 1 }] })
    const before = t.runs()
    t.setRows([{ id: 1 }, { id: 2 }])
    expect(t.runs()).toBe(before + 1)
  })
})
