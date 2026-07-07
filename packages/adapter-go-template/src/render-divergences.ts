/**
 * Render-level divergences against the shared conformance corpus
 * (Priority-12 edge-case sweep, #2168): fixtures that COMPILE clean on
 * this adapter but whose rendered output diverges from the Hono
 * reference on real Go — or whose generated Go fails `go run` outright
 * (marked "exit 1" below; those should eventually become loud BF101
 * refusals instead of broken codegen).
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
  'falsy-text-values':
    '`{false}` renders "false" (Hono drops it); `{null}`/`{undefined}` render empty (Hono renders "null") — neither side matches JSX semantics',
  'html-entity-text':
    '`&copy;` in JSX literal text: Hono decodes to `©`, this adapter re-emits the raw entity — same DOM, different bytes',
  'string-concat-plus':
    "`'Hello, ' + name` renders \"0\" — JS string-concat `+` lowered through numeric addition",
  'optional-chaining-prop':
    '`user?.name ?? …` on an object prop: generated Go fails to run (exit 1) — optional chaining into a struct/map prop has no lowering',
  'number-tofixed':
    '`.toFixed(2)` on a number PROP: generated Go fails to run (exit 1)',
  'math-methods':
    'Math.min/max/abs over a signal: generated Go fails to run (exit 1) — only Math.floor is registered',
  'boolean-attr-literals':
    'camelCase boolean alias `readOnly`: Hono SSRs `readOnly="true"`, this adapter emits bare presence',
  'camelcase-attributes':
    '`htmlFor` is not lowered to `for` (Hono maps it)',
  'static-attr-escape':
    'static attribute values are not HTML-escaped (`title="Fish & Chips"` emitted raw; Hono escapes)',
  'svg-icon':
    'SVG camelCase presentation attrs (`strokeWidth`, `strokeLinecap`) pass through unmapped; Hono lowers to kebab-case',
  'object-entries-map':
    '`Object.entries(prop).map(([k, v]) => …)`: generated Go fails to run (exit 1) — no object-iteration loop lowering',
  'nested-loop-outer-binding':
    'nested-loop inner items carry `data-key` where the reference emits the depth-suffixed `data-key-1`',
  'jsx-element-prop':
    'a JSX element passed as a NON-children prop renders an empty slot — the element value is silently dropped',
  'grandchild-composition':
    "three-level composition: the grandchild's threaded prop renders EMPTY — prop forwarding through two template-render layers loses the value",
  'child-primitive-props':
    'numeric/boolean LITERAL props on a child (`count={5}` `active={true}`) render as Go zero values (0 / false)',
  'memo-chain':
    'a memo derived from another memo renders EMPTY for the second layer — the constructor folds only one derivation level',
  'signal-object-field':
    'object-valued signal (`user().name`): generated Go fails to run (exit 1) — no struct synthesis outside loops',
  'string-slice':
    '`.slice()` on a STRING routes through the array `bf_slice` helper and renders "[]" instead of the substring',
  'string-trim-sided':
    '`.trimStart()` / `.trimEnd()`: generated Go fails to run (exit 1) — only both-sides `bf_trim` exists',
}
