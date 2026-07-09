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
  'string-concat-plus':
    "`'Hello, ' + name` renders \"0\" — JS string-concat `+` lowered through numeric addition",
  'optional-chaining-prop':
    '`user?.name ?? …` on an object prop: generated Go fails to run (exit 1) — optional chaining into a struct/map prop has no lowering',
  'number-tofixed':
    '`.toFixed(2)` on a number PROP: generated Go fails to run (exit 1)',
  'math-methods':
    'Math.min/max/abs/floor over a signal render "0" for every value — the fractional initial value (-7.6) types the signal field as Go `int` (zero value), not `float64`. `Math.min`/`Math.max`/`Math.abs` ARE now correctly registered/lowered (this is the same root cause as `number-tofixed`, not a registry gap: `typeInfoToGo`\'s `kind: \'primitive\'` branch hard-codes any TS `number` to Go `int` and never consults the literal value, unlike the `kind: \'unknown\'` branch\'s `inferTypeFromValue` fallback)',
  'object-entries-map':
    '`Object.entries(prop).map(([k, v]) => …)`: generated Go fails to run (exit 1) — no object-iteration loop lowering',
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
  'nested-loop-triple-depth':
    'a THIRD level of nested .map() renders every item field EMPTY (key values and text content alike), though the data-key/-1/-2 suffix naming itself is correct — Go loop-scope binding only reaches two levels deep',
}
