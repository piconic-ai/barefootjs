/**
 * `createSelector` compiler recognition (perf, #2143 gap 5).
 *
 * `createSelector`'s returned accessor is `Reactive<(key) => boolean>`
 * branded exactly like a signal/memo getter, so the existing type-based
 * reactivity analyzer (`reactivity-checker.ts`) recognises a call like
 * `isSelected(row.id)` as reactive with no analyzer changes — the callee's
 * type carries the brand, not the call's return type. These tests pin:
 *   - the classic js-framework-benchmark row compiles with `isSelected(row.id)`
 *     wired to a single per-row `createEffect` (not the legacy
 *     `selected() === row.id` shape, which would still work but subscribes
 *     every row to the raw signal)
 *   - the loop-param accessor wrap applies only to the call ARGUMENT
 *     (`row.id` -> `row().id`), leaving the `isSelected` callee untouched
 *   - the hoisted skeleton fast path (#2223) still fires for a selector-driven
 *     attr, since it's covered by a loop-child reactive-attr effect like any
 *     other dynamic attribute
 *   - `createSelector` is pulled into the runtime import line
 *   - the attr is auto-deferred out of the SSR-mirror `template:` lambda
 *     (mechanism #1638, same as `@barefootjs/form` accessors) — pinned as
 *     documented behavior, not a regression: full SSR parity for selector
 *     calls is a known follow-up, not in scope here
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compile(source: string, filename: string): { clientJs: string; template: string; errors: readonly { severity: string }[] } {
  const result = compileJSX(source, filename, { adapter })
  const clientJs = result.files.find(f => f.type === 'clientJs')
  const template = result.files.find(f => f.type === 'markedTemplate')
  return { clientJs: clientJs?.content ?? '', template: template?.content ?? '', errors: result.errors }
}

describe('createSelector (perf, #2143 gap 5)', () => {
  test('isSelected(row.id) in a loop body compiles to one per-row createEffect', () => {
    const source = `
      'use client'
      import { createSignal, createSelector } from '@barefootjs/client'

      interface RowData { id: number; label: string }

      export function Bench() {
        const [rows, setRows] = createSignal<RowData[]>([])
        const [selected, setSelected] = createSignal<number>(0)
        const isSelected = createSelector(selected)
        return (
          <table>
            <tbody>
              {rows().map(row => (
                <tr key={row.id} className={isSelected(row.id) ? 'danger' : ''}></tr>
              ))}
            </tbody>
          </table>
        )
      }
    `
    const { clientJs, errors } = compile(source, 'Bench.tsx')
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0)

    // Loop-param wrap applies to the call ARGUMENT only.
    expect(clientJs).toContain('isSelected(row().id)')
    // The callee itself is never rewritten to an accessor call.
    expect(clientJs).not.toContain('isSelected()(')

    // Exactly one createEffect wraps the selector-driven class attribute —
    // not the O(rows) `selected() === row.id` shape.
    const effectCount = (clientJs.match(/createEffect\(/g) ?? []).length
    expect(effectCount).toBe(1)
    expect(clientJs).not.toContain('selected() ===')

    // The hoisted skeleton fast path (#2223) still fires: a single-line
    // renderItem clones from a once-per-loop template.
    expect(clientJs).toMatch(/const __tpl_\w+ = document\.createElement\('template'\)/)

    // createSelector is pulled into the runtime import line.
    expect(clientJs).toMatch(/import \{[^}]*\bcreateSelector\b[^}]*\} from '@barefootjs\/client\/runtime'/)
  })

  test('selector-driven attr is deferred out of the SSR-mirror template lambda (documented, not a regression)', () => {
    const source = `
      'use client'
      import { createSignal, createSelector } from '@barefootjs/client'

      interface RowData { id: number; label: string }

      export function Bench() {
        const [rows, setRows] = createSignal<RowData[]>([])
        const [selected, setSelected] = createSignal<number>(0)
        const isSelected = createSelector(selected)
        return (
          <ul>
            {rows().map(row => (
              <li key={row.id} className={isSelected(row.id) ? 'danger' : ''}>{row.label}</li>
            ))}
          </ul>
        )
      }
    `
    const { clientJs } = compile(source, 'BenchDefer.tsx')
    const csrMirror = clientJs.slice(clientJs.indexOf('hydrate('))
    // The class attribute never appears as a literal `class="..."` write in
    // the SSR-mirror template string — it's covered entirely by the
    // per-row createEffect, matching the documented auto-defer mechanism.
    expect(csrMirror).not.toMatch(/class="danger"/)
  })
})
