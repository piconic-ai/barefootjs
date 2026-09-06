/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Mojolicious. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

// #2696 graduated: `todo-app` / `todo-app-ssr` seeded `todos` opaque
// because their `.map(t => ({ ...t, editing: false }))` callback body's
// object-literal SPREAD refused (`checkSupport`). Step 2 admits a spread
// at value position and the runtime evaluator's `object-literal` case
// now merges it, so the seed classifies `derived` and SSRs identically
// to Hono.
// https://github.com/piconic-ai/barefootjs/issues/2788 — a renamed
// `children` destructure (`const { children: kids } = props`) interpolates
// the LOCAL alias into the `.html.ep`, and the stash only carries the
// caller-facing `children`, so Perl dies inside `Mojo::Template::process`
// at render time rather than at build. Seven adapters resolve the alias;
// only Mojo does not. Same family as `aliased-destructured-prop`'s
// `{ n: count }` shape, one level in — the reserved children slot.
// Delete this entry when #2788 is fixed: `children-passthrough-renamed`
// already asserts the correct (Hono-generated) output, so it becomes the
// regression test the moment the skip comes off.
export const renderDivergences: RenderDivergences = {
  'children-passthrough-renamed':
    'A renamed `children` destructure emits the local alias as a template variable; the stash defines only `children`, so the Perl render dies (#2788).',
}
