import { createFixture } from '../src/types'

/**
 * #2862: a signal seeded from a bare identifier referencing a MODULE-LEVEL
 * const whose value is an array-of-objects literal (and a sibling
 * object-literal const) — same family as #2794 (string/numeric module
 * consts) and #2815 (boolean module consts), both fixed by PR #2816, but
 * neither of those per-type resolvers (nor `convertInitialValue`'s other
 * typed branches) ever covered an ARRAY or OBJECT literal: `INITIAL`/
 * `SELECTED` typed `unknown` at the point `createSignal(INITIAL)` is seen
 * (the analyzer's type inference never chases the identifier to its
 * declaration), so `convertInitialValue` fell through every typed branch to
 * `nil` — the generated `NewModuleConstArraySeedProps` constructor emitted
 * `Rows: nil` and `Selected: Row{}` (the zero-value struct) instead of the
 * const's actual literal value. Real `go run` SSR rendered an empty `<ul>`
 * and an empty selected label where Hono (and every other adapter) renders
 * both rows and the selected label.
 */
export const fixture = createFixture({
  id: 'module-const-array-seed',
  description: 'Signal seeded from a module-level array/object-literal const bakes its literal value, not nil (#2862)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

interface Row {
  id: number
  label: string
}

const INITIAL: Row[] = [
  { id: 1, label: 'Alpha' },
  { id: 2, label: 'Bravo' },
]

const SELECTED: Row = { id: 1, label: 'Alpha' }

export function ModuleConstArraySeed() {
  const [rows] = createSignal<Row[]>(INITIAL)
  const [selected] = createSignal<Row>(SELECTED)
  return (
    <div>
      <p class="selected">{selected().label}</p>
      <ul>
        {rows().map(row => (
          <li key={row.id}>{row.label}</li>
        ))}
      </ul>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1" class="selected"><!--bf:s0-->Alpha<!--/--></p>
      <ul bf="s3">
        <li data-key="1"><!--bf:s2-->Alpha<!--/--></li>
        <li data-key="2"><!--bf:s2-->Bravo<!--/--></li>
      </ul>
    </div>
  `,
})
