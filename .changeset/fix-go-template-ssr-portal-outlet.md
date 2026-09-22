---
"@barefootjs/go-template": patch
---

An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `{{.Portals.Render}}` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact. Verified against real `go run` output for the `dialog`, `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values exactly.

Two prerequisite fixes land alongside it, both real (if previously untested) gaps: `Portals *bf.PortalCollector` was never emitted on any generated `Props` struct, so the pre-existing explicit `<Portal>` component's `.Portals.Add` referenced a field that didn't exist; and portal-collector propagation to nested "use client" children (`PropagatePortals`, `runtime/bf.go`) now recurses through the WHOLE component tree instead of stopping at direct children — needed because the portal-owning primitives are themselves nested two "use client" boundaries below the page root (e.g. `DialogContent` lives inside `Dialog`, itself a child of the page's own demo component).

Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off this adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins (the shared known-limitation entry stays open for the other adapters that still exhibit it).
