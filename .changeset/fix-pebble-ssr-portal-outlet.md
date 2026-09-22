---
"@barefootjs/pebble": patch
---

An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `{{ bf.portals() | raw }}` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact.

`Bf.register_portal_element`/`Bf.portals()` (Java runtime, `Bf.java`) collect each flagged element's already-rendered markup, mirroring `register_script`/`scripts()`'s existing shape — including the SAME `synchronized (scripts)` monitor, since `Bf.newRoot` makes this bundle reachable from independent top-level island renders on separate threads, not just a single-threaded `render_child` recursion. `portalElements` threads through the private canonical constructor exactly like `scripts`/`preloads` (a shared `List` reference, never copied), so `render_child` and `newRoot` propagate it to any nesting depth for free, with no Go-style manual recursive-propagation helper needed.

The Pebble adapter (`wrapSsrPortalElement`, `pebble-adapter.ts`) captures the flagged element's already-rendered markup via this adapter's own custom `{% set NAME %}…{% endset %}` set-block extension (`SetBlockExtension`, `java/…/pebble/ext/`) — the same mechanism `renderComponent` already uses to forward JSX children — then hands it to `register_portal_element` through a second `{% set _ = … %}` expression statement, so nothing prints at the source position.

The conformance CLI (`Main.render`) and the Spring example integration (`Render.Rendered` gains a `portals` field; `Layout.Opts`/`Layout.render` gain a `portals` outlet next to `scripts`, wired through `DemoController`/`TodoController`/`AiChatController`, which render the `PortalExample` fixture) both now surface the collected portal content after the component's own output.

Verified against real Pebble (Java 21, `io.pebbletemplates:pebble`) for the `dialog` (two "use client" boundaries deep — `DialogContent` inside `Dialog`), `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values and full `normalizeHTML`-canonicalized output exactly.

Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off the Pebble adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins (the shared known-limitation entry stays open for the other adapters that still exhibit it).
