# @barefootjs/router

Automatic **partial-navigation** client router for BarefootJS.

On a same-origin link click it swaps **only the content outlet** and
re-hydrates the islands inside it — the surrounding shell (header,
sidebar, pagination nav) stays mounted with its signal state intact.
Think Turbo Drive / Turbo Frames, but the swap + re-hydration reuse
BarefootJS's existing runtime instead of a separate framework.

> **Prototype.** This is a minimal first cut: outlet-scoped swap,
> history, title, re-hydration. See [Limitations](#limitations--next-steps).

## Why "automatic"

You mark the swappable region **once**. Every internal `<a>` then
partial-updates with no per-link annotation (unlike htmx's
`hx-target`/`hx-select` on each link). The long-term goal is for the
compiler to derive the outlet boundary from the component tree and emit
`bf-outlet` automatically — the router already keys off that marker.

## Usage

Mark the content region and start the router once on the client:

```html
<body>
  <header>… persistent shell …</header>

  <main bf-outlet>
    <article>… page content …</article>
    <a href="/blog/2">Next</a>   <!-- just a normal link -->
  </main>

  <script type="module">
    import { startRouter } from '@barefootjs/router'
    startRouter()
  </script>
</body>
```

That's it. Clicking `/blog/2` fetches the page, swaps the `<main bf-outlet>`
contents, updates the URL + `<title>`, and re-hydrates the new islands.

### Options

```ts
startRouter({
  outlet: '[bf-outlet]',        // selector for the swappable region
  scrollToTop: true,            // reset scroll after a swap
  rehydrate: () => {...},       // override re-hydration (default: window.__bf_hydrate)
  dispose: (outlet) => {...},   // tear down outgoing islands before the swap
  shouldIntercept: (a, e) => boolean,
})
```

Programmatic navigation:

```ts
import { navigate } from '@barefootjs/router'
await navigate('/blog/3')
```

Opt a link out with `data-bf-router="false"`, `target`, `download`, or
`rel="external"`.

## No backend cooperation needed

The router **always fetches the full page** and extracts `[bf-outlet]`
client-side — zero backend gimmick, works against any backend (including
the Go/Perl adapters). There is **no content-negotiation header**.

Returning just the outlet fragment from the server was considered and
**deliberately dropped**: it would shave only highly-compressible shell
markup (gzip already handles that) while *hurting* cache efficiency
(`Vary`-fragmented per URL) and forcing every fragment to re-include its
island `<script type="module">` tags and `<title>`. The navigation cost
that matters is the round-trip — addressed by prefetch, not by shrinking
the payload. (`extractOutlet` still tolerates a bare-fragment response if
a backend returns one, but the router never asks for it.)

## How it reuses the runtime

| Concern | Mechanism |
|---|---|
| Insert new HTML into a region | `replaceChildren` on the `[bf-outlet]` element |
| Load a navigated-to island's JS | import the response's `<script type="module" src>` (BfScripts) not already loaded — so a new island's `hydrate(name, def)` runs before re-hydration |
| Re-hydrate freshly inserted scopes | `window.__bf_hydrate_within(outlet)` → `rehydrateScope(outlet)` (subtree-scoped, O(outlet)) |
| Single-component fragment SSR | `renderToHtml(<Component/>)` from `@barefootjs/hono` |

## Limitations & next steps

- **Disposal is GC-based.** Outgoing islands with only local signal
  state are reclaimed when their DOM detaches. Islands subscribed to
  shared/module signals need explicit disposal — pass a `dispose`
  callback for now. Precise per-scope disposal (wrapping each scope's
  `init` in `createRoot` and keying the dispose fn by scope element in
  `@barefootjs/client`) is the planned follow-up.
- **No morph / persistent islands yet.** The outlet is fully replaced;
  an island present on both pages is re-created. A `data-bf-permanent`
  carry-over and idiomorph-style morphing are future work.
- **No snapshot cache / prefetch yet.** Back/forward and hover-prefetch
  (the perceived-speed wins) are not implemented.
- **Outlet is authored, not compiler-derived yet.** Marking `bf-outlet`
  by hand is the v0 contract; auto-derivation from the scope tree is the
  intended end state.
