import { createFixture } from '../src/types'

/**
 * `/* @client *\/` escape twin of `static-loop-client-only-nested`: the whole
 * outer loop is deferred to the client, so every adapter (the Go template
 * adapter included) compiles clean and SSR renders the empty, marker-bounded
 * loop host. The price of the escape is that no row is in the server HTML.
 * The array is empty so SSR and post-hydration DOM agree under CSR
 * conformance (same precedent as `static-nested-loop-conditional-client`).
 */
export const fixture = createFixture({
  id: 'static-loop-client-only-nested-client',
  description: 'Escape twin: the whole static outer loop marked /* @client */ compiles clean everywhere',
  source: `
type Child = { id: number }
type Item = { id: number; children: Child[] }

export function StaticLoopClientOnlyNestedClient() {
  const items: Item[] = []
  return (
    <ul>
      {/* @client */ items.map(item => (
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
    <ul bf-s="test" bf="s2"></ul>
  `,
})
