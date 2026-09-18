import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `static-loop-client-only-nested` — the first
 * escape kind the Go template BF101 diagnostic claims, alongside the
 * `-client` twin. With the outer array moved to a prop the static-array
 * bake (`analyzeBakeableStaticElementLoop`, keyed off local constants) is
 * never consulted: the loop renders through the ordinary `{{range}}` path,
 * where a `/* @client *\/` nested loop is just a marker-bounded empty host.
 * Full SSR of the outer rows, unlike the `-client` twin.
 *
 * The per-item `children` arrays are empty for the same CSR-conformance
 * reason as the base fixture (post-hydration DOM must equal the SSR host).
 */
export const fixture = createFixture({
  id: 'static-loop-client-only-nested-precomputed',
  description: 'prop-precompute twin of static-loop-client-only-nested — items moved to a prop, full SSR of the outer rows',
  source: `
type Child = { id: number }
type Item = { id: number; children: Child[] }

export function StaticLoopClientOnlyNestedPrecomputed(props: { items: Item[] }) {
  return (
    <ul>
      {props.items.map(item => (
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
  props: {
    items: [{ id: 1, children: [] }, { id: 2, children: [] }],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="1"></li>
      <li bf="s1" data-key="2"></li>
    </ul>
  `,
})
