---
"@barefootjs/rust": patch
---

An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `{{ bf.portals() | safe }}` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact.

`RenderSession::portal_elements` / `RenderSession::portals()` / `BfInstance::register_portal_element` (Rust runtime, `runtime.rs`) collect each flagged element's already-rendered markup, mirroring `scripts`/`register_script`'s existing shape. Unlike every other language port, this needed **no** propagation wiring at any call site: `RenderSession` is already `Arc`-shared across every `BfInstance` in a render tree (root and every `render_child` descendant, cloned by reference, never copied), so a portal element registered from a doubly-nested child is visible to the root's `portals()` call for free — the same reason `register_preload`'s existing docstring gives for why this port needs no per-child re-seeding the PHP/Python/Ruby/Perl/Java ports all require.

The minijinja adapter (`wrapSsrPortalElement`, `minijinja-adapter.ts`) captures the flagged element's already-rendered markup via minijinja's native `{% set NAME %}…{% endset %}` set-block — the same mechanism `renderComponent` already uses to forward JSX children — then hands it to `register_portal_element` through a second `{% set _ = … %}` statement, so nothing prints at the source position.

The conformance CLI (`bf-render`) and the Axum example integration (`LayoutOpts` gains a `portals` field, wired through every route that calls `render_component`/`render_component_with_raw_children` — including `portal_route`, which renders the `PortalExample` fixture, plus `ai_chat.rs`/`todo.rs`) both now surface `session.portals()` after the component's own output.

Verified against real Rust (minijinja 2.21) for the `dialog` (two "use client" boundaries deep — `DialogContent` inside `Dialog`), `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values and full `normalizeHTML`-canonicalized output exactly. `cargo build` clean for both the runtime crate and the Axum integration.

Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off the Rust adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins (the shared known-limitation entry stays open for the other adapters that still exhibit it).
