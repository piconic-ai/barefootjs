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
export const renderDivergences: RenderDivergences = {
  // #2883: `MojoFilterEmitter.identifier()` (expr/emitters.ts) resolves a
  // `.filter()` predicate identifier against only the loop param and
  // `localVarMap` — a bare-props-form renamed prop destructure (`const {
  // fallbackLabel: skipLabel } = props`, the #2788 alias family) falls
  // through to a bare `$skipLabel`, a Perl variable never declared in the
  // generated `.html.ep`. Every row is filtered out (the fixture's
  // reference expects only the non-matching row to survive). Unrelated to
  // #2857's Go Template adapter fix that this fixture was added for — this
  // fixture is a shared cross-adapter conformance fixture, not Go-specific.
  'filter-predicate-renamed-prop': 'https://github.com/piconic-ai/barefootjs/issues/2883',
  // #2886: `MojoFilterEmitter.member()` (expr/emitters.ts) has no `props.x`
  // flattening, unlike its non-filter sibling `member()` a few hundred
  // lines below — a bare-props-form prop read DIRECTLY (no destructure,
  // `props.hiddenId`) inside a `.filter()` predicate emits `$props->{...}`,
  // a Perl variable never declared under `use strict`. Same family as
  // #2879's Go Template adapter fix that this fixture was added for, but
  // this fixture is a shared cross-adapter conformance fixture, not
  // Go-specific.
  'filter-predicate-props-member': 'https://github.com/piconic-ai/barefootjs/issues/2886',
}
