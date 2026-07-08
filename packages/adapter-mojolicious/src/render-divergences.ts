/**
 * Render-level divergences against the shared conformance corpus
 * (Priority-12 edge-case sweep, #2168): fixtures that COMPILE clean on
 * this adapter but whose rendered output diverges from the Hono
 * reference on real Mojolicious.
 *
 * Consumed by this package's conformance test (its `skipJsx` set is
 * derived from these keys, so the skip list and this declaration can't
 * drift) and by `packages/compat`, which publishes the entries in the
 * fixture-divergences section of `ui/compat.lock.json` — surfaced on
 * the docs compatibility-matrix page. Graduating an entry means fixing
 * the adapter (or the shared compiler layer) and deleting the line.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  'arithmetic-text':
    '`(count() + 2) * 3` renders 10 instead of 18 — the parenthesised sub-expression loses its grouping (silent wrong arithmetic)',
  'string-concat-plus':
    "`'Hello, ' + name` renders \"0\" — Perl's numeric `+` coerces the strings; JS string-concat `+` needs Perl's `.`",
  'string-length-text':
    '`.length` on a STRING prop diverges (array-length lowering misapplied to a scalar)',
  'number-tofixed':
    'the literal `¥` in template text reaches the output as U+FFFD — a UTF-8 encoding gap for non-ASCII literal text adjacent to a dynamic slot',
  'html-entity-text':
    '`&copy;` in JSX literal text: Hono decodes to `©`, this adapter re-emits the raw entity — same DOM, different bytes',
  'math-methods':
    'Math.min/max/abs over a signal render empty (only Math.floor is in the template-primitive registry)',
  'boolean-attr-literals':
    'camelCase boolean alias `readOnly`: Hono SSRs `readOnly="true"`, this adapter emits bare presence',
  'camelcase-attributes':
    '`htmlFor` is not lowered to `for` (Hono maps it)',
  'static-attr-escape':
    'static attribute values are not HTML-escaped (`title="Fish & Chips"` emitted raw; Hono escapes)',
  'svg-icon':
    'SVG camelCase presentation attrs (`strokeWidth`, `strokeLinecap`) pass through unmapped; Hono lowers to kebab-case',
  'object-entries-map':
    '`Object.entries(prop).map(([k, v]) => …)` renders an EMPTY list — the object-shaped prop silently produces zero iterations',
  'nested-loop-outer-binding':
    'nested-loop inner items carry `data-key` where the reference emits the depth-suffixed `data-key-1`',
  'jsx-element-prop':
    'a JSX element passed as a NON-children prop renders an empty slot — the element value is silently dropped',
  'string-slice':
    '`.slice()` on a STRING misfires through the array slice helper',
  'string-trim-sided':
    '`.trimStart()` / `.trimEnd()` render empty (no lowering)',
}
