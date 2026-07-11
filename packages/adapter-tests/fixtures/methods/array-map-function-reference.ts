import { createFixture } from '../../src/types'

/**
 * Function-reference `.map(cb)` callback (#2206).
 *
 * `tags.map(format)` passes a named function reference rather than an inline
 * arrow. `resolveCallbackMethodFunctionReferences` (jsx-to-ir.ts) resolves
 * `format` one hop to its same-file `const`/`function` declaration and
 * splices the resolved arrow body in place, so the shape compiles exactly
 * as if `format`'s body had been written inline — on every adapter, not
 * just the JS-runtime ones. Before #2206, no arrow body existed to
 * serialize into the runtime evaluator's ParsedExpr JSON, so every
 * template adapter refused the shape loudly with BF101 via the
 * `UNSUPPORTED_METHODS` gate rather than silently dropping the callback.
 */
export const fixture = createFixture({
  id: 'array-map-function-reference',
  description: '.map(format).join(" ") with a function-reference callback resolves and renders on every adapter',
  source: `
const format = (t: string) => '#' + t
function TagLine({ tags }: { tags: string[] }) {
  return <p>{tags.map(format).join(' ')}</p>
}
export { TagLine }
`,
  props: { tags: ['perl', 'go'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->#perl #go<!--/--></p>
  `,
})
