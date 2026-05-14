import { createFixture } from '../src/types'

/**
 * Inline style object with a dynamic prop value.
 *
 * A JS object literal in an attribute position — full-JS-runtime
 * adapters (Hono, CSR) render it directly at request time, while
 * SSR text-template adapters (Go, Mojo) can't lower the literal into
 * their template syntax. The latter assert the corresponding refusal
 * via `expectedDiagnostics` on their own test file (#1266).
 */
export const fixture = createFixture({
  id: 'style-object-dynamic',
  description: 'Inline style object with dynamic prop value renders as CSS string',
  source: `
export function StyleObjectDynamic({ color }: { color: string }) {
  return <div style={{ backgroundColor: color, padding: '8px' }}>Hello</div>
}
`,
  props: { color: 'red' },
  expectedHtml: `
    <div style="background-color:red;padding:8px" bf-s="test" bf="s0">Hello</div>
  `,
})
