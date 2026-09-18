import { createFixture } from '../src/types'

/**
 * A static (non-signal) outer `.map()` whose row contains a `/* @client *\/`
 * nested `.map()`. Every JS-runtime and DSL adapter renders the outer rows
 * with an empty, marker-bounded inner loop host (the client fills it after
 * hydration, exactly like `client-only-loop`). The Go template adapter's
 * static-array bake (`isFoldableTree`) refuses a `clientOnly` loop inside a
 * baked row and falls through to the generic BF101 "computed loop array"
 * refusal — registry limitation `client-only-loop-in-static-loop`.
 *
 * Contrast `static-nested-loop-plain`, the same shape with the inner loop
 * server-rendered, which the Go bake handles.
 *
 * The per-item `children` arrays are deliberately EMPTY: CSR conformance
 * compares `expectedHtml` against the post-hydration DOM, and a populated
 * inner array would hydrate to real `<span>` content, diverging from the
 * empty SSR host this fixture pins (same precedent as
 * `static-nested-loop-conditional-client`). The refusal this fixture exists
 * for is structural (`isFoldableTree` sees a `clientOnly` loop node), so the
 * data does not affect it.
 */
export const fixture = createFixture({
  id: 'static-loop-client-only-nested',
  description: 'A /* @client */ nested .map() inside a static outer loop row renders the outer rows with an empty inner loop host',
  escapes: [
    { kind: 'prop-precompute', fixture: 'static-loop-client-only-nested-precomputed' },
    { kind: 'client-directive', fixture: 'static-loop-client-only-nested-client' },
  ],
  source: `
type Child = { id: number }
type Item = { id: number; children: Child[] }

export function StaticLoopClientOnlyNested() {
  const items: Item[] = [
    { id: 1, children: [] },
    { id: 2, children: [] },
  ]
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          {/* @client */ item.children.map(child => (
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
      <li bf="s1" data-key="1"></li>
      <li bf="s1" data-key="2"></li>
    </ul>
  `,
})
