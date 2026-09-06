/**
 * Regression tests for #1212 — mapArray must correctly track DOM ranges
 * for items whose body is a JSX Fragment with two or more sibling root
 * elements. The compiler stashes extras on the primary element via a
 * `__bfExtras` property; the runtime synthesises a `<!--bf-loop-i-->`
 * boundary marker on CSR and partitions the loop range by that marker on
 * SSR hydration.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { createSignal, createRoot } from '../../src/reactive'
import { mapArray } from '../../src/runtime/map-array'
import { qsaItem, upsertChildItem } from '../../src/runtime/qsa-item'
import { registerComponent } from '../../src/runtime/registry'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

function makeContainer(html: string): HTMLElement {
  const c = document.createElement('div')
  c.innerHTML = html
  document.body.appendChild(c)
  return c
}

/** Build the SSR HTML for a list of edges, each with hit + visible <path>. */
function ssrEdges(edges: Array<{ id: string }>): string {
  const items = edges
    .map(
      (e) =>
        `<!--bf-loop-i--><path data-hit-id="${e.id}" stroke="transparent"></path><path data-id="${e.id}"></path>`,
    )
    .join('')
  return `<!--bf-loop:l0-->${items}<!--bf-/loop:l0-->`
}

/** Render a fragment-of-two-paths item from CSR-time. */
function renderFragmentEdge(item: () => { id: string }, _idx: () => number, existing?: HTMLElement): HTMLElement {
  if (existing) {
    // Hydration: the runtime hands us the primary element; extras +
    // startMarker are partitioned by mapArray itself.
    return existing
  }
  const tpl = document.createElement('template')
  tpl.innerHTML = `<path data-hit-id="${item().id}" stroke="transparent"></path><path data-id="${item().id}"></path>`
  const primary = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement
  const extras = [tpl.content.firstElementChild!.nextElementSibling!.cloneNode(true) as HTMLElement]
  ;(primary as unknown as { __bfExtras: HTMLElement[] }).__bfExtras = extras
  return primary
}

