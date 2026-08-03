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

  // Onboarding TSX-fidelity fixtures (PR #2461): `expectedHtml` was
  // hand-authored to the CORRECT output while the emission bug lived in
  // the shared compiler layer — every adapter, including the Hono
  // reference, used to emit the broken form. That shared-layer defect
  // (#2460) is now FIXED (b4f5075): `expectedHtml` is generated from the
  // Hono reference like any other fixture. The remaining gap is
  // per-template-adapter — this adapter still keys its template vars /
  // ssr-defaults / props bridge off the local binding instead of
  // `sourceName ?? name` — tracked by #2524 (the 7 silent template
  // adapters). Graduate by applying the same `sourceName ?? name` fix to
  // this adapter's emission path and deleting this line (and the
  // matching hono `skipJsx` entries, already gone).
  'aliased-destructured-prop':
    'aliased destructured prop `{ n: count }` loses its rename — template vars, ssr-defaults, and the props bridge all key off the local name, so the prop is always undefined (https://github.com/piconic-ai/barefootjs/issues/2524)',
}
