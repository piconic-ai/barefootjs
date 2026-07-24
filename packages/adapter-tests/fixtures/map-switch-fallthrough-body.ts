import { createFixture } from '../src/types'

/**
 * A `.map()` callback body that is a `switch` with **fallthrough** — empty
 * `case` labels that share the next clause's return (`case 'a': case 'b':
 * return <b/>`). Stage 2 of `spec/callback-fidelity.md` accumulates the
 * fallthrough labels and folds the shared branch into a nested `IRConditional`
 * whose condition OR-joins the labels (`disc === 'a' || disc === 'b'`), so
 * both `a` and `b` render the same element.
 *
 * Neutral IR that renders on every backend — a positive cross-adapter fixture
 * with no `conformancePins`.
 */
export const fixture = createFixture({
  id: 'map-switch-fallthrough-body',
  description: 'switch with fallthrough case labels as a .map() body folds with an OR condition',
  source: `
function MapSwitchFallthrough({ items }: { items: { id: string; kind: string }[] }) {
  return (
    <ul>
      {items.map((it) => {
        switch (it.kind) {
          case 'a':
          case 'b':
            return <b key={it.id}>AB</b>
          default:
            return <span key={it.id}>D</span>
        }
      })}
    </ul>
  )
}
export { MapSwitchFallthrough }
`,
  props: { items: [{ id: '1', kind: 'a' }, { id: '2', kind: 'b' }, { id: '3', kind: 'z' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1"><!--bf-loop:l0--><b bf-c="s0" data-key="1">AB</b><b bf-c="s0" data-key="2">AB</b><span bf-c="s0" data-key="3">D</span><!--bf-/loop:l0--></ul>
  `,
})
