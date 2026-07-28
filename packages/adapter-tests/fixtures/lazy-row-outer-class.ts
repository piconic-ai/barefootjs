import { createFixture } from '../src/types'

/**
 * Lazy row graph (`spec/slot-unification.md` §9) — the ELIGIBLE shape.
 *
 * A keyed, single-root, conditional-free plain loop whose row carries both
 * item-driven texts (`{row.id}` / `{row.label}`) and one outer-involving
 * attribute (`className` reading the component-scope `selected()` signal).
 * That combination is exactly what `mapArrayLazy` splits across `applyItem`
 * (item texts) and the ONE loop-level `applyOuter` effect (the class), so it
 * is the fixture that would break first if the eligibility gate or the
 * emitted plan shape regressed.
 *
 * The SSR bytes below are the point of the fixture as much as the client JS:
 * L3 changes client emission ONLY, so this golden must stay byte-identical
 * to what the eager emission produced. `data-key` on each row is what the
 * runtime READS at adoption (never writes), per §9.2.
 */
export const fixture = createFixture({
  id: 'lazy-row-outer-class',
  description: 'Keyed plain loop with item texts plus an outer-signal class (lazy row graph, §9)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string }
export function LazyRowOuterClass() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, label: 'alpha' },
    { id: 2, label: 'beta' },
  ])
  const [selected, setSelected] = createSignal(0)
  return (
    <tbody>
      {rows().map(row => (
        <tr key={row.id} className={selected() === row.id ? 'danger' : 'plain'}>
          <td>{row.id}</td>
          <td onClick={() => setSelected(row.id)}>{row.label}</td>
        </tr>
      ))}
    </tbody>
  )
}
`,
  expectedHtml: `
    <tbody bf-s="test" bf="s4">
      <tr bf="s3" class="plain" data-key="1">
        <td><!--bf:s0-->1<!--/--></td>
        <td bf="s2"><!--bf:s1-->alpha<!--/--></td>
      </tr>
      <tr bf="s3" class="plain" data-key="2">
        <td><!--bf:s0-->2<!--/--></td>
        <td bf="s2"><!--bf:s1-->beta<!--/--></td>
      </tr>
    </tbody>
  `,
})
