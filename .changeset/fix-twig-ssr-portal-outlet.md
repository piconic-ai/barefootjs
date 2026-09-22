---
"@barefootjs/twig": patch
---

An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `{{ bf.portals() }}` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact.

Reuses the `register_portal_element`/`portals` methods #3123 already landed on the shared `@barefootjs/php` runtime (`BarefootJS.php`, shared with Blade) — no core runtime changes needed here, only this adapter's own Twig-syntax capture. `wrapSsrPortalElement` (`twig-adapter.ts`) captures the flagged element's already-rendered markup via Twig's own native `{% set NAME %}…{% endset %}` set-block (no custom extension needed, unlike Pebble — Twig supports this natively) — the same mechanism `renderComponent` already uses to forward JSX children — then hands it to `register_portal_element` through a second `{% set _ = … %}` statement, matching how `register_script` calls are already threaded through `{% set %}` purely for their side effect.

The plain-PHP example integration (`integrations/php/index.php`, which uses the Twig backend and renders the `PortalExample` fixture) now seeds `_portal_elements` with the same `ArrayObject`-for-reference-semantics trick `_scripts`/`_preloads` already use (`new_script_collector`/`share_script_collector`), and its `layout()` gains a `portals` parameter wired into the page shell next to the existing `scripts` output.

Verified against real PHP (`twig/twig` v3.29.0) for the `dialog` (two "use client" boundaries deep — `DialogContent` inside `Dialog`), `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values and full `normalizeHTML`-canonicalized output exactly.

Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off the Twig adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins. This was the last adapter citing the entry — it is now deleted (`packages/adapter-tests/limitations/ref-callback-portal-content-inline-at-ssr.ts`), and these four fixtures' `dialog`/`dropdown-menu`/`popover`/`portal` conformance now runs unpinned on every adapter, closing out #3119.
