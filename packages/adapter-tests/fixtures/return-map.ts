import { createFixture } from '../src/types'

/**
 * Top-level `return items().map(n => <li/>)` — CallExpression at return
 * root. Pre-refactor the analyzer's recursion-fallback *skipped* the
 * map callback's arrow-function body (it explicitly does not recurse
 * into function bodies), so `jsxReturn` stayed unset and compilation
 * failed with "No marked template in compile output". The dispatcher
 * unification routes the CallExpression through `transformMapCall` the
 * same way JSX-child position does, producing an `IRLoop` wrapped in a
 * synthetic scope anchor.
 */
export const fixture = createFixture({
  id: 'return-map',
  description: 'Top-level return of .map produces a loop instead of failing to compile',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReturnMap() {
  const [items, setItems] = createSignal<string[]>(['a', 'b'])
  return items().map(n => <li key={n}>{n}</li>)
}
`,
  expectedHtml: `
    <div style="display:contents" bf-s="test">
      <li data-key="a"><!--bf:s0-->a<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
    </div>
  `,
})
