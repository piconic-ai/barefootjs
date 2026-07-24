import { createFixture } from '../src/types'

/**
 * A `.map()` callback body with a leading `const` preamble before an if/else
 * branch — `{ const label = fmt(it); if (it.on) return <b/>; return <span/> }`.
 * Stage 2 of `spec/callback-fidelity.md`: a JS-runtime adapter folds this into
 * a nested `IRConditional` and emits the preamble once per iteration, so the
 * local is in scope in both branches; a DSL adapter can't carry a loop-local
 * into a conditional branch template, so it refuses (BF021) rather than render
 * the local `undefined` (a silent divergence).
 *
 * Adapter-gated, like the off-subset filter/sort predicates:
 *   - Hono / CSR fold and run it; the reference `expectedHtml` renders the
 *     labels faithfully.
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) surface BF021 with the
 *     `/* @client *\/` escape (declared via each adapter's `conformancePins`);
 *     marking the map client-only defers the whole loop to the browser, which
 *     runs the preamble. (The `/* @client *\/` escape is exercised in the
 *     `map-multi-return-body` compiler-unit test.)
 */
export const fixture = createFixture({
  id: 'map-preamble-branch-body',
  description: 'const preamble + if/else as a .map() body — JS-runtime folds, DSL refuses (BF021)',
  source: `
function MapPreambleBranch({ items }: { items: { id: string; on: boolean; kind: string }[] }) {
  return (
    <ul>
      {items.map((it) => {
        const label = it.kind.toUpperCase()
        if (it.on) return <b key={it.id}>{label}</b>
        return <span key={it.id}>{label}</span>
      })}
    </ul>
  )
}
export { MapPreambleBranch }
`,
  props: { items: [{ id: '1', on: true, kind: 'a' }, { id: '2', on: false, kind: 'b' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1"><!--bf-loop:l0--><b bf-c="s0" data-key="1">A</b><span bf-c="s0" data-key="2">B</span><!--bf-/loop:l0--></ul>
  `,
})