describe('mapArray multi-root (#1212)', () => {
  test('hydrates SSR HTML with per-item markers, pairing each key with all of its DOM nodes', () => {
    const container = makeContainer(ssrEdges([{ id: 'a' }, { id: 'b' }]))

    createRoot(() => {
      const [edges] = createSignal([{ id: 'a' }, { id: 'b' }])
      mapArray(
        edges,
        container,
        (e) => e.id,
        renderFragmentEdge,
        'l0',
      )
    })

    // Both edges produce 2 paths each; pair (hit, visible) of edge 'a'
    // appears before pair of edge 'b'.
    const paths = Array.from(container.querySelectorAll('path'))
    expect(paths.length).toBe(4)
    expect(paths[0].getAttribute('data-hit-id')).toBe('a')
    expect(paths[1].getAttribute('data-id')).toBe('a')
    expect(paths[2].getAttribute('data-hit-id')).toBe('b')
    expect(paths[3].getAttribute('data-id')).toBe('b')
  })

  test('appending a new item inserts marker + 2 elements as one logical unit', () => {
    const container = makeContainer(ssrEdges([{ id: 'a' }]))

    const [edges, setEdges] = createSignal([{ id: 'a' }])
    createRoot(() => {
      mapArray(edges, container, (e) => e.id, renderFragmentEdge, 'l0')
    })

    setEdges([{ id: 'a' }, { id: 'b' }])

    const paths = Array.from(container.querySelectorAll('path'))
    expect(paths.length).toBe(4)
    expect(paths[0].getAttribute('data-hit-id')).toBe('a')
    expect(paths[1].getAttribute('data-id')).toBe('a')
    expect(paths[2].getAttribute('data-hit-id')).toBe('b')
    expect(paths[3].getAttribute('data-id')).toBe('b')
  })

  test('removing an item removes all of its DOM nodes (marker + primary + extras)', () => {
    const container = makeContainer(ssrEdges([{ id: 'a' }, { id: 'b' }, { id: 'c' }]))

    const [edges, setEdges] = createSignal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    createRoot(() => {
      mapArray(edges, container, (e) => e.id, renderFragmentEdge, 'l0')
    })

    setEdges([{ id: 'a' }, { id: 'c' }])

    const paths = Array.from(container.querySelectorAll('path'))
    expect(paths.length).toBe(4)
    expect(paths[0].getAttribute('data-hit-id')).toBe('a')
    expect(paths[1].getAttribute('data-id')).toBe('a')
    expect(paths[2].getAttribute('data-hit-id')).toBe('c')
    expect(paths[3].getAttribute('data-id')).toBe('c')
    // The 'b' edge's nodes are gone. Marker count between loop boundaries
    // matches the surviving items (2).
    const markers = Array.from(container.childNodes).filter(
      (n) => n.nodeType === Node.COMMENT_NODE && n.nodeValue === 'bf-loop-i',
    )
    expect(markers.length).toBe(2)
  })

  test('reordering preserves the (marker, primary, extras) triplet per item', () => {
    const container = makeContainer(ssrEdges([{ id: 'a' }, { id: 'b' }, { id: 'c' }]))

    const [edges, setEdges] = createSignal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    createRoot(() => {
      mapArray(edges, container, (e) => e.id, renderFragmentEdge, 'l0')
    })

    // Reverse order — every item's full range must move together.
    setEdges([{ id: 'c' }, { id: 'b' }, { id: 'a' }])

    const paths = Array.from(container.querySelectorAll('path'))
    expect(paths.length).toBe(6)
    expect(paths[0].getAttribute('data-hit-id')).toBe('c')
    expect(paths[1].getAttribute('data-id')).toBe('c')
    expect(paths[2].getAttribute('data-hit-id')).toBe('b')
    expect(paths[3].getAttribute('data-id')).toBe('b')
    expect(paths[4].getAttribute('data-hit-id')).toBe('a')
    expect(paths[5].getAttribute('data-id')).toBe('a')
  })

  test('qsaItem stops at the loop end marker for the last item', () => {
    // The last item has no following bf-loop-i marker, but it does have
    // a bf-/loop:* end marker. qsaItem must not walk past that into a
    // following sibling — otherwise it would silently bind to elements
    // outside the loop range.
    const container = makeContainer(
      `<!--bf-loop:l0--><!--bf-loop-i--><path data-hit-id="a"></path><path data-id="a"></path><!--bf-/loop:l0--><div bf="trap"></div>`,
    )
    const primary = container.querySelector('[data-hit-id="a"]')!
    // 'trap' lives outside the loop end marker — must not be reachable.
    const found = qsaItem(primary, '[bf="trap"]')
    expect(found).toBeNull()
  })

  test('qsaItem stops at the next item start marker', () => {
    const container = makeContainer(
      `<!--bf-loop:l0--><!--bf-loop-i--><path data-hit-id="a"></path><!--bf-loop-i--><path data-hit-id="b" bf="b-slot"></path><!--bf-/loop:l0-->`,
    )
    const primaryA = container.querySelector('[data-hit-id="a"]')!
    // 'b-slot' lives in the next item — must not be reachable from item 'a'.
    const found = qsaItem(primaryA, '[bf="b-slot"]')
    expect(found).toBeNull()
  })

  test('qsaItem reaches __bfExtras during CSR-time setup (extras still detached)', () => {
    // Simulates the renderItem body before mapArray inserts the new
    // item into the DOM. __el and an extra are both detached; the extra
    // is reachable only via __el.__bfExtras.
    const primary = document.createElement('path')
    primary.setAttribute('data-hit-id', 'a')
    const extra = document.createElement('path')
    extra.setAttribute('data-id', 'a')
    extra.setAttribute('bf', 'visible')
    ;(primary as unknown as { __bfExtras: HTMLElement[] }).__bfExtras = [extra]

    const found = qsaItem(primary, '[bf="visible"]')
    expect(found).toBe(extra)
  })

  test('upsertChildItem finds component scope on a sibling root', () => {
    // Simulates a multi-root loop body where the second root carries a
    // child component scope. upsertChild(primary, ...) misses it;
    // upsertChildItem walks the extras stash and finds it.
    let initCalls = 0
    registerComponent('SibChild', () => {
      initCalls++
    })

    const primary = document.createElement('div')
    const extra = document.createElement('div')
    extra.setAttribute('bf-s', 'SibChild_abc')
    ;(primary as unknown as { __bfExtras: HTMLElement[] }).__bfExtras = [extra]

    const result = upsertChildItem(primary, 'SibChild', null, {})
    expect(result).toBe(extra)
    expect(initCalls).toBe(1)
  })

  test('legacy single-root SSR (no bf-loop-i markers) still hydrates correctly', () => {
    // No per-item markers — bodyIsMultiRoot=false case from the compiler's
    // perspective. mapArray's findItemRanges should fall back to "one
    // element per item".
    const container = makeContainer(
      `<!--bf-loop:l0--><div data-id="a"></div><div data-id="b"></div><!--bf-/loop:l0-->`,
    )

    createRoot(() => {
      const [items] = createSignal([{ id: 'a' }, { id: 'b' }])
      mapArray(
        items,
        container,
        (i) => i.id,
        (i, _idx, existing) => {
          if (existing) return existing
          const el = document.createElement('div')
          el.setAttribute('data-id', i().id)
          return el
        },
        'l0',
      )
    })

    const divs = Array.from(container.querySelectorAll('div'))
    expect(divs.length).toBe(2)
    expect(divs[0].getAttribute('data-id')).toBe('a')
    expect(divs[1].getAttribute('data-id')).toBe('b')
  })
})
