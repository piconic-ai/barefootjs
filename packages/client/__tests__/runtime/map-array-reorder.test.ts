/**
 * Regression + perf-shape tests for the minimal-move keyed reconciler in
 * `mapArray`. These pin the LIS-based reorder, batched insertion, and fast
 * clear introduced to fix the following pathologies (see benchmark evidence
 * in the accompanying issue): a 2-row swap in a 1000-row list used to
 * reinsert every scope; appending rows to a large list used to reinsert the
 * entire list; clearing a large list used to remove nodes one at a time.
 *
 * Mutations are counted by instrumenting `Node.prototype.insertBefore` /
 * `removeChild` directly (rather than trusting MutationObserver batching
 * semantics, which vary across DOM implementations) so the assertions are
 * deterministic under happy-dom.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test'
import { createSignal } from '../../src/reactive'
import { mapArray } from '../../src/runtime/map-array'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

type Row = { id: string; text: string }

function makeRows(n: number): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < n; i++) rows.push({ id: String(i), text: `row ${i}` })
  return rows
}

function renderRow(item: () => Row): HTMLElement {
  const li = document.createElement('li')
  li.textContent = item().text
  return li
}

/** Instrument insertBefore/removeChild/appendChild call counts on Node.prototype. */
function instrumentDom() {
  const proto = Node.prototype as unknown as {
    insertBefore: (...args: unknown[]) => unknown
    removeChild: (...args: unknown[]) => unknown
  }
  const originalInsertBefore = proto.insertBefore
  const originalRemoveChild = proto.removeChild
  const calls = { insertBefore: 0, removeChild: 0, movedNodes: 0 }
  proto.insertBefore = function (this: unknown, node: unknown, ref: unknown) {
    // Only count calls that touch the live tree (this === some Element).
    // Building up a detached DocumentFragment before a single batched
    // `container.insertBefore(fragment, anchor)` call is the whole point
    // of the optimization — those internal inserts must not count against
    // the "one DOM mutation" budget.
    if (!(this instanceof DocumentFragment)) {
      calls.insertBefore++
      // A DocumentFragment insertion moves all of its children in one DOM
      // call; count the actual nodes relocated, not just the call.
      calls.movedNodes += node instanceof DocumentFragment ? (node as DocumentFragment).childNodes.length : 1
    }
    return originalInsertBefore.call(this, node, ref)
  }
  proto.removeChild = function (this: unknown, node: unknown) {
    if (!(this instanceof DocumentFragment)) calls.removeChild++
    return originalRemoveChild.call(this, node)
  }
  return {
    calls,
    restore() {
      proto.insertBefore = originalInsertBefore
      proto.removeChild = originalRemoveChild
    },
  }
}

