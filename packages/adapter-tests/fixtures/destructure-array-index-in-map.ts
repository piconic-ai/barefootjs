import { createFixture } from '../src/types'

/**
 * Array-index (tuple) destructure in a `.map()` callback, no rest
 * (`([k, v]) => …`).
 *
 * #2087 Phase A extended `LoopParamBinding` with a structured `segments`
 * path (`{ kind: 'index', index }` / `{ kind: 'field', key, isIdent }`) so
 * template adapters can build a native accessor for ANY fixed-binding
 * shape — not just the single-level `.field` case the pre-#2087 gate
 * admitted. This fixture pins the plain tuple-destructure case (positional
 * bindings, no nesting, no rest) as the simplest new shape the gate
 * (`isLowerableLoopDestructure`) now accepts. Its nested-object sibling is
 * `destructure-nested-object-in-map`.
 *
 * Hono / CSR already lowered this pre-#2087 (the client-JS emit path is
 * unchanged — see `wrapLoopParamAsAccessor` / `renderLoopBindingAccess`).
 * All seven template adapters (Go, Mojo, Xslate, Twig, Jinja, ERB,
 * Rust/MiniJinja) lower it via their `segments`-based accessor emitters;
 * the loop item is an ARRAY here, so the fixed bindings start with an
 * index segment (`[0]` / `[1]`) rather than a field step.
 */
export const fixture = createFixture({
  id: 'destructure-array-index-in-map',
  description: 'Array-index (tuple) destructure in .map() callback, no rest (#2087)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Row = readonly [string, string]
export function IndexPairs() {
  const [rows, setRows] = createSignal<Row[]>([
    ['r1', 'a'],
    ['r2', 'b'],
  ])
  return (
    <ul onClick={() => setRows(r => r)}>
      {rows().map(([k, v]) => (
        <li key={k}>{k}:{v}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="r1"><!--bf:s0-->r1<!--/-->:<!--bf:s1-->a<!--/--></li>
      <li data-key="r2"><!--bf:s0-->r2<!--/-->:<!--bf:s1-->b<!--/--></li>
    </ul>
  `,
})
