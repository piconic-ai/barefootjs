---
"@barefootjs/xslate": patch
---

An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `<: $bf.portals() :>` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact.

Reuses the `register_portal_element` / `portals` methods #3119's Mojolicious PR already landed on the shared `@barefootjs/perl` core (`BarefootJS.pm`) — no core changes needed here, only this adapter's own Kolon-syntax capture. `wrapSsrPortalElement` (`xslate-adapter.ts`) captures the flagged element's already-rendered markup via a zero-arg Kolon `macro` block (the same mechanism `renderComponent` already uses to forward JSX children), then hands the macro's rendered HTML to `register_portal_element` through a `:`-line statement bound to a throwaway `my` local — the same no-output trick `register_script`/`register_preload` already use, needed because Kolon's line-statement marker auto-prints a bare expression's value.

The Perl/PSGI example integration's own `render_component` helper (which registers child renderers by hand rather than through `register_components_from_manifest`, and renders the `PortalExample` fixture) now propagates `_portal_elements` the same way, and its `layout` gains a `$a{portals}` outlet next to the existing `$a{scripts}`.

Verified against real Perl (Text::Xslate v3.5.9) for the `dialog` (two "use client" boundaries deep — `DialogContent` inside `Dialog`), `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values and full `normalizeHTML`-canonicalized output exactly.

Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off the Xslate adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins (the shared known-limitation entry stays open for the other adapters that still exhibit it).
