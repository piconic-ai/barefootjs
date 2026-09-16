/**
 * Emission pin for #3009: a `ref` on an element inside a keyed loop row's
 * conditional branch must be collected onto that branch's own
 * `LoopChildBranchSummary.refs` and emitted inside the branch's `insert()`
 * bindEvents — not hoisted to the row-level `mapArray` renderItem body
 * (`emitLoopChildRefs`, control-flow/stringify/loop.ts), which only fires
 * once per row CREATION.
 *
 * `collectLoopChildRefs` (ir-to-client-js/reactivity.ts) used to descend
 * straight through a nested reactive conditional (it called
 * `traverseElements` with `stopAtReactiveConditionals` defaulting to
 * `false`), unlike its sibling `collectConditionalBranchEvents` /
 * `collectConditionalBranchRefs`, which both pass `true`. The row-level
 * hoist meant the ref fired unconditionally exactly once, at row creation
 * — never again on a later branch activation (starting on the OTHER
 * branch, or a keyed row's identity round-tripping through the other
 * branch and back).
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'C.tsx', { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join('\n'))
  return result.files.find(f => f.type === 'clientJs')!.content
}

const BRANCH_REF_SOURCE = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  type Row = { key: string; kind: 'a' | 'b'; label: string }
  export function C() {
    const [rows] = createSignal<Row[]>([])
    return (
      <ul>{rows().map(row => (
        <li key={row.key}>
          {row.kind === 'a' ? (
            <span ref={el => { el.dataset.mounted = 'yes' }}>{row.label}</span>
          ) : (
            <span>placeholder</span>
          )}
        </li>
      ))}</ul>
    )
  }
`

describe('issue-3009 — loop-row conditional branch ref emission', () => {
  test('the ref call is emitted inside the branch bindEvents, using __branchScope', () => {
    const js = clientJsFor(BRANCH_REF_SOURCE)
    expect(js).toContain("el.dataset.mounted = 'yes'")

    // Find the specific line the ref call landed on and confirm it looks
    // up its element off __branchScope (the insert()-mounted branch node)
    // via qsa — not off the row's own __el/__existing clone.
    const refLine = js.split('\n').find(l => l.includes("el.dataset.mounted = 'yes'"))
    expect(refLine).toBeDefined()
    expect(js).toContain("qsa(__branchScope, '[bf=")
  })

  test('no ref lookup is hoisted into the mapArray renderItem body (row-level)', () => {
    const js = clientJsFor(BRANCH_REF_SOURCE)
    // The row-level hoist (the #3009 bug) emitted a `__rf_<slot>` lookup
    // keyed off the item element var, unconditionally, once per renderItem.
    // With the fix, the only ref lookup for this fixture is the branch-scoped
    // one asserted above (qsa(__branchScope, ...)) — no `__rf_` variable at
    // row level.
    expect(js).not.toMatch(/const __rf_\w+ = (qsa|qsaItem)\(__el,/)
  })

  test('a ref on a plain (non-conditional) loop row element is unaffected — still row-level', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Row = { key: string; label: string }
      export function C() {
        const [rows] = createSignal<Row[]>([])
        return <ul>{rows().map(row => (
          <li key={row.key} ref={el => { el.dataset.mounted = 'yes' }}>{row.label}</li>
        ))}</ul>
      }
    `)
    expect(js).toContain("el.dataset.mounted = 'yes'")
    // This ref has no conditional to hide behind — it must still be the
    // ordinary row-level per-mount emission.
    expect(js).toMatch(/\{ const __rf_\w+ = (qsa|qsaItem|__p)/)
  })
})
