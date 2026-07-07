/**
 * Render-level divergences against the shared conformance corpus
 * (Priority-12 edge-case sweep, #2168): fixtures that COMPILE clean on
 * this adapter but whose rendered output diverges from the Hono
 * reference on real Ruby erb (or fails at render time).
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
  'html-entity-text':
    '`&copy;` in JSX literal text: Hono decodes to `©`, this adapter re-emits the raw entity — same DOM, different bytes',
  'optional-chaining-prop':
    '`user?.name ?? …` on an object prop: the Ruby render exits 1 (optional chaining into a Hash prop has no lowering)',
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
    '`Object.entries(prop).map(([k, v]) => …)` renders but its loop item keys diverge from the reference serialisation',
  'nested-loop-outer-binding':
    'nested-loop inner items carry `data-key` where the reference emits the depth-suffixed `data-key-1`',
  'jsx-element-prop':
    'a JSX element passed as a NON-children prop renders an empty slot — the element value is silently dropped',
  'string-slice':
    '`.slice()` on a STRING lowers through the array slice helper and renders "[]" instead of the substring',
  'string-trim-sided':
    '`.trimStart()` / `.trimEnd()` render empty (no lowering; only both-sides `.trim` is wired)',
}
