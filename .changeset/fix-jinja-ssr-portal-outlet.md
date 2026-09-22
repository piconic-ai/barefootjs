---
"@barefootjs/jinja": patch
---

An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `{{ bf.portals() | safe }}` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact.

`BarefootJS.register_portal_element`/`portals` (Python runtime, `runtime.py`) collect each flagged element's already-rendered markup via Jinja's native `{% set NAME %}…{% endset %}` set-block — the same mechanism `renderComponent` already uses to forward JSX children — then hand it to the collector through a second `{% set _ = … %}` statement (never `{{ }}`), so nothing prints at the source position. `_portal_elements` propagates through the same list-object-reference sharing `_scripts`/`_preloads` already rely on (Python lists are mutable references), reaching any "use client" nesting depth for free through `register_components_from_manifest`'s child-renderer closures, with no Go-style manual recursive-propagation helper needed.

Verified against real Python (Jinja2) for the `dialog` (two "use client" boundaries deep — `DialogContent` inside `Dialog`), `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values and full `normalizeHTML`-canonicalized output exactly.

The Flask/Django/FastAPI example integrations' own hand-rolled `render_component` helpers (which register child renderers by hand rather than through `register_components_from_manifest`, and all three render the `PortalExample` fixture) now propagate `_portal_elements` the same way, and their `layout()` gains a `portals` parameter wired into the page shell next to the existing `scripts` output.

Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off the Jinja adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins (the shared known-limitation entry stays open for the other adapters that still exhibit it).
