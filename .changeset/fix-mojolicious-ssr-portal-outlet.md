---
"@barefootjs/mojolicious": patch
"@barefootjs/perl": patch
---

An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `<%== bf->portals %>` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact.

`BarefootJS::register_portal_element` / `portals` land on the shared, engine-agnostic `@barefootjs/perl` core (`BarefootJS.pm`), used by both the Mojolicious and Text::Xslate backends, mirroring `register_script`/`scripts`'s existing shape. `_portal_elements` propagates through the same arrayref-for-reference-semantics mechanism `_scripts`/`_preloads` already rely on — `_register_manifest_child`'s child-renderer closures always close over the page's own root `BarefootJS` instance, so the collector reaches any "use client" nesting depth the same way scripts already do, with no Go-style manual recursive-propagation helper needed.

The Mojo adapter (`wrapSsrPortalElement`, `mojo-adapter.ts`) captures the flagged element's already-rendered markup via Mojo's own `begin %>…<% end` block-capture — the same mechanism `renderComponent` already uses to forward JSX children — then hands the materialized `Mojo::ByteStream` to `register_portal_element` through a pure-statement `<% ... %>` tag, so nothing prints at the source position.

The Mojolicious example integration's own `render_component` helper (which registers child renderers by hand rather than through `register_components_from_manifest`, and renders the `PortalExample` fixture) now propagates `_portal_elements` the same way, and its `layouts/default.html.ep` layout gains a `<%== bf->portals %>` outlet next to the existing `bf->scripts` call.

Verified against real Perl (Mojolicious 9.49) for the `dialog` (two "use client" boundaries deep — `DialogContent` inside `Dialog`), `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values and full `normalizeHTML`-canonicalized output exactly.

Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off the Mojolicious adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins (the shared known-limitation entry stays open for the other adapters that still exhibit it — including the Xslate adapter, which shares this same `@barefootjs/perl` core fix but needs its own Kolon-syntax `wrapSsrPortalElement` equivalent).
