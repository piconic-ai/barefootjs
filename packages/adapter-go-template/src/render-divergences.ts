/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Go. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 *
 * (#2630's `static-array-from-props-with-component-precomputed` divergence
 * graduated once the harness (`test-render.ts`'s
 * `buildDynamicChildLoopSeeding`, despite the name — see its doc comment)
 * learned to seed a prop-backed static child-component loop's Props slice
 * the same way it already seeded a signal-backed dynamic one: the adapter's
 * own `emission` was never the bug, only this harness's route-handler
 * stand-in was missing the prop-derived case.)
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  // #2683: the props-struct emitter (`go-template-adapter.ts`) skips a
  // signal whose Go field name collides with a prop field, keyed purely on
  // the NAME collision — never on whether `extractPropFallback` actually
  // matched a supported `props.x ?? <default>` shape. For a non-idempotent
  // derivation (`createSignal((props.count ?? 1) * 2)`) the fallback
  // extractor correctly declines to fold `* 2` into the struct default, but
  // the `continue` fires anyway on the name match alone, so the emitted
  // struct field silently drops the `* 2` and the signal's initial value
  // renders as the raw prop instead of its derived value. Not a one-liner:
  // two Go struct fields can't share an identifier, so simply removing the
  // skip emits a duplicate field — the real fix needs its own PR.
  'signal-prop-same-name-derived':
    'self-derived signal collides with its prop field name in the generated Go props struct — the non-idempotent `* 2` derivation is dropped and the signal renders the raw prop value instead (https://github.com/piconic-ai/barefootjs/issues/2683)',
  // #2685 review: same #2683 bug, one hop of const indirection removed —
  // the props-struct field-name collision is keyed on the SIGNAL's name,
  // not on how its initializer reaches the prop, so
  // `const mid = props.count; createSignal((mid ?? 1) * 2)` collides
  // exactly like the direct-access form above. This is go's PRE-EXISTING
  // #2683 defect surfacing through a new fixture, not a regression from
  // the #2685 review fix (which lands correctly on every other
  // template-stash adapter — see those adapters' conformance runs).
  'signal-prop-same-name-via-const-derived':
    'self-derived signal (reached through a component-scope const) collides with its prop field name in the generated Go props struct — the non-idempotent `* 2` derivation is dropped and the signal renders the raw prop value instead (https://github.com/piconic-ai/barefootjs/issues/2683)',
}
