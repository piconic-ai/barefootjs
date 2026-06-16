# Router & Region Specification (RFC / Draft)

> **Status:** RFC / Draft. Supersedes [#1910](https://github.com/piconic-ai/barefootjs/pull/1910)
> (closed "to rethink it"). Fixes the vision and the **region** (page-lifecycle
> boundary) model; the package surface follows from it.

## Vision

**"A better MPA that earns continuity as the shell grows interactive — without a
client route manifest, loader protocol, or RSC payload."**

Plain `<a>`, plain complete HTML, any backend. The router progressively preserves
browser work (DOM, signal state, focus, long-lived effects) only where safe, and
never makes a page worse than plain server rendering. Two responsibilities stay
separate: the **router owns continuity**; the **SSR layer owns streaming/Suspense**.

## Positioning

| Approach | Nav unit | Continuity | Backend | Streaming | Link annotation |
|---|---|---|---|---|---|
| Plain MPA | full doc | none | any | backend | none |
| Turbo | full doc → body swap | `turbo-permanent` / Frames | any | manual | per-Frame |
| htmx | fragment | non-target survives | fragments | manual | per-link `hx-*` |
| Next Pages Router | client transition | whole tree is SPA | Node/React | none | none |
| Next App Router (RSC) | RSC payload | nested layouts persist | Node/React | first-class | none |
| Astro `<ClientRouter>` | full doc → swap | `transition:persist` | any | View Transitions | none |
| **BarefootJS** | full doc → **nested regions** | **scope-precise** | **any** | **backend SSR** | **none** |

- **vs MPA** — prefetch + continuity, but never worse (always falls back to full load).
- **vs Turbo** — scope-precise dispose/re-hydrate, not whole-body swap + manual `permanent`.
- **vs App Router** — recover nested-layout continuity + streaming via islands + backend
  streaming, dropping RSC, Node lock-in, the four-layer cache, and the non-HTML payload.
- **vs Astro** — a real cross-route reactive graph + `searchParams()` reactivity.

## Regions

A **region** is a page-lifecycle boundary: everything *outside* persists across a
navigation; everything *inside* is disposed, re-loaded, and re-hydrated. Real apps
have several persistence zones (a route-updating sidebar, a persistent player, a
fully-swapping content area), so regions **nest**. The single broad region is the
degenerate v0 case.

**Author marks, compiler derives.** Zero-input inference of "which subtree is the
shell" is not feasible: `bf build` compiles strictly per file
(`discoverComponentFiles`, `packages/cli/src/lib/build.ts`) with no cross-page
graph, so one page's tree never reveals that `Shell` is shared. (App Router
`layout.tsx` and React Router `<Outlet/>` are authored too.) So the author places
`<Region>` once and the compiler derives the rest:

```tsx
export function Shell({ children }) {
  return <div><Nav/><Region>{children}</Region></div>
}
```

`<Region>` is recognised by its `@barefootjs/client` import (structural, not
string-matched). From the IR it already has, the compiler derives:

- **Lowering** → the host element gets a `BF_REGION` (`bf-region`) marker via the
  same emit path as `needsScope` → `bf-s` (`renderElement`, hono-adapter). Add the
  marker to `packages/shared/src/markers.ts`, add `IRElement.regionId?: string`;
  each adapter emits a static `bf-region="{id}"` (one line, no per-backend logic).
- **Stable id** = `<layout file scope>:<structural index>`, deterministic via
  `computeFileScope` (FNV hash, not per-run random). Layouts compile to a shared
  partial, so every page renders the *same* region markup with the *same* id —
  cross-page matching falls out for free. **This is the load-bearing requirement**
  (random ids would break matching).
- **Scope ownership** = each `bf-s` scope belongs to its nearest enclosing
  `[bf-region]`. A swap disposes exactly those scopes, then re-hydrates the incoming
  subtree via `rehydrateScope(root)` (O(subtree), `packages/client/src/runtime/hydrate.ts`).

**Nested vs sibling** — placement encodes it; nothing is declared:

- Nested `<Region>…<Region/>…</Region>` → the deepest region whose owned content
  differs swaps; ancestors persist.
- Sibling `<><Region/><Region/></>` → independent regions (master–detail: the detail
  swaps while the list pane keeps its DOM/scroll/state). Distinct ids are automatic.
- Both are multiple swap regions within **one URL-driven navigation** — *not* App
  Router parallel routes (per-region route state would need the route manifest we reject).

## Lifecycle

On an interceptable same-origin click (or `navigate(href)`):

1. Resolve the target page (SWR cache, else fetch full HTML).
2. Match `[bf-region=id]` between current and incoming docs; the **deepest region
   whose owned content differs** is the swap point (fallback to the broadest region
   if an id is absent — the v0 single-region behavior).
