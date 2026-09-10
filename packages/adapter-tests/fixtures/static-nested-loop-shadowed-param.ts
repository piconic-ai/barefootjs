import { createFixture } from '../src/types'

/**
 * A nested `.map()` whose param NAME SHADOWS the outer loop's param
 * (`items.map(item => item.children.map(item => ...))`) — the exact example
 * `staticLoopBindings()`'s own docstring (`go-template-adapter.ts`) uses to
 * justify "later entries win on a name collision", called out during #2893
 * review as a documented claim with no fixture proving it. `id` is present
 * on both the outer item and the inner item with DIFFERENT values, so a
 * wrong-precedence bug (outer wins instead of inner) would still bake —
 * just to the wrong, outer, id repeated across every child — rather than
 * refuse loudly.
 */
export const fixture = createFixture({
  id: 'static-nested-loop-shadowed-param',
  description: 'a nested .map() whose param name shadows the outer loop param resolves to the INNER item, not the outer one (#2893)',
  source: `
type Child = { id: number }
type Item = { id: number; children: Child[] }

export function StaticNestedLoopShadowedParam() {
  const items: Item[] = [
    { id: 1, children: [{ id: 11 }, { id: 12 }] },
    { id: 2, children: [{ id: 21 }] },
  ]
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          {item.children.map(item => (
            <span key={item.id}>{item.id}</span>
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
