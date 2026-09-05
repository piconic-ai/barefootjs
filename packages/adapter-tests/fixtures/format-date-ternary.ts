import { createFixture } from '../src/types'

/**
 * `formatDate(date, pattern)` (#2324) as the CONSEQUENT of a ternary
 * attribute value (#2843). Distinct from `query-href-ternary*`: `queryHref`'s
 * object-literal argument made the OLD per-adapter registry check's absence
 * a LOUD failure (BF101, the object literal itself is unsupported at
 * `'rendered'` position). `formatDate`'s arguments (a date expression, a
 * string-literal pattern) are all individually ordinary supported shapes, so
 * the old support gate never refused this call — the bug was SILENT: each
 * DSL adapter's own `call()` emitter method (reached by the ternary's
 * recursive `emit(consequent)`, not by the adapter's top-level
 * `convertExpressionTo*` entry point) had no registry consultation at all,
 * so a registered `formatDate` call nested in a ternary branch rendered as
 * an unrecognized bare identifier call instead of that backend's
 * `format_date` helper — wrong output, not a diagnostic.
 *
 * Fixed by the same #2843 mechanism as `query-href-ternary-undefined`: the
 * registry consultation moved into the shared `emitParsedExpr` dispatcher's
 * `call` case, so every adapter's ternary/template-literal/... recursion
 * benefits uniformly. No adapter needs a pin here — this shape now renders
 * correctly everywhere.
 */
export const fixture = createFixture({
  id: 'format-date-ternary',
  description: 'formatDate(date, pattern) as a ternary consequent lowers through the format_date helper',
  source: `
import { formatDate } from '@barefootjs/client'

function FormatDateTernaryFixture({ ok, createdAt }: { ok: boolean; createdAt: Date }) {
  return <time title={ok ? formatDate(createdAt, 'YYYY-MM-DD') : 'n/a'}>x</time>
}
export { FormatDateTernaryFixture }
`,
  props: { ok: true, createdAt: new Date('2024-01-01T00:00:00.000Z') },
  expectedHtml: `
    <time bf-s="test" bf="s0" title="2024-01-01">x</time>
  `,
  dataPoints: [
    // The condition is false: the alternate string literal renders verbatim,
    // not the (unevaluated) formatDate consequent.
    { name: 'alternate-branch', props: { ok: false, createdAt: new Date('2024-01-01T00:00:00.000Z') } },
  ],
})
