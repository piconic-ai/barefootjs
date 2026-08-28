/**
 * Regression tests for #2733 — mapArray's row bookkeeping must carry a
 * fragment-rooted component's own `<!--bf-scope:ID-->` /
 * `<!--bf-/scope:ID-->` boundary comments (`wrapWithScopeComment`,
 * hono-adapter.ts) as part of the row's atomic unit, so a reorder
 * (`insertScope`) or removal (`removeScope`) doesn't orphan them —
 * leaving `commentScopeRegistry`'s stored range pointing at a comment
 * whose sibling walk no longer contains the row's element.
 *
 * Distinct from `map-array-multi-root.test.ts` (#1212): that fixture is a
 * multi-root loop BODY's own `<!--bf-loop-i-->` marker + `__bfExtras`
 * siblings — a loop-body concept `mapArray` itself owns. This one is a
 * CHILD COMPONENT's own scope identity (the comment pair `wrapWithScopeComment`
 * emits for ANY fragment-rooted component, loop row or not), captured via
 * `ItemScope.scopeComments` and the `__bfScopeComments` stash convention
 * `component.ts`'s `createComponent` uses on CSR (mirroring `__bfExtras`).
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { createSignal, createRoot } from '../../src/reactive'
import { mapArray } from '../../src/runtime/map-array'
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

type Row = { id: string; text: string }

/** SSR shape: each row is a fragment-rooted `TodoRow` — its own
 *  `<!--bf-scope:-->` boundary pair wraps the `<li>` it renders,
 *  matching `wrapWithScopeComment` + `IRElement.carriesDataKey` (#2732).
 *
 *  The `|h=<host>|m=<slot>|<props>` segments are load-bearing, not
 *  decoration: a loop row is rendered BY a parent, so every row a server
 *  emits carries them (verified by rendering this fixture through
 *  `renderHonoComponent`). An earlier version of this helper used the bare
 *  `bf-scope:ID` form, which no server produces — and the implementation
 *  it was written against skipped `|h=` comments outright, so the pair was
 *  orphaned on every real reorder while these tests passed. */
function ssrRows(rows: Row[]): string {
  return rows
    .map(
      (r) =>
        `<!--bf-scope:TodoRow_${r.id}|h=test|m=s0|{"todo":{"id":"${r.id}"}}--><li data-key="${r.id}">${r.text}</li><!--bf-/scope:TodoRow_${r.id}-->`,
    )
    .join('')
}

/** Render a fragment-root row from CSR-time: a fresh `<li>` plus its own
 *  detached scope-comment pair, stashed on the element via
 *  `__bfScopeComments` exactly like `component.ts`'s `createComponent`
 *  does for a real fragment-root component connected as a loop row. */
function renderFragmentRow(item: () => Row, _idx: number, existing?: HTMLElement): HTMLElement {
  if (existing) {
    // Hydration: mapArray's `findItemRanges` already partitioned the
    // scope-comment pair for this row; nothing to do here.
    return existing
  }
  const li = document.createElement('li')
  li.textContent = item().text
  const start = document.createComment(`bf-scope:TodoRow_${item().id}`)
  const end = document.createComment(`bf-/scope:TodoRow_${item().id}`)
  ;(li as unknown as { __bfScopeComments: { start: Comment; end: Comment } }).__bfScopeComments = { start, end }
  return li
}

/** A row's own boundary pair must sit immediately around its `<li>` —
 *  `start.nextSibling === li && li.nextSibling === end`. */
function assertBoundary(li: Element, id: string): void {
  const start = li.previousSibling
  const end = li.nextSibling
  expect(start?.nodeType).toBe(Node.COMMENT_NODE)
  // Start carries `|h=…|m=…|props` in the SSR shape; the identity is the
  // `|`-free head, which is what `scopeIdOf` pairs on.
  expect((start as Comment).nodeValue?.split('|')[0]).toBe(`bf-scope:TodoRow_${id}`)
  expect(end?.nodeType).toBe(Node.COMMENT_NODE)
  expect((end as Comment).nodeValue).toBe(`bf-/scope:TodoRow_${id}`)
}

