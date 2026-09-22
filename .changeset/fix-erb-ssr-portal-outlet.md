---
"@barefootjs/erb": patch
---

An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `<%= bf.portals %>` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact.

`BarefootJS::Context#register_portal_element` / `#portals` collect each flagged element's already-rendered, fully-evaluated markup via the same output-buffer-slice mechanism `renderComponent` already uses to capture forwarded JSX children (`_erbout.slice!`) — ERB compiles straight to interleaved Ruby + HTML, so no Go-style "re-parse a string as a template" indirection is needed. `_portal_elements` propagates through the same array-object-reference sharing `_scripts`/`_preloads` already rely on, reaching any "use client" nesting depth for free through `register_components_from_manifest`'s child-renderer closures (all rooted at the page's own `Context` instance) — unlike the Go adapter, no separate recursive-propagation helper was needed.

The Rails and Sinatra example integrations' own hand-rolled `render_component` helpers (which register child renderers directly rather than through `register_components_from_manifest`, and both render the `PortalExample` fixture) now propagate `_portal_elements` the same way and wire a `<%= portals %>`-equivalent call into their page layout, next to the existing `scripts` output.

Verified against real Ruby (`ruby 3.3`, stdlib `erb`) for the `dialog` (two "use client" boundaries deep — `DialogContent` inside `Dialog`), `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values and full `normalizeHTML`-canonicalized output exactly.

Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off the ERB adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins (the shared known-limitation entry stays open for the other adapters that still exhibit it).
