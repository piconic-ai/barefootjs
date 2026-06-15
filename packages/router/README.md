# @barefootjs/router

Automatic **partial-navigation** client router for BarefootJS.

On a same-origin link click it swaps **only the content outlet** and
re-hydrates the islands inside it — the surrounding shell (header,
sidebar, pagination nav) stays mounted with its signal state intact.
Think Turbo Drive / Turbo Frames, but the swap + re-hydration reuse
BarefootJS's existing runtime instead of a separate framework.

## Why this router

- **Progressive enhancement:** links remain ordinary links and the server returns ordinary complete HTML documents. There is no client route table or router-specific request header.
- **Backend independence:** any backend that renders the same outlet marker works without an adapter-specific protocol.
- **Island-aware partial navigation:** the shell stays mounted, outgoing scopes are disposed, newly required modules load, and only incoming islands hydrate.
- **Fast by intent:** hover/focus/press prefetch plus a bounded stale-while-revalidate cache reduces waits without sacrificing full-navigation fallback.

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
the payload.

## How it reuses the runtime

| Concern | Mechanism |
|---|---|
| Insert new HTML into a region | `replaceChildren` on the `[bf-outlet]` element |
| Load a navigated-to island's JS | import the response's `<script type="module" src>` (BfScripts) not already loaded — so a new island's `hydrate(name, def)` runs before re-hydration |
| Re-hydrate freshly inserted scopes | `window.__bf_hydrate_within(outlet)` → `rehydrateScope(outlet)` (subtree-scoped, O(outlet)) |
| Single-component fragment SSR | `renderToHtml(<Component/>)` from `@barefootjs/hono` |

## Prefetch & cache

On hover (after a short dwell), focus, or primary press (`pointerdown` —
mouse/touch/pen, which fires before `click`), the router
**prefetches** the link's page into an in-memory snapshot cache and
`modulepreload`s its island modules (fetch + compile, not execute). The
click then reuses the cached page with no network wait, and `import()`s
the already-preloaded modules. The cache also makes back/forward instant.
Disable with `startRouter({ prefetch: false })`.

**Cache lifecycle** (LRU-bounded, with three states per entry):

- **fresh** (`< cacheFreshMs`, default 15s): served as-is, no refetch.
- **aging** (`cacheFreshMs`…`cacheStaleMs`, default 15–60s): served
  *instantly* and refreshed in the background for next time
  (stale-while-revalidate; single-flight per URL). The refresh threshold is
  **jittered per entry (±30%)** so a batch of prefetches doesn't all
  revalidate at the same instant.
- **stale** (`> cacheStaleMs`, default 60s): too old to serve — refetched
  fresh, so a navigation never shows content past `cacheStaleMs`.

The cap (`cacheCap`, default 30) evicts least-recently-used (a cache hit
re-inserts), so a page reached again via back/forward survives. Only
**same-origin** island modules are imported on a swap (the browser owns
cross-origin scripts); a module load that fails is retried on a later
navigation rather than leaving the island inert.

Prefetch is **best-effort, like Next.js**: a failed prefetch is not cached,
so it never poisons the URL — the next prefetch or the click retries fresh
(and a click whose load ultimately fails falls back to a full navigation).
Re-hovering a fresh link does not re-fetch (deduped by the cache).

## Reactive search params (URL-bearing data state)

`@barefootjs/router/signals` exports `searchParams()` — a reactive read of
the URL query. An island reads it inside a memo/effect and updates
fine-grained when the query changes, **with no outlet swap and no
re-hydration**. This turns a URL-bearing, data-only change
(sort/filter/paginate/search) into a plain reactive update:

```ts
import { searchParams } from '@barefootjs/router/signals'

const sorted = createMemo(() => sortBy(items(), searchParams().get('sort')))
// a link to `?sort=price` re-runs `sorted`; the list reconciles fine-grained.
```

When `@barefootjs/router/signals` is loaded, a **same-route query-only**
navigation (link click or back/forward) updates the `searchParams()` signal
and the URL **without swapping the outlet**. A **pathname** change still
swaps (it's structural). If the signals module isn't loaded, query changes
swap as usual (legacy) — so it's opt-in by importing it.

The accessor is branded `Reactive<…>`, so the *existing* compiler
reactivity analysis wires the island's DOM updates — no new compiler
feature. It's a pure-runtime primitive: server and client read the same
source (request URL ↔ `location`), so they agree across hydration. (It's
the first of an intended "environment signal" family; an adapter-side SSR
impl that reads the request is a follow-up.)

## Package design

The public surface is intentionally small: `startRouter`, `navigate`, `Router`, and the optional `@barefootjs/router/signals` entry point. Internals are separated by responsibility: the controller handles browser events, `outlet.ts` parses documents, `cache.ts` owns fetching and freshness, and `seams.ts` isolates optional client-runtime integration.

## Limitations & next steps

- **No morph / persistent islands yet.** The outlet is fully replaced;
  an island present on both pages is re-created. A `data-bf-permanent`
  carry-over and idiomorph-style morphing are future work.
- **No scroll restoration on back/forward.** The router resets to top.
- **Outlet is authored, not compiler-derived yet.** Marking `bf-outlet`
  by hand is the v0 contract; auto-derivation from the scope tree is the
  intended end state.
