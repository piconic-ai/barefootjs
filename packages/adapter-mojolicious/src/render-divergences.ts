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
// #2943 graduated: a BODY-destructured prop's default now reaches
// `ParamInfo.defaultValue` directly (the analyzer overlays it onto
// `propsParams` at the binding's own declaration), so `extractSsrDefaults`
// seeds the evaluated default and the adapter's presence guard no longer
// treats the prop as defaultless — `data-label` now renders `'none'` here
// exactly like Hono, both for a plain default and a renamed one.
// #2994 graduated both entries formerly here (`module-const-arrow-helper`,
// `module-function-helper-chain`): a module-scope helper call in a
// template position (arrow-valued const OR `function` declaration) now
// refuses loudly with BF101 at compile time instead of silently crashing
// Perl `strict`-mode template execution — see `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // A component-body const bound to an opaque call (`const label =
  // makeLabel()`) and invoked in text position lowers to a bare template
  // variable named after the const, with no diagnostic — the reference runs
  // the accessor at render time. Escape twin:
  // `opaque-local-accessor-call-client`.
  'opaque-local-accessor-call': { limitation: 'opaque-local-accessor-call' },
  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `bf->register_portal_element`/`bf->portals`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/mojo-adapter.ts`) and `register_portal_element`/`portals`
  // (`@barefootjs/perl`'s shared `BarefootJS.pm`).
  // `combobox` / `select` carry the SAME #3059 portal-position divergence
  // (their Content element is the same `ref`-callback SSR-portal pattern),
  // but the registry lists a fixture on exactly one entry and these two
  // are already claimed by `nested-child-static-prop-text-slot-elided` (the
  // text-slot-marker divergence) — cite that one instead; see
  // `ref-callback-portal-content-inline-at-ssr`'s own comment.
  combobox: { limitation: 'nested-child-static-prop-text-slot-elided' },
  select: { limitation: 'nested-child-static-prop-text-slot-elided' },
  // A client component whose whole return is a child-component call: the
  // reference wraps the child's output in the parent's `<!--bf-scope:...-->`
  // comment pair (with the parent's props) so the parent hydrates; this
  // adapter renders the child's output bare. `normalizeHTML` strips scope
  // comments, so the byte comparison alone cannot see it — the explore
  // adapter axis (`comment-root-child-slot`) shows the parent's forwarded
  // handler doing nothing after hydration.
  'component-root-client-scope': { limitation: 'component-root-client-scope-comment' },
}
