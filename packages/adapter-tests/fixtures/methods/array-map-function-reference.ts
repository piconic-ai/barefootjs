import { createFixture } from '../../src/types'

/**
 * Function-reference `.map(cb)` callback (#2073 follow-up).
 *
 * `tags.map(format)` passes a named function reference rather than an inline
 * arrow — there is no arrow body to serialize into the runtime evaluator's
 * ParsedExpr JSON, so the template adapters (Go / Mojo / Xslate) refuse the
 * shape loudly with BF101 via the `UNSUPPORTED_METHODS` gate rather than
 * silently dropping the callback. Hono / CSR evaluate real JS at runtime and
 * render it like any other `.map` — same marker/attr shape as
 * `array-map-value-template`.
 */
export const fixture = createFixture({
  id: 'array-map-function-reference',
  description: '.map(format).join(" ") with a function-reference callback renders on JS-runtime adapters',
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
