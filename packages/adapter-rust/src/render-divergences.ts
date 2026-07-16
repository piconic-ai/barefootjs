/**
 * Render-level divergences against the shared conformance corpus
 * (Priority-12 edge-case sweep, #2168): fixtures that COMPILE clean on
 * this adapter but whose rendered output diverges from the Hono
 * reference through the real `bf-render` minijinja binary.
 * (`string-concat-plus` is NOT here — minijinja's `+` concatenates
 * strings, unlike Perl/PHP/Twig.)
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
  // `object-catalogued` (#2277): same typed-backend gap as Go — an inline
  // object-typed prop's nested member access (`props.cfg.id`) renders empty
  // through the `bf-render` minijinja binary. The object-synthesis data
  // points still run the oracle on the dynamic backends + Hono.
  // https://github.com/piconic-ai/barefootjs/issues/2299
  'object-catalogued': 'inline object-prop member access renders empty — #2299',
  // `todo-app` / `todo-app-ssr` no longer diverge (#2209) — the shared
  // `evaluateSignalInit` (`@barefootjs/jsx`, sandboxed real-JS evaluation
  // instead of a fixed regex-shape catalogue) now correctly seeds `todos`
  // from `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))`.
}
