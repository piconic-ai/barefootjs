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
  each adapter emits a static `bf-region="<id>"` attribute (one line, no per-backend logic).
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
2. Match `[bf-region="<id>"]` between current and incoming docs; the **deepest region
   whose owned content differs** is the swap point (fallback to the broadest region
   if an id is absent — the v0 single-region behavior).
3. Dispose the swap point's owned scopes (fallback to `disposeScope`).
4. Load new island modules (`<script type=module src>` not yet loaded), resolving
   relative `src` against the **response URL**, not `location`.
5. `replaceChildren` + `rehydrateScope` on the incoming subtree; outer regions/shell untouched.
6. Commit history + `<title>`, **preserving existing `history.state`**.
7. Move focus to the swapped region and announce the route change.

Steps 1-7 run with `data-bf-navigating` set on `<html>`, cleared in the swap's
`finally`. It exists because step 5 splits into two observable moments: the
markup is committed, and only THEN is it re-hydrated — through a dynamic
`import()` of the runtime in the fallback seam. Between them the swapped-in
islands are server markup with no handlers, so a click is silently lost. The
attribute is the only thing that distinguishes "present" from "interactive";
without it, "wait for the element, then click it" looks correct and fails
intermittently under load. Only the CURRENT navigation clears it — a superseded
one reaches its `finally` while its successor is still mid-swap.

Query-only navigations short-circuit before step 2, abort any in-flight swap
(last-wins), update `searchParams()` + the URL, and do not swap — so they never
set the attribute: nothing is re-rendered, so there is no interactivity gap to
describe.

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
- `data-bf-navigating` on `<html>` — set for the duration of a region swap (see
  Lifecycle). Style off it for a loading indicator, or wait for its absence
  before driving anything the swap brought in. `NAVIGATING_ATTR` is exported for
  callers that would otherwise hard-code the string.

## Phased plan

- **v0 — single authored region, correct by default.** ✅ Shipped. Seams auto-install;
  shared dispose/rehydrate fallback; `history.state` preserved; response-URL base
  resolution; focus/a11y on swap. The "never worse than MPA" floor.
- **v0.5 — `searchParams` done right.** ✅ Shipped. In `@barefootjs/client` (lazy,
  side-effect-free, router-driven); request-scoped SSR; `"sideEffects": false`. Cookies later.
- **v1 — persistence within a region.** ✅ Shipped. `data-bf-permanent` + idiomorph-style morphing.
- **v2 — compiler-derived nested regions.** ✅ Shipped. `BF_REGION` + `IRElement.regionId`
  + `<Region>` lowering in `jsx-to-ir.ts` (compiler) and the matching runtime in
  `@barefootjs/router`: on a navigation the router matches `[bf-region]` ids between the
  live and incoming documents and swaps only the **deepest regions whose owned content
  differs** (nested + sibling), falling back to the broadest single swap — or a hard
  navigation when the region structure diverges and no root contains all. The
  owned-content diff is taken against a **server-render baseline** (not the island-mutated
  live DOM) and **normalizes per-render hydration scaffolding** (the random `bf-s` scope
  ids), so a region containing an island is not mistaken for "changed". Covered by the
  cross-adapter `region-boundary` fixture (stable id), `router-regions.test.ts` (nested /
  sibling / divergence), and the `integrations/router-blog` example (hand-authored sibling
  + compiled nested regions, verified in a real browser).
- **v2.5 — head metadata reconciliation.** ✅ Shipped ([#2438](https://github.com/piconic-ai/barefootjs/issues/2438)).
  A swap reconciles a **closed allowlist** of page metadata against the incoming document
  (`reconcileHead`, `packages/router/src/head.ts`): `description`/`keywords`/`robots`/`author`/
  `theme-color`, the `og:` and `twitter:` namespaces, and `rel=canonical|alternate|prev|next`.
  Present in both → replaced (skipped when already equal); only incoming → added; only current
  → **removed**, so nothing leaks forward. `data-bf-head="false"` opts a node out.

  **Default-on with no option, deliberately.** Metadata is page-scoped by definition, costs no
  load, has no layout effect or ordering hazard, and is idempotent — while a stale
  `<meta name="description">` is *invisible* wrongness (unlike the tab title, you cannot see it
  in development). That is exactly the class "correct by default" above exists for. The
  allowlist being **closed** is the deliberate divergence from Turbo's `provisionalElements`,
  which removes every untracked head element and so can sweep away runtime-injected analytics
  or CSP nodes. And because the incoming document is already parsed for the region diff, this
  is a bounded node diff over data in hand — no manifest, no payload, no fetch. (Next's App
  Router routes the same job through the RSC payload and has carried soft-navigation metadata
  bugs across many releases; the document-diff position is the easier one.)

## Limitations & non-goals

- True zero-input region inference would need a separate, fragile cross-page diff pass
  (lone-page layouts, conditional shells, per-route layouts confound it). Ship authored
  boundaries first; treat inference as a later optional lint/codemod.
- v2 ships the nested/sibling swap, but scope-ownership edge cases where a region boundary
  crosses a portal, context provider, or loop still need dedicated conformance fixtures —
  the owned-content diff is HTML-structural, so a region split across one of these is not
  yet guaranteed.
- No scroll restoration; modulepreload links/dedupe set are session-lived (cap later).
- **Head *resources* are not reconciled** ([#2438](https://github.com/piconic-ai/barefootjs/issues/2438);
  head *metadata* is — see v2.5 above). `<link rel="stylesheet">`, `<script>` and `<style>` in
  `<head>` are left untouched in both directions, because a resource's lifetime is not
  derivable from the incoming document: the shell, a `[data-bf-permanent]` node, a portal, or
  an island outliving the region may still need a sheet the next page's head omits. So
  route-scoped CSS belongs **inside** the region — `rel="stylesheet"` is body-ok per HTML, and
  the sheet then enters and leaves with the swap, getting both orderings right by construction
  with no load awaited in the nav path. A head-stylesheet opt-in is deferred, and the shape is
  constrained: it must add incoming sheets **before** the swap and remove outgoing ones
  **after**, or the page paints unstyled in one direction and loses its styles for a frame in
  the other. Both precedents converge on the removal half needing an author signal — Turbo
  never removes a sheet unless it carries `data-turbo-track="dynamic"`; Remix removes them
  automatically and has open issues where the outgoing route goes unstyled mid-transition. So
  if it ever ships it is a **per-element `data-bf-head` marker**, never a global
  `startRouter({ head: … })` option: scope is a property of the element, not of the app.
- **Non-goals:** client route manifest / loader protocol / fragment endpoint; RSC-style
  boundary or non-HTML payload; client-owned Suspense protocol; navigation/content-negotiation header.
