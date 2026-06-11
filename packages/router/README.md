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

## Backend cooperation is optional

With **no server change** the router fetches the full page and extracts
`[bf-outlet]` client-side (zero backend gimmick — works against any
backend, including Go/Perl adapters).

To cut payload, a backend may return **just the outlet fragment** when it
sees the `X-Barefoot-Navigate` request header. Both response shapes are
accepted. Example with Hono:

```ts
import { BF_NAVIGATE_HEADER } from '@barefootjs/router'

app.get('/blog/:page', async (c) => {
  const props = await loadPage(c.req.param('page'))
  if (c.req.header(BF_NAVIGATE_HEADER)) {
    c.header('Vary', BF_NAVIGATE_HEADER)
    return c.html(await renderToHtml(<PostBody {...props} />)) // fragment only
  }
  return c.render(<Page {...props} />)                          // full shell
})
```

## How it reuses the runtime

| Concern | Mechanism |
|---|---|
| Insert new HTML into a region | `replaceChildren` on the `[bf-outlet]` element |
| Re-hydrate freshly inserted scopes | `window.__bf_hydrate` → `rehydrateAll()` (the same walk the streaming `__bf_swap` primitive uses) |
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
