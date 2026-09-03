/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Text::Xslate. The conformance `skipJsx` set and
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
// #2679 graduated (capture-before-shadow in `generateDerivedMemoSeed`,
// packages/adapter-xslate/src/adapter/memo/seed.ts): a self-referencing
// derived signal/memo now seeds a throwaway `__bf_seed_<name>` local from
// the RAW-stash-var Kolon lowering BEFORE `$<name>` is declared, then binds
// the real name off that capture — the same in-template recompute the other
// six template-stash backends already had. Keep the file even when the set
// is empty — the next divergence lands here, not in a re-created file.
export const renderDivergences: RenderDivergences = {
  'aliased-import-child-component':
    'A client component referenced under an import alias (`import { Foo as Bar }`, `<Bar/>`) renders WITHOUT error on real Text::Xslate but silently DROPS the child entirely — the SSR cross-template call is built from the caller-LOCAL alias name, never resolved to the child\'s own declared/registered name (`Foo`), and Xslate\'s unresolved reference degrades to nothing instead of raising. This is the SSR-side counterpart of #2777 (fixed for the client-JS registry key in the same PR that added this fixture) — that fix only touches `initChild`/`renderChild`/`@bf-child:` emission, not this adapter\'s own template-name builder. Tracked at https://github.com/piconic-ai/barefootjs/issues/2822; graduate by resolving the alias through the same import-alias mechanism #2777 introduced, exported for adapter reuse, rather than an Xslate-local alias walker.',
  'aliased-loop-source':
    'A `.map()` loop whose source is a local const alias of a signal getter (`const items__alias = items`) SSRs an empty `<ul>` on real Text::Xslate — the seeded loop data is keyed by the signal\'s real name (`items`), and the alias hop is never resolved when deciding what to seed under `items__alias`. This is the SSR-side twin of #2778 (fixed for the CSR client-JS template in the same PR that added this fixture) — that fix only touches client-JS emission, not SSR data-seeding. Tracked at https://github.com/piconic-ai/barefootjs/issues/2813; graduate by resolving the alias hop at SSR-seeding time using the same `resolveAliasOrigin`/`resolveGetterAliases` mechanism #2778 introduced, rather than a third alias-hop walker.',
}