3. Dispose the swap point's owned scopes (fallback to `disposeScope`).
4. Load new island modules (`<script type=module src>` not yet loaded), resolving
   relative `src` against the **response URL**, not `location`.
5. `replaceChildren` + `rehydrateScope` on the incoming subtree; outer regions/shell untouched.
6. Commit history + `<title>`, **preserving existing `history.state`**.
7. Move focus to the swapped region and announce the route change.

Query-only navigations short-circuit before step 2, abort any in-flight swap
(last-wins), update `searchParams()` + the URL, and do not swap.

## The wedge: environment signals (`searchParams` first)

`searchParams()` is a reactive read of the query string: a same-route, query-only
navigation updates the signal + URL **with no swap and no re-hydration**, and islands
reconcile fine-grained — uniquely clean on an arbitrary backend. It is the first
**request-scoped reactive environment signal** (ambient request/browser state, correct
per-request under SSR, reactive on the client, with **no new compiler feature** — the
existing `Reactive<>` brand wires it). Cookies (non-`httpOnly` only) are a follow-up;
the generic `createEnvSignal` stays **internal** (only concrete instances are exported).

- **Lives in `@barefootjs/client` top-level**, not a `@barefootjs/router/signals` entry.
  The authoring import is the SSR-safe facade; the real impl is in `/runtime`. Riding
  the shared `@barefootjs/client/reactive` runtime means there is structurally **one
  instance** — the #1910 "two signals silently disconnect" failure cannot occur.
- **No subscription side effect.** The router already owns `popstate`/query-only nav, so
  it **pushes** updates through a seam (`__pushSearch`); `searchParams()` is a near-pure
  read of a lazily-created signal. So an island that never uses it ships **zero** of it,
  given `"sideEffects": false` on the client package and a static (opt-in) router seam.
- **Request-scoped SSR.** Read the initial value from an adapter-specific per-request
  context (Hono: `useRequestContext().req`; Go/Perl: a `BfEnv.*` binding the handler
  fills and the template bakes in) — not a process-wide module global (which races).

## Suspense / streaming

Owned by the **backend SSR layer**, not a client protocol. Slow regions stream as
ordinary out-of-order HTML (`@barefootjs/streaming`); the router only **must not break**
in-flight streaming and re-hydrates islands as chunks land. The client-transition feel
comes from prefetch + stale-while-revalidate (and an optional skeleton during a swap).
No `<Suspense>` / `loading.tsx` / streaming protocol of its own.

## Seams & correctness

Must be **correct by default** — the #1910 failure (silent island leaks unless the dev
calls `setupStreaming()`) is unacceptable. `startRouter()` installs the runtime seams
itself; both `dispose` and `rehydrate` degrade through the **same** fallback chain ending
at `@barefootjs/client/runtime` (`disposeScope`/`rehydrateScope`). Neither may silently no-op.

## Public surface

- `startRouter(options?)` — install once on the client; no-op on the server.
- `navigate(href)` — programmatic; environment-guarded (SSR no-op, not throw).
- `searchParams` is a `@barefootjs/client` export, **not** a router export; the router
  only drives it via `__pushSearch`. No `@barefootjs/router/signals` entry.

## Phased plan

- **v0 — single authored region, correct by default.** Seams auto-install; shared
  dispose/rehydrate fallback; `history.state` preserved; response-URL base resolution;
  focus/a11y on swap. The "never worse than MPA" floor.
- **v0.5 — `searchParams` done right.** In `@barefootjs/client` (lazy, side-effect-free,
  router-driven); request-scoped SSR; `"sideEffects": false`. Cookies later.
- **v1 — persistence within a region.** `data-bf-permanent` + idiomorph-style morphing.
- **v2 — compiler-derived nested regions.** Smallest proof: `BF_REGION` + `IRElement.regionId`
  + `<Region>` lowering in `jsx-to-ir.ts`; a Hono fixture asserting a stable id reused
  across two pages; a runtime test for nearest-enclosing-region dispose + subtree rehydrate.

## Limitations & non-goals

- True zero-input region inference would need a separate, fragile cross-page diff pass
  (lone-page layouts, conditional shells, per-route layouts confound it). Ship authored
  boundaries first; treat inference as a later optional lint/codemod.
- Permanent islands and scope-ownership edge cases (portals, context/loops crossing a
  region) need conformance fixtures before v2 is more than a sketch.
- No scroll restoration; modulepreload links/dedupe set are session-lived (cap later).
- **Non-goals:** client route manifest / loader protocol / fragment endpoint; RSC-style
  boundary or non-HTML payload; client-owned Suspense protocol; navigation/content-negotiation header.
