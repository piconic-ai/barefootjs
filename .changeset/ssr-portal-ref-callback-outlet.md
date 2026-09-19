---
"@barefootjs/hono": patch
"@barefootjs/jsx": patch
"@barefootjs/client": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Fix the `ref-callback-portal-content-inline-at-ssr` known limitation on the Hono adapter: a `ref` callback whose body calls `createPortal(el, document.body, { ownerScope })` (the pattern `dialog`/`dropdown-menu`/`popover`/`portal` use) is now recognized structurally by the compiler and the flagged element renders at its portal outlet (`<BfPortals />`) during SSR, matching where hydration's `createPortal` places it — so hydration is a structural no-op instead of a relocation. The client `isSSRPortal` guard also recognizes `bf-po` set directly on the element, not only a `bf-pi` wrapper ancestor. Every other template adapter still renders the flagged element inline (no SSR portal outlet yet) and is pinned with a `render-divergences.ts` entry citing the registry limitation.