describe('mapArray minimal-move reorder', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('ul')
    document.body.appendChild(container)
  })

  test('swap of 2 rows in a 1000-row list moves only those 2 scopes', () => {
    const rows = makeRows(1000)
    const [items, setItems] = createSignal(rows)

    mapArray(items, container, (item) => item.id, renderRow)

    const originalEls = Array.from(container.children)
    expect(originalEls.length).toBe(1000)

    const swapped = rows.slice()
    const tmp = swapped[1]
    swapped[1] = swapped[998]
    swapped[998] = tmp

    const instr = instrumentDom()
    setItems(swapped)
    instr.restore()

    // Exactly 2 scopes should have moved (bounded generously since a single
    // logical move can surface as more than one low-level DOM call).
    expect(instr.calls.movedNodes).toBeLessThanOrEqual(4)
    expect(instr.calls.removeChild).toBe(0)

    // Final DOM order matches the new array, and every element identity is
    // preserved (no scope was disposed/recreated).
    expect(container.children.length).toBe(1000)
    expect(container.children[1].textContent).toBe('row 998')
    expect(container.children[998].textContent).toBe('row 1')
    expect(container.children[1]).toBe(originalEls[998])
    expect(container.children[998]).toBe(originalEls[1])
    // Every other row stayed untouched (same element, same position).
    expect(container.children[0]).toBe(originalEls[0])
    expect(container.children[500]).toBe(originalEls[500])
    expect(container.children[999]).toBe(originalEls[999])
  })

  test('order-unchanged update performs zero DOM mutations', () => {
    const rows = makeRows(200)
    const [items, setItems] = createSignal(rows)

    mapArray(items, container, (item) => item.id, renderRow)

    const instr = instrumentDom()
    // Same keys, same order, new array reference (as a reactive update
    // would produce e.g. after an unrelated field change elsewhere).
    setItems(rows.slice())
    instr.restore()

    expect(instr.calls.insertBefore).toBe(0)
    expect(instr.calls.removeChild).toBe(0)
  })

  test('creating 1000 rows from empty performs one batched insert', () => {
    const [items, setItems] = createSignal<Row[]>([])
    mapArray(items, container, (item) => item.id, renderRow)

    const instr = instrumentDom()
    setItems(makeRows(1000))
    instr.restore()

    expect(container.children.length).toBe(1000)
    // A single DocumentFragment insertBefore call carries all 1000 nodes.
    expect(instr.calls.insertBefore).toBe(1)
    expect(instr.calls.movedNodes).toBe(1000)
  })

  test('appending 1000 rows to 10000 touches zero existing rows', () => {
    const initial = makeRows(10000)
    const [items, setItems] = createSignal(initial)
    mapArray(items, container, (item) => item.id, renderRow)

    const originalEls = Array.from(container.children)
    expect(originalEls.length).toBe(10000)

    const appended = initial.concat(
      Array.from({ length: 1000 }, (_, i) => ({ id: `new-${i}`, text: `new row ${i}` })),
    )

    const instr = instrumentDom()
    setItems(appended)
    instr.restore()

    expect(container.children.length).toBe(11000)
    // One fragment insert carrying exactly the 1000 new nodes; the existing
    // 10000 are never detached or re-inserted.
    expect(instr.calls.insertBefore).toBe(1)
    expect(instr.calls.movedNodes).toBe(1000)
    expect(instr.calls.removeChild).toBe(0)
    for (let i = 0; i < 10000; i += 997) {
      expect(container.children[i]).toBe(originalEls[i])
    }
  })

  test('clear leaves loop markers intact and empties the list', () => {
    // Scoped container (loop markers present) — exercises the Range-based
    // bulk delete path.
    const parent = document.createElement('div')
    parent.appendChild(document.createComment('bf-loop:l0'))
    parent.appendChild(document.createComment('bf-/loop:l0'))
    document.body.appendChild(parent)

    const [items, setItems] = createSignal(makeRows(500))
    mapArray(items, parent, (item) => item.id, renderRow, 'l0')

    expect(parent.querySelectorAll('li').length).toBe(500)

    const instr = instrumentDom()
    setItems([])
    instr.restore()

    expect(parent.querySelectorAll('li').length).toBe(0)
    // Markers survive.
    expect(parent.childNodes.length).toBe(2)
    expect((parent.childNodes[0] as Comment).nodeValue).toBe('bf-loop:l0')
    expect((parent.childNodes[1] as Comment).nodeValue).toBe('bf-/loop:l0')

    // Re-adding items after a clear still works (scopes map was reset).
    setItems(makeRows(3))
    expect(parent.querySelectorAll('li').length).toBe(3)
  })

  test('clear on an unscoped container uses textContent fast path when container is fully owned', () => {
    const [items, setItems] = createSignal(makeRows(300))
    mapArray(items, container, (item) => item.id, renderRow)

    expect(container.children.length).toBe(300)
    setItems([])
    expect(container.children.length).toBe(0)
    expect(container.childNodes.length).toBe(0)
  })

  test('clear preserves foreign siblings in an unscoped container', () => {
    const [items, setItems] = createSignal(makeRows(5))
    mapArray(items, container, (item) => item.id, renderRow)
    expect(container.querySelectorAll('li').length).toBe(5)

    // A foreign node lands in the same container *after* the list has
    // already rendered (e.g. something else appended a sibling under the
    // list's parent) — the textContent fast path must detect the node-count
    // mismatch and fall back to per-scope removal instead of nuking it.
    const foreign = document.createElement('div')
    foreign.className = 'foreign'
    container.appendChild(foreign)

    setItems([])
    expect(container.querySelectorAll('li').length).toBe(0)
    expect(container.querySelector('.foreign')).toBe(foreign)
  })

  test('reorder does not move a scope holding a focused input', () => {
    const rows = makeRows(50)
    const [items, setItems] = createSignal(rows)

    let focusedInput: HTMLInputElement | null = null
    mapArray(items, container, (item) => item.id, (item) => {
      const li = document.createElement('li')
      const input = document.createElement('input')
      input.value = item().text
      li.appendChild(input)
      if (item().id === '25') focusedInput = input
      return li
    })

    focusedInput!.focus()
    expect(document.activeElement).toBe(focusedInput)

    // Reorder that does NOT move row 25 (swap two other, unrelated rows).
    const reordered = rows.slice()
    const tmp = reordered[0]
    reordered[0] = reordered[49]
    reordered[49] = tmp
    setItems(reordered)

    // Row 25 was never in the moved set, so its input must keep focus.
    expect(document.activeElement).toBe(focusedInput)
  })

  test('full reversal produces a correct final order', () => {
    const rows = makeRows(100)
    const [items, setItems] = createSignal(rows)
    mapArray(items, container, (item) => item.id, renderRow)

    setItems(rows.slice().reverse())

    expect(container.children.length).toBe(100)
    for (let i = 0; i < 100; i++) {
      expect(container.children[i].textContent).toBe(`row ${99 - i}`)
    }
  })

  test('random permutation with adds and removes reconciles to the correct DOM', () => {
    const rows = makeRows(60)
    const [items, setItems] = createSignal(rows)
    mapArray(items, container, (item) => item.id, renderRow)

    // Deterministic pseudo-shuffle: drop every 7th row, add 10 new rows,
    // reverse what's left.
    const kept = rows.filter((_, i) => i % 7 !== 0)
    const added = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, text: `x row ${i}` }))
    const next = kept.concat(added).reverse()

    setItems(next)

    expect(container.children.length).toBe(next.length)
    for (let i = 0; i < next.length; i++) {
      expect(container.children[i].textContent).toBe(next[i].text)
    }
    // All keys present, none duplicated, matching ids in order.
    const ids = Array.from(container.querySelectorAll('li')).map((_, idx) => next[idx].id)
    expect(new Set(ids).size).toBe(next.length)
  })
})
