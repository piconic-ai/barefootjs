/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Java/Pebble. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

// #2994/#3000/#3012 fixed the silent-render divergence on all 8 sibling
// non-JS adapters by teaching their `call()` fallback to refuse the shape
// loudly with BF101 (#3011, #3014+). Pebble was developed on a separate
// stacked branch and didn't exist on `main` when those PRs landed, so it
// never received the port and was still on the old silent-divergence
// behavior for all three fixtures formerly pinned here.
//
// #3022 graduated all three: `call()`'s generic fallback for a bare-name
// identifier callee now refuses loudly with BF101 (`conformance-pins.ts`)
// instead of silently resolving the name against Pebble's template scope
// (undefined → empty render / falsy-picks-the-wrong-branch). No
// `_boolContext`-style structural exemption was ported — `isValidElement`
// (the one caller that needed to keep compiling, `ui/components/ui/slot`'s
// `asChild` guard) is resolved as an identity-scoped `templatePrimitive`
// (`bf.is_element`, backed by a new Java port of the shared BarefootJS
// runtime's shape-check method, `java/.../Bf.java`) ahead of `call()`'s
// generic fallback, so it never reaches the refusal at all.
export const renderDivergences: RenderDivergences = {
  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `bf.register_portal_element`/`bf.portals()`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/pebble-adapter.ts`) and `register_portal_element`/`portals`
  // (`java/…/pebble/Bf.java`).
  // `combobox` / `select` carry the SAME #3059 portal-position divergence
  // (their Content element is the same `ref`-callback SSR-portal pattern),
  // but the registry lists a fixture on exactly one entry and these two
  // are already claimed by `ref-effect-attr-state-ssr` (the data-placeholder
  // divergence) — cite that one instead; see
  // `ref-callback-portal-content-inline-at-ssr`'s own comment.
  combobox: { limitation: 'ref-effect-attr-state-ssr' },
  select: { limitation: 'ref-effect-attr-state-ssr' },
}
