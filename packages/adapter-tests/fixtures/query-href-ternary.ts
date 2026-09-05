import { createFixture } from '../src/types'

/**
 * `queryHref(base, { … })` inside a ternary attribute value with a real,
 * non-`undefined` alternate (#2743 follow-up — pullfrog review on #2841).
 * This shape is syntactically valid and distinct from the `undefined`-
 * alternate omission shape (tracked separately as #2842, whose consequent-
 * only render doesn't consult the lowering registry at all): here BOTH
 * branches already lower correctly via `bf_ternary`, so the only question
 * is whether the WHOLE ternary result gets the same html/template
 * URL-context-escaping bypass a direct `queryHref` call gets (see
 * `query-href.ts` / `query-href-src.ts`), regardless of which branch a
 * given render picks.
 */
export const fixture = createFixture({
  id: 'query-href-ternary',
  description: 'queryHref(base, {…}) inside a ternary attribute branch (non-undefined alternate) lowers through the query helper',
  source: `
import { queryHref } from '@barefootjs/client'

function QueryHrefTernaryLink({ ok, base, tag }: { ok: boolean; base: string; tag: string }) {
  return <a href={ok ? queryHref(base, { tag: tag }) : '/fallback'}>link</a>
}
export { QueryHrefTernaryLink }
`,
  props: { ok: true, base: '/items', tag: 'sale' },
  expectedHtml: `
    <a bf-s="test" bf="s0" href="/items?tag=sale">link</a>
  `,
  dataPoints: [
    // The other branch: when the condition is false, the query-lowered
    // consequent is never reached — the fallback literal renders as-is.
    { name: 'fallback-branch', props: { ok: false, base: '/items', tag: 'sale' } },
  ],
})
