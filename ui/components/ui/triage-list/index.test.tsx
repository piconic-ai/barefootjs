import { describe, test, expect } from 'bun:test'
import { execFileSync } from 'child_process'
import { resolve } from 'path'

/**
 * Consistency oracle for the TriageList experiment.
 *
 * This is the "(B)" check: instead of a human holding the whole reactive
 * graph in working memory, the machine derives it statically (from the
 * compiler IR via `bf debug graph --json`) and verifies an invariant that
 * a reviewer would plausibly miss in a component with ~18 coupled memos.
 *
 * Invariant under test — "no orphaned selection":
 *   Every DOM binding that reflects SELECTION state (the header "select all"
 *   checkbox and the bulk-action button) must be transitively reactive to the
 *   FILTER inputs (`filterStatus`, `query`). If selection-derived UI does not
 *   depend on the filter, then changing the filter leaves a stale selection
 *   that silently acts on hidden rows.
 */

const repoRoot = resolve(__dirname, '../../../..')

function graph(component: string) {
  const out = execFileSync('bun', ['run', 'bf', 'debug', 'graph', component, '--json'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  })
  // strip the `$ bun run ...` banner bun prints before JSON
  return JSON.parse(out.slice(out.indexOf('{')))
}

/** Names that are transitively upstream of `node` (signals + memos). */
function upstreamClosure(g: any, node: string, seen = new Set<string>()): Set<string> {
  if (seen.has(node)) return seen
  seen.add(node)
  const memo = g.memos.find((m: any) => m.name === node)
  if (memo) for (const dep of memo.deps) upstreamClosure(g, dep, seen)
  return seen
}

describe('TriageList — reactive consistency (machine-verified)', () => {
  const g = graph('triage-list')

  test('compiles into a reactive graph', () => {
    expect(g.componentName).toBe('TriageList')
    expect(g.memos.length).toBeGreaterThanOrEqual(15) // deliberately WM-exceeding
  })

  // The selection-derived surface the user perceives.
  const SELECTION_MARKERS = ['headerState', 'bulkEnabled', 'selectedCount', 'bulkLabel', 'summary']
  // The inputs that change which rows are visible.
  const FILTER_INPUTS = ['filterStatus', 'query']

  const selectionBindings = () =>
    g.domBindings.filter((b: any) =>
      b.deps.some((d: string) => SELECTION_MARKERS.includes(d))
    )

  test('selection-derived bindings exist', () => {
    expect(selectionBindings().length).toBeGreaterThan(0)
  })

  test('every selection-derived binding reacts to the filter inputs (no orphaned selection)', () => {
    const violations: string[] = []
    for (const b of selectionBindings()) {
      // a binding is reactive to X if X is in the upstream closure of any of its deps
      const closure = new Set<string>()
      for (const dep of b.deps) for (const n of upstreamClosure(g, dep)) closure.add(n)
      for (const input of FILTER_INPUTS) {
        if (!closure.has(input)) {
          violations.push(`${b.jsxPreview} is NOT reactive to "${input}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
