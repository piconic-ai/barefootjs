import { createFixture } from '../src/types'

/**
 * `queryHref(base, { … })` as the CONSEQUENT of a ternary attribute value
 * whose alternate is `undefined` — the attribute-omission shape (#2842).
 * Distinct from `query-href-ternary.ts` (#2743 follow-up, a real non-
 * `undefined` alternate): that shape's consequent/alternate both already
 * lowered correctly, only the whole-attribute URL-escape bypass was
 * missing. This shape's consequent-only render used to bypass the lowering
 * registry entirely, emitting invalid Go template syntax with no
 * diagnostic. The fixture's primary point (`ok: true`) proves the consequent
 * lowers and gets the same escape bypass; the `omitted-branch` data point
 * proves the attribute is dropped entirely when the condition is false.
 */
export const fixture = createFixture({
  id: 'query-href-ternary-undefined',
  description: 'queryHref(base, {…}) as a ternary consequent with an undefined alternate omits the attribute or lowers through the query helper',
  source: `
import { queryHref } from '@barefootjs/client'

function QueryHrefTernaryUndefinedLink({ ok, base, tag }: { ok: boolean; base: string; tag: string }) {
  return <a href={ok ? queryHref(base, { tag: tag }) : undefined}>link</a>
}
export { QueryHrefTernaryUndefinedLink }
`,
  props: { ok: true, base: '/items', tag: 'sale' },
  expectedHtml: `
    <a bf-s="test" bf="s0" href="/items?tag=sale">link</a>
  `,
  dataPoints: [
    // The condition is false: the attribute is omitted entirely rather than
    // rendering `href=""` or attempting to render the (absent) consequent.
    { name: 'omitted-branch', props: { ok: false, base: '/items', tag: 'sale' } },
  ],
})
