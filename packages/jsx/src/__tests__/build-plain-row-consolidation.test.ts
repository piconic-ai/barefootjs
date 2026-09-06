/**
 * Regression pin for the `buildPlainRowCore` extraction
 * (`control-flow/plan/build-plain-row.ts`).
 *
 * `buildPlainLoopPlan` (build-loop.ts, `callSite: 'plain'`) and
 * `buildBranchLoopPlan` (build-branch-loop.ts, `callSite: 'branch-plain'`)
 * used to duplicate the "wrap item → decide lazy → wrap index" sequence
 * verbatim. This pins that both call sites now go through the ONE shared
 * implementation and cannot silently diverge again (CLAUDE.md's "one
 * decision, two implementations, no test comparing them"):
 *
 *   - An index-referencing row (forced eager, #2859) gets its index wrapped
 *     into a live accessor call at BOTH call sites.
 *   - A lazy-eligible row (no index reference) goes through `mapArrayLazy`
 *     at BOTH call sites, with no leaked eager-only index wrap in the
 *     shared `mapPreambleWrapped`/`template` strings — the exact shape of
 *     the original #2859 CI regression.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join('\n'))
  return result.files.find(f => f.type === 'clientJs')!.content
}

describe('buildPlainRowCore — shared wrap-item/decide-lazy/wrap-index sequence', () => {
  test('top-level plain loop: an index-referencing binding forces eager and wraps the index', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Row = { id: number; label: string }
      export function Repro() {
        const [rows] = createSignal<Row[]>([])
        return <ul>{rows().map((row, i) => <li key={row.id}>{String(i + 1)}. {row.label}</li>)}</ul>
      }
    `)
    expect(js).not.toContain('mapArrayLazy(')
    expect(js).toMatch(/i\(\)\s*\+\s*1/)
  })

  test('branch-plain loop (ternary): the SAME index-referencing shape wraps the index identically', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Row = { id: number; label: string }
      export function Repro() {
        const [active, setActive] = createSignal(true)
        const [rows] = createSignal<Row[]>([])
        return <div>{active() ? rows().map((row, i) => <li key={row.id}>{String(i + 1)}. {row.label}</li>) : <span>Empty</span>}</div>
      }
    `)
    expect(js).not.toContain('mapArrayLazy(')
    expect(js).toMatch(/i\(\)\s*\+\s*1/)
  })

  test('top-level plain loop: a lazy-eligible row (no index reference) goes lazy with no leaked index wrap', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Row = { id: number; label: string }
      export function Repro() {
        const [rows] = createSignal<Row[]>([{ id: 1, label: 'alpha' }])
        const [selected, setSelected] = createSignal(1)
        return (
          <ul>
            {rows().map(row => (
              <li key={row.id} onClick={() => setSelected(row.id)}>{String(selected() === row.id ? 'YES' : 'NO')}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(js).toContain('mapArrayLazy(')
  })

  test('branch-plain loop (ternary): the SAME lazy-eligible shape also goes lazy', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Row = { id: number; label: string }
      export function Repro() {
        const [active] = createSignal(true)
        const [rows] = createSignal<Row[]>([{ id: 1, label: 'alpha' }])
        const [selected, setSelected] = createSignal(1)
        return (
          <div>
            {active() ? rows().map(row => (
              <li key={row.id} onClick={() => setSelected(row.id)}>{String(selected() === row.id ? 'YES' : 'NO')}</li>
            )) : <span>Empty</span>}
          </div>
        )
      }
    `)
    expect(js).toContain('mapArrayLazy(')
  })

  test('a ref callback closing over the loop index reads the live accessor at the top-level call site (#2859)', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Row = { id: number; label: string }
      export function Repro() {
        const [rows] = createSignal<Row[]>([])
        const refs: HTMLLIElement[] = []
        return <ul>{rows().map((row, i) => <li key={row.id} ref={el => { refs[i] = el! }}>{row.label}</li>)}</ul>
      }
    `)
    expect(js).toMatch(/refs\[i\(\)\]/)
  })
})
