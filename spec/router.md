# Router Specification (RFC / Draft)

> **Status:** RFC / Draft — supersedes the design shipped in
> [#1910](https://github.com/piconic-ai/barefootjs/pull/1910), which was closed
> "to rethink it." This document fixes the *vision and north star* first; the
> package surface follows from it.

## Vision

**"A better MPA that earns continuity as the shell grows interactive — without
ever adopting a client route manifest, loader protocol, or RSC payload."**

The router starts as ordinary multi-page navigation (plain `<a>`, plain
complete HTML responses, any backend) and *progressively* preserves more of the
browser's work — DOM, signal state, focusable UI, long-lived effects — only
where it is safe to do so. It must never make a simple page worse than a plain
server-rendered page; it should become *more* valuable as the shell becomes
more interactive.

Two responsibilities are kept strictly separate:

- **The router owns continuity** — what survives a navigation and what is torn
  down and re-hydrated.
- **The SSR layer owns streaming/Suspense** — slow regions stream as ordinary
  HTML from the backend. The router must *not break* that; it does not
  implement a client-side Suspense protocol. (See [Suspense](#suspense--streaming).)

## North star: compiler-derived nested outlets

An **outlet** is a page-lifecycle boundary: everything outside it persists
across a navigation; everything inside it is disposed, re-loaded, and
re-hydrated. PR #1910 modeled this as a *single, hand-authored* outlet on a
broad↔narrow spectrum. That single cut cannot express what real apps need: a
sidebar that updates with the route, a media player that must persist, and a
content region that fully swaps are **three different persistence zones**, not
one.

The north star is therefore **nested outlets derived by the compiler from the
component tree** — which is the same idea as Next.js App Router's persistent
nested layouts, minus RSC, minus Node lock-in, minus a non-HTML payload
protocol:

- Each level of the route/component tree has a **persistent layout** plus a
  **swappable child region** (the nested outlet).
- On navigation, only the deepest segments that actually changed are disposed
  and re-hydrated; outer layouts keep their DOM and signal state.
- The boundary is **emitted by the compiler** (`bf-outlet` markers derived from
  the scope tree), not annotated per link and not hand-placed.

**The single authored outlet is the degenerate (broadest) case of this model**,
and remains the v0 contract while derivation is built. Adopting the router must
never force a site to stop being server-rendered.

## Positioning vs existing approaches

| Approach | Nav unit | Continuity | Backend req. | Streaming/Suspense | Link annotation |
|---|---|---|---|---|---|
| Plain MPA | full document | none | any | backend-owned | none |
| Turbo / Turbolinks | full doc → body swap | `turbo-permanent` / Frames | any | Turbo Streams (manual) | per-Frame |
| htmx | fragment | non-target survives | must return fragments | SSE / manual | per-link `hx-*` |
| Next Pages Router | client transition | whole tree is SPA | Node/React | none | none |
| Next App Router (RSC) | RSC payload | **nested layouts persist** | Node/React/bundler | **first-class** (`loading.tsx`) | none |
| Inertia | JSON page object | persistent layout | server adapter | none | none |
| Astro `<ClientRouter>` | full doc → swap | `transition:persist` | any (static/SSR) | View Transitions | none |
| **BarefootJS Router** | full doc → **nested outlets** | **scope-precise, compiler-derived** | **any** | **backend SSR layer** | **none** |

Differentiators, in one line each:

- **vs plain MPA** — prefetch + state continuity, but never worse; always falls
  back to a full-page load.
- **vs Turbo** — scope-precise dispose/re-hydrate instead of whole-body swap +
  manual `permanent`; the boundary is compiler-derived, not hand-placed.
- **vs htmx** — navigation-centric, zero per-link annotation; the server returns
  ordinary pages, not fragments.
- **vs App Router** — recover the good parts (nested-layout continuity,
  streaming) via islands + backend streaming + derived nested outlets, while
  dropping RSC, Node lock-in, the four-layer cache, and the non-HTML payload.
- **vs Inertia** — no server-side protocol adapter; plain HTML.
- **vs Astro ClientRouter** — same MPA-island philosophy, but with a *real
  cross-route reactive graph* and `searchParams()` reactivity (below) that
  framework-siloed islands cannot offer.

### The wedge: environment signals (`searchParams` first)

URL-bearing, data-only state — sort / filter / paginate / search — is a large
fraction of real apps. `searchParams()` is a reactive read of the query string:
a same-route, query-only navigation updates the signal and the URL **with no
outlet swap and no re-hydration**, and islands reconcile fine-grained. No other
approach in the table offers this cleanly on an arbitrary backend. This is the
headline capability and the strongest reason to adopt the router.

`searchParams` is the first instance of a broader idea: a **request-scoped
reactive environment signal** — ambient request/browser state read correctly
per-request under SSR and reactively on the client, with **no new compiler
feature** (the existing `Reactive<>` brand wires the DOM updates). Cookies are a
natural second instance and are deferred to a **follow-up** (preference-style,
non-`httpOnly` cookies only; `httpOnly` cookies are invisible to client JS by
design and are explicitly out of scope as client signals). The shared
constructor (`createEnvSignal`) stays **internal** — only concrete instances
(`searchParams`, later `cookie`) are exported, so the generic factory does not
become a sanctioned extension point.

#### Packaging & purity

- **Exported from `@barefootjs/client` top-level**, not a separate
  `@barefootjs/router/signals` entry. The authoring import
  (`import { searchParams } from '@barefootjs/client'`) is the **SSR-safe type
  facade**; the real browser implementation lives in `@barefootjs/client/runtime`
  (the compiler target). One package, no extra install.
- **The singleton requirement dissolves.** Because the signal rides the shared
  `@barefootjs/client/reactive` runtime that every island already imports, there
  is structurally only one instance. The PR #1910 "two `searchString` signals
  silently disconnect" failure mode cannot occur.
- **`searchParams` owns no subscription side effect.** Reactivity to query
  changes only matters when the router is present (without it, every query
  change is a full navigation that re-reads on load). The **router** already
  owns `popstate` and query-only navigation, so it **pushes** updates through a
  seam (e.g. `__pushSearch(url.search)`); `searchParams()` is a near-pure read of
  a **lazily-created** signal (initial value from `location.search`, a read, not
  a side effect). No `addEventListener` lives in `searchParams` itself.

#### Tree-shaking contract

An island that never references `searchParams` must ship **zero** of it. This
holds when:

1. **The authoring surface is side-effect-free** at module top level (no eager
   listener or `location` read); the one lazy signal is confined to
   `/runtime`. Add **`"sideEffects": false`** to `packages/client/package.json`
   (currently absent — safe, since the client `src` has no import-time global
   writes) to unlock cross-module DCE; if `/runtime` ever needs import-time
   side effects, list those files instead of `false`.
2. **It is reachable only via island imports** — the compiler emits the
   `searchParams` import only for components that reference it, so it is never
   baked unconditionally into the always-loaded shared bundle.
3. **The router seam is a static import** in the (opt-in) router bundle; absent
   the router, `__pushSearch` and its wiring are dead code and drop out.

#### Request-scoped SSR

PR #1910 stored the query in a process-wide module-level signal, which races
across concurrent SSR requests. The SSR value must instead come from an
**adapter-specific per-request context** (no single shared type is implied):
the Hono adapter reads the request via `useRequestContext().req`; Go/Perl
adapters prime a well-known binding (e.g. `BfEnv.*`) that the handler fills from
the request, which the template bakes into the initial render. A direct load of
`/list?sort=price` then renders the correct state with no flash and no hydration
mismatch.

## Suspense / streaming

Suspense's value is real: a slow data region must not block the shell, and
content should stream in. App Router delivers this but **couples it to RSC, a
non-HTML payload, React, and Node/bundler integration** — exactly the lock-in
this project rejects.

**Decision: streaming/Suspense is owned by the backend SSR layer, not by a
client router protocol.**

- Slow regions stream as ordinary out-of-order HTML from the backend (the
  existing `@barefootjs/streaming` package is the seam). A placeholder renders
  first; the late HTML chunk replaces it. This is plain HTML on any backend.
- The router's only obligation is to **not break in-flight streaming** when it
  extracts and swaps an outlet, and to re-hydrate islands as their chunks land.
- The *client-transition* feel of Suspense (don't stare at a blank region) is
  provided by **prefetch + stale-while-revalidate** (show cached/stale content
  instantly) and, optionally, a skeleton shown during a structural swap and
  replaced when the new outlet arrives.

The router therefore exposes **no** `<Suspense>`, `loading.tsx`, or streaming
protocol of its own. "Suspense" is a property of how the backend renders, which
BarefootJS already supports.

## Lifecycle model

On a same-origin, interceptable link click (or `navigate()`):

1. **Resolve** the target page — from the SWR snapshot cache if fresh/aging,
   else fetch the full HTML document.
2. **Diff outlets** — compare the current outlet tree to the incoming document's
   outlet tree; determine the deepest changed segment(s). (v0: the single outlet
   always "changes.")
3. **Dispose** the reactive scopes owned by the outgoing segment(s), with a
   guaranteed fallback to `disposeScope` (see [Seams](#seams--integration)).
4. **Load** any newly required island modules (`import` of the response's
   `<script type="module" src>` not already loaded), resolving relative `src`
   against the **response URL**, not `window.location`.
5. **Swap** the changed segment(s) via `replaceChildren`; outer layouts keep
   their DOM and state.
6. **Re-hydrate** only the freshly inserted scopes (subtree-scoped,
   `O(outlet)`).
7. **Commit** history and `<title>`, **preserving existing `history.state`**
   (merge the `bfRouter` flag rather than overwriting).
8. **Manage focus / announce** the route change (move focus to the changed
   region, announce via a live region).

Query-only navigations short-circuit before step 2, abort any in-flight
structural swap (last-wins), update `searchParams()` + the URL, and do not swap.

## Seams & integration

The router integrates with `@barefootjs/client` through narrow seams, but must
be **correct by default** — the PR #1910 failure mode (silent island leaks
unless the developer happens to call `setupStreaming()`) is unacceptable.

- `startRouter()` must install the runtime seams itself (or the client must
  auto-install them), so the documented `startRouter()`-only usage gives correct
  disposal and re-hydration.
- Both `dispose` and `rehydrate` must degrade through the **same fallback
  chain**, ending at the dynamic import of `@barefootjs/client/runtime`
  (`disposeScope` / `rehydrateScope`). Neither may silently no-op.

## Public surface (intentionally small)

- `startRouter(options?)` — install once on the client; no-op on the server.
- `navigate(href)` — programmatic navigation; environment-guarded so an
  accidental SSR call no-ops instead of throwing.

`searchParams` is **not** a router export. It lives in `@barefootjs/client`
(see [the wedge](#the-wedge-environment-signals-searchparams-first)); the router
merely drives it through the `__pushSearch` seam on query-only navigation. There
is no `@barefootjs/router/signals` entry — dropping it is what makes the
singleton guarantee structural rather than a packaging contract.

Router internals stay separated by responsibility: controller (events/history),
outlet parsing, cache (fetch + freshness), seams (client-runtime integration).

## Phased plan

- **v0 — single authored outlet, correct by default.** Hand-placed `bf-outlet`;
  `startRouter()` installs seams; `dispose`/`rehydrate` share a fallback;
  `history.state` preserved; response-URL base resolution; focus/a11y on swap.
  This is the "never worse than MPA" floor.
- **v0.5 — `searchParams` done right.** Exported from `@barefootjs/client`
  (lazy, side-effect-free, router-driven via `__pushSearch`); request-scoped SSR
  state via an adapter-specific per-request context; `"sideEffects": false` on the client
  package for clean tree-shaking. Cookies (`createEnvSignal` second instance,
  non-`httpOnly` only) are a later follow-up.
- **v1 — persistence within an outlet.** `data-bf-permanent` carry-over and
  idiomorph-style morphing so an island present on both pages is not needlessly
  re-created.
- **v2 — compiler-derived nested outlets.** The compiler emits the nested
  `bf-outlet` boundaries from the scope/component tree; the router diffs the
  outlet tree and swaps only the deepest changed segments. This is the north
  star.

## Open questions

- How is the nested-outlet boundary derived from the scope tree, and how is it
  represented in the IR so every adapter can emit it?
- What is the default focus target and the a11y announcement API after a swap?
- How does outlet-tree diffing interact with backend streaming when a changed
  segment is still streaming at swap time?
- What per-request context do env signals read at SSR in each adapter (Hono via
  `useRequestContext().req`), and how do non-Node adapters (Go/Perl) prime the
  `BfEnv.*` binding from the request?
- For the cookie follow-up: how is a single-key view (`cookie('theme')`) typed,
  and what is the change-observation fallback where the CookieStore API is
  unavailable (no native same-tab cookie event)?
- Should prefetch's modulepreload links and dedupe set be capped/pruned (they
  are session-lived today) once sessions are long-lived?

## Non-goals

- A client route manifest, loader protocol, or fragment endpoint.
- An RSC-style server/client component boundary or non-HTML navigation payload.
- A client-owned Suspense protocol (streaming belongs to the SSR layer).
- A content-negotiation/navigation header — the router always fetches ordinary
  complete HTML so it works against any backend, including the Go/Perl adapters.
