import { createFixture } from '../src/types'

/**
 * #2893's own minimal repro: a static (non-signal) OUTER array whose row
 * contains a nested `.map()` over a per-item array (`item.children`), with
 * no other dynamic content in either row. `analyzeBakeableStaticElementLoop`
 * used to bail the WHOLE outer loop the moment it saw a nested `loop` node
 * anywhere in the body (module docstring's original acceptance criteria),
 * falling through to the generic "computed loop array" BF101 refusal.
 *
 * Distinct from `static-nested-loop-ref` (#2798, this repo's other
 * nested-static-loop fixture): that one ALSO reads a signal
 * (`count()`) inside the inner row's text, which stays unresolvable by this
 * bake (a signal/memo call in TEXT position has no item-independent escape
 * hatch — unlike a `conditional`'s own condition, #2898 — so it still bails
 * for a narrower, separate reason). This fixture isolates the nested-loop
 * structural gate #2893 is actually about.
 */
export const fixture = createFixture({
  id: 'static-nested-loop-plain',
  description: 'a nested .map() over a per-item array inside a static outer loop bakes on the Go template adapter (#2893)',
  source: `
type Child = { id: number }
type Item = { id: number; children: Child[] }

export function StaticNestedLoopPlain() {
  const items: Item[] = [
    { id: 1, children: [{ id: 11 }, { id: 12 }] },
    { id: 2, children: [{ id: 21 }] },
  ]
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          {item.children.map(child => (
            <span key={child.id}>{child.id}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="1">
        <span data-key-1="11"><!--bf:s0-->11<!--/--></span>
        <span data-key-1="12"><!--bf:s0-->12<!--/--></span>
      </li>
      <li bf="s1" data-key="2"><span data-key-1="21"><!--bf:s0-->21<!--/--></span></li>
    </ul>
  `,
})
