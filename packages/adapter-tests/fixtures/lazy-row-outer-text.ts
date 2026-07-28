import { createFixture } from '../src/types'

/**
 * Lazy row graph (`spec/slot-unification.md` §9) — an eligible row whose
 * CONTENT slot is outer-involving (§9.5c(1), lifted).
 *
 * The sibling `lazy-row-outer-class` covers the attribute half: an
 * outer-involving `className` seeds against `getAttribute`. This fixture
 * covers the half that used to make the whole loop ineligible — a TEXT
 * binding reading the component-scope `selected()` signal. Its §9.3(1)
 * read-compare-write seed needs a DOM read-back for a content slot, which
 * `lazyClaimSlots(...).read(id)` now provides, so the emitter claims this
 * loop's row through the READ-capable door and every text write becomes
 * `__r[w].write(...)`. `lazy-row-outer-class` stays on the cheap write-only
 * `lazySlots` door — the choice is per LOOP, and this pair pins both sides.
 *
 * The row deliberately mixes both text kinds: `{row.label}` is item-driven
 * (applyItem only) while the YES/NO cell reads BOTH the item and the outer
 * signal, so it lands in `applyItem` and `applyOuter` alike.
 * `String(... ? ... : ...)` rather than a bare ternary because a bare
 * ternary in child position compiles to a reactive CONDITIONAL, which §9.4
 * refuses outright (that shape is `lazy-row-ineligible-fallback`'s job).
 *
 * Same SSR-bytes obligation as its siblings: this golden reflects the
 * unchanged template emission — the widening is client-side only.
 */
export const fixture = createFixture({
  id: 'lazy-row-outer-text',
  description: 'Keyed plain loop whose row text reads an outer signal (lazy row graph, §9.5c(1) lifted)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string }
export function LazyRowOuterText() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, label: 'alpha' },
    { id: 2, label: 'beta' },
  ])
  const [selected, setSelected] = createSignal(2)
  return (
    <tbody>
      {rows().map(row => (
        <tr key={row.id}>
          <td>{row.label}</td>
          <td onClick={() => setSelected(row.id)}>{String(selected() === row.id ? 'YES' : 'NO')}</td>
        </tr>
      ))}
    </tbody>
  )
}
`,
  expectedHtml: `
    <tbody bf-s="test" bf="s3">
      <tr data-key="1">
        <td><!--bf:s0-->alpha<!--/--></td>
        <td bf="s2"><!--bf:s1-->NO<!--/--></td>
      </tr>
      <tr data-key="2">
        <td><!--bf:s0-->beta<!--/--></td>
        <td bf="s2"><!--bf:s1-->YES<!--/--></td>
      </tr>
    </tbody>
  `,
})
