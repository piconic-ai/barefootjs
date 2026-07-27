import { createFixture } from '../src/types'

/**
 * Lazy row graph (`spec/slot-unification.md` §9) — the INELIGIBLE twin of
 * `lazy-row-outer-class`, pinning the fallback half of the sound-or-loud
 * contract (§9.3): a loop the §9.4 gate refuses keeps today's eager
 * `mapArray` + renderItem emission, unchanged.
 *
 * The refusal here is §9.4's "no conditionals in the row": the row body is a
 * reactive conditional (`row.done ? <b/> : <i/>`), which needs `insert()` and
 * its own per-branch disposable effects — exactly the per-row reactive
 * machinery the lazy row graph deletes. The loop is otherwise a textbook
 * eligible shape (keyed, single-root, no preamble, literal-seeded signal
 * source), so this fixture isolates that one gate.
 *
 * Same SSR-bytes obligation as the eligible fixture: this golden must not
 * move — L3 touches client JS only.
 */
export const fixture = createFixture({
  id: 'lazy-row-ineligible-fallback',
  description: 'Keyed loop whose row is a reactive conditional — refused by the §9.4 gate, keeps eager emission',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function LazyRowIneligibleFallback() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, label: 'alpha', done: true },
    { id: 2, label: 'beta', done: false },
  ])
  return (
    <ul>
      {rows().map(row => (
        <li key={row.id}>{row.done ? <b>{row.label}</b> : <i>{row.label}</i>}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li data-key="1"><b bf-c="s0"><!--bf:s1-->alpha<!--/--></b></li>
      <li data-key="2"><i bf-c="s0"><!--bf:s2-->beta<!--/--></i></li>
    </ul>
  `,
})
