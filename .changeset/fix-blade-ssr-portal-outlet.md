---
"@barefootjs/php": patch
"@barefootjs/blade": patch
---

An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `{{ $bf->portals() }}` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact.

`BarefootJS::register_portal_element` / `portals()` (the shared engine-agnostic `@barefootjs/php` runtime, used by both Blade and Twig) collects each flagged element's already-rendered markup via `ob_start()`/`ob_get_clean()` around it — Blade compiles straight to interleaved PHP/HTML, so capturing an element's fully-evaluated output needs no Go-style "re-parse a string as a template" indirection. `_portal_elements` propagates through the same `ArrayObject`-for-reference-semantics mechanism `_scripts`/`_preloads` already use (`register_components_from_manifest`'s child-renderer closures, always rooted at the page's own `BarefootJS` instance), so it reaches any nesting depth — verified against real PHP (`illuminate/view` standalone) for the `dialog` (two "use client" boundaries deep), `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values and full `normalizeHTML`-canonicalized output exactly.

Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off the Blade adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins (the shared known-limitation entry stays open for the other adapters that still exhibit it).
