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
  // `todo-app` / `todo-app-ssr` no longer diverge (#2209) — the shared
  // `evaluateSignalInit` (`@barefootjs/jsx`, sandboxed real-JS evaluation
  // instead of a fixed regex-shape catalogue) now correctly seeds `todos`
  // from `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))`.

  // Onboarding TSX-fidelity fixtures (PR #2461): `expectedHtml` is
  // hand-authored to the CORRECT output because the emission bug lives in
  // the shared compiler layer — every adapter, including the Hono
  // reference, currently emits the broken form (verified against this
  // adapter's emitted template; see each fixture's docstring). Graduate
  // by fixing the shared emission, regenerating `expectedHtml` from the
  // fixed reference, and deleting these lines (and the matching hono
  // `skipJsx` entries).
  'aliased-destructured-prop':
    'aliased destructured prop `{ n: count }` loses its rename — template vars, ssr-defaults, and the props bridge all key off the local name, so the prop is always undefined (https://github.com/piconic-ai/barefootjs/issues/2460)',

  // #2482 audit follow-ups: loop-scope holes in per-adapter name
  // classification. Graduate by applying the loop-bound-name guards
  // described in each issue and deleting the line.
  'loop-param-shadows-spread-const':
    'a .map() param shadowing an object const is resolved by `emitSpread` against `localConstants` with no loop-shadow check (the live `loopBoundNames` map exists but is not consulted on this path), so every row spreads the OUTER const instead of the row value (https://github.com/piconic-ai/barefootjs/issues/2489)',
  'loop-param-shadows-record-template-span':
    'a dynamic-key element access on a loop row (`tone[k]`) renders empty: row hashes deserialize with SYMBOL keys while the dynamic key is a STRING, so `tone["a"]` is nil (https://github.com/piconic-ai/barefootjs/issues/2491)',
}
