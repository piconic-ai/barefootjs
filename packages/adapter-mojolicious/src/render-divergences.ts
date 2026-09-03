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
  'aliased-import-child-component':
    'A client component referenced under an import alias (`import { Foo as Bar }`, `<Bar/>`) dies inside `Mojo::Template::process` on real Mojolicious — the SSR cross-template call is built from the caller-LOCAL alias name, never resolved to the child\'s own declared/registered name (`Foo`). This is the SSR-side counterpart of #2777 (fixed for the client-JS registry key in the same PR that added this fixture) — that fix only touches `initChild`/`renderChild`/`@bf-child:` emission, not this adapter\'s own template-name builder. Tracked at https://github.com/piconic-ai/barefootjs/issues/2822; graduate by resolving the alias through the same import-alias mechanism #2777 introduced, exported for adapter reuse, rather than a Mojo-local alias walker.',
  'children-passthrough-renamed':
    'A renamed `children` destructure emits the local alias as a template variable; the stash defines only `children`, so the Perl render dies (#2788).',
  'aliased-loop-source':
    'A `.map()` loop whose source is a local const alias of a signal getter (`const items__alias = items`) dies inside `Mojo::Template::process` on real Mojolicious — the seeded loop data is keyed by the signal\'s real name (`items`), and the alias hop is never resolved when deciding what to seed under `items__alias`. This is the SSR-side twin of #2778 (fixed for the CSR client-JS template in the same PR that added this fixture) — that fix only touches client-JS emission, not SSR data-seeding. Tracked at https://github.com/piconic-ai/barefootjs/issues/2813; graduate by resolving the alias hop at SSR-seeding time using the same `resolveAliasOrigin`/`resolveGetterAliases` mechanism #2778 introduced, rather than a third alias-hop walker.',
}
