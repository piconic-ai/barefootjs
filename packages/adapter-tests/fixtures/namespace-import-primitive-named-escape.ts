import { createFixture } from '../src/types'

/**
 * `escapes` twin of `namespace-import-primitive` (#2771, BF013) — the
 * same component with `createSignal` imported by NAME instead of through
 * a `@barefootjs/client` namespace import, which resolves via
 * `resolvePrimitiveKind`'s ordinary fast path and compiles/renders
 * identically to Hono on every adapter.
 */
export const fixture = createFixture({
  id: 'namespace-import-primitive-named-escape',
  description: 'A named import of the reactive primitive (the BF013 escape) compiles and renders correctly',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NamespaceImportPrimitiveNamedEscape() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s1"><!--bf:s0-->0<!--/--></button>
  `,
})
