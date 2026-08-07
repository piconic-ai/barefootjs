import { createFixture } from '../src/types'

/**
 * Nested ternary chain (`a ? … : b ? … : …`) under a NON-reactive outer
 * condition — a module-level `const`, not a signal read (#2470).
 *
 * `nested-ternary.ts` covers the same `a ? … : b ? … : …` shape but with a
 * signal-conditioned OUTER condition, which routes through the reactive
 * `wrapWithCondMarker` fragment-embedding path and never exercised the bug.
 * Here the outer condition has no `slotId` (no signal/prop/call involved),
 * so the Hono adapter takes the non-reactive branch: `renderConditional`
 * renders the whenFalse branch — itself an `IRConditional` — through
 * `renderNodeRawCtx`, which used to fall through to the generic
 * `renderNode`/`emitConditional` dispatch and re-wrap the nested ternary in
 * its own `{…}`. That's correct for a JSX-child position but invalid where
 * this nested ternary actually sits: the ALTERNATE of the outer ternary,
 * where only a bare JS expression is legal. The extra brace pair broke the
 * emitted `.tsx`'s parse (`Expected "}" but found "==="`) with zero
 * diagnostics. `renderNodeRawCtx` now special-cases a nested `conditional`
 * node the same way it already special-cases a bare `null`/`undefined`
 * expression branch, splicing in the bare ternary body
 * (`renderConditionalBody`) instead of a second `{…}`-wrapped copy.
 */
export const fixture = createFixture({
  id: 'nested-ternary-bare-branch',
  description: 'Nested ternary chain under a non-reactive (module-const) outer condition (#2470)',
  source: `
const MODE = 'b'
export function Chain() {
  return <div>{MODE === 'a' ? <span>A</span> : MODE === 'b' ? <span>B</span> : <span>C</span>}</div>
}
`,
  expectedHtml: `
    <div bf-s="test"><span>B</span></div>
  `,
})