describe('mapArray fragment-root row (#2733)', () => {
  test('hydrates SSR HTML keeping each row wrapped by its own scope-comment pair', () => {
    const container = makeContainer(`<!--bf-loop:l0-->${ssrRows([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }])}<!--bf-/loop:l0-->`)

    createRoot(() => {
      const [rows] = createSignal<Row[]>([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }])
      mapArray(rows, container, (r) => r.id, renderFragmentRow, 'l0')
    })

    const lis = Array.from(container.querySelectorAll('li'))
    expect(lis.length).toBe(2)
    assertBoundary(lis[0], 'a')
    assertBoundary(lis[1], 'b')
  })

  test('reordering moves each row\'s scope comments together with its element', () => {
    const container = makeContainer(`<!--bf-loop:l0-->${ssrRows([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }])}<!--bf-/loop:l0-->`)

    const [rows, setRows] = createSignal<Row[]>([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }])
    createRoot(() => {
      mapArray(rows, container, (r) => r.id, renderFragmentRow, 'l0')
    })

    // Reverse — every row's comment pair must travel with its <li>, not be
    // left behind at the old position (the #2733 failure mode).
    setRows([{ id: 'c', text: 'C' }, { id: 'b', text: 'B' }, { id: 'a', text: 'A' }])

    const lis = Array.from(container.querySelectorAll('li'))
    expect(lis.map((li) => li.textContent)).toEqual(['C', 'B', 'A'])
    assertBoundary(lis[0], 'c')
    assertBoundary(lis[1], 'b')
    assertBoundary(lis[2], 'a')

    // No orphaned scope comments left over anywhere in the container —
    // exactly 3 start + 3 end comments total, all adjacent to their <li>.
    const comments = Array.from(container.childNodes).filter(
      (n) => n.nodeType === Node.COMMENT_NODE && (n.nodeValue?.startsWith('bf-scope:') || n.nodeValue?.startsWith('bf-/scope:')),
    )
    expect(comments.length).toBe(6)
  })

  test('removing a row removes its scope comments along with its element', () => {
    const container = makeContainer(`<!--bf-loop:l0-->${ssrRows([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }])}<!--bf-/loop:l0-->`)

    const [rows, setRows] = createSignal<Row[]>([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }])
    createRoot(() => {
      mapArray(rows, container, (r) => r.id, renderFragmentRow, 'l0')
    })

    setRows([{ id: 'a', text: 'A' }, { id: 'c', text: 'C' }])

    const lis = Array.from(container.querySelectorAll('li'))
    expect(lis.map((li) => li.textContent)).toEqual(['A', 'C'])
    assertBoundary(lis[0], 'a')
    assertBoundary(lis[1], 'c')

    // 'b's comments must be gone too, not orphaned in the container.
    const stray = Array.from(container.childNodes).filter(
      (n) => n.nodeType === Node.COMMENT_NODE && n.nodeValue?.includes('TodoRow_b'),
    )
    expect(stray.length).toBe(0)
  })

  test('appending a new CSR-created row attaches its scope comments as one unit', () => {
    const container = makeContainer(`<!--bf-loop:l0-->${ssrRows([{ id: 'a', text: 'A' }])}<!--bf-/loop:l0-->`)

    const [rows, setRows] = createSignal<Row[]>([{ id: 'a', text: 'A' }])
    createRoot(() => {
      mapArray(rows, container, (r) => r.id, renderFragmentRow, 'l0')
    })

    setRows([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }])

    const lis = Array.from(container.querySelectorAll('li'))
    expect(lis.map((li) => li.textContent)).toEqual(['A', 'B'])
    assertBoundary(lis[0], 'a')
    assertBoundary(lis[1], 'b')
  })
})
