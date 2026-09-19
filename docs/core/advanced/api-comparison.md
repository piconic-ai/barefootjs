---
title: API Comparison
description: A Solid-baseline, row-by-row comparison of the runtime API against Solid and React — what BarefootJS calls the same concept, what it solves differently, and what it deliberately does not have.
---

# API Comparison

A Solid-baseline comparison of the runtime API — one row per Solid API (Solid Router
included), with the React counterpart, the BarefootJS counterpart and its tier, a symmetry
classification, and an importance rating. It exists so a reader (human or agent) can answer
"what is the BarefootJS name for X" and "what does BarefootJS deliberately not have" in one
place. Tiers are copied from [API Reference](./api-reference.md); an entry that isn't a
public API at all — compiler-emitted code or tooling only — reads **compiler ABI, not
public** instead of a tier.

**Reading.** Of the rows rated 4 or higher, three have no BarefootJS counterpart at all:
`createResource` (rated 5), `query`/`createAsync`, and `createUniqueId`. `action()` gets a
`partial` one. The remaining rated-4-or-higher rows are all present, either as a direct
`match` or reshaped into a different form (`partial`: `Portal`, `<Suspense>`, `hydrate()`,
`renderToString`/`renderToStream`, `<A href>`/`useNavigate`). Of the BarefootJS-only rows,
`Region` and `Async` are the design core; the rest are rated 2 or lower, and two of those —
`createDisposableEffect` and the profiler plumbing — are compiler ABI rather than a public
API at all.

## Legend

**Symmetry**: **match** = same name and shape, readable as a substitution · **partial** =
same problem solved in a different form (compiler, another package, an idiom) · **none** =
no BarefootJS counterpart · **BF-only** = no Solid / React counterpart.

**Importance** (concept-level, framework-independent — "how much does writing declarative UI
need this concept"; it rates the concept, not BarefootJS's implementation):
5 foundation (nearly every component) · 4 everyday (every mid-size app; without it,
hand-wiring each time) · 3 situational (needed in specific situations; workaround is clumsy
or fragile) · 2 niche (an idiom covers it) · 1 internal (tooling / framework-internal; app
authors never write it).

Usage counts (`ui=`/`site=`/`integrations=`) are file counts of a case-sensitive,
whole-word match over `ui/components` (tests excluded), `site` (tests, `e2e/`, `dist/` and
`node_modules/` excluded) and `integrations` (tests excluded), re-measured 2026-09-19.

## Reactive primitives

| Solid (baseline) | React | BarefootJS | Symmetry | Imp. | Notes |
|---|---|---|---|---|---|
| `createSignal` | `useState` | [`createSignal`](./api-reference.md#createsignal) Beta | match | 5 | `[getter, setter]`, read as `count()`. ui=46 site=241 |
| `createMemo` | `useMemo` | [`createMemo`](./api-reference.md#creatememo) Beta | match | 5 | no deps array, auto-tracked. ui=23 site=93 |
| `createEffect` | `useEffect` | [`createEffect`](./api-reference.md#createeffect) Beta | match | 5 | no deps array; exclude reads with `untrack`. ui=23 site=105 |
| `createRenderEffect` / `createComputed` | `useLayoutEffect` (close, not identical) | — | none | 1 | one effect timing only; library-author primitive |
| `batch` | automatic batching (React 18) | [`batch`](./api-reference.md#batch) Beta | match | 3 | site=5 |
| `untrack` | — (deps array) | [`untrack`](./api-reference.md#untrack) Beta | match | 3 | the only way to narrow dependencies (no `on()`) |
| `on(deps, fn)` | deps array | — | none | 2 | write with `untrack` instead; no action |
| `createSelector` | — | [`createSelector`](./api-reference.md#createselector) Alpha | match | 2 | analyzer recognises the brand; ui=0 site=0 (task C of #3078) |
| `createStore` / `produce` / `reconcile` | `useReducer` / external store | — | none | 3 | put the object in a signal; forms live in `@barefootjs/form` |
| `createRoot` | — (ReactDOM's `createRoot` is a mount API) | [`createRoot`](./api-reference.md#createroot) Alpha | match | 2 | test / CSR harness use; ui=0 site=0 |
| `getOwner` / `runWithOwner` | — | — (not exported) | none | 1 | ownership is internal scope |

## Lifecycle

| Solid (baseline) | React | BarefootJS | Symmetry | Imp. | Notes |
|---|---|---|---|---|---|
| `onMount` | `useEffect(fn, [])` | [`onMount`](./api-reference.md#onmount) Beta | match | 4 | once after hydration. site=9 |
| `onCleanup` | effect return value | [`onCleanup`](./api-reference.md#oncleanup) Beta | match | 4 | ui=7 site=32 |
| — (`createRoot` dispose) | — | `createDisposableEffect` **compiler ABI, not public** | BF-only | 1 | emitted by the compiler for branch-scoped effects; zero authored uses (task B of #3078, done) |
| `ref={el => …}` | `useRef` / ref callback | `ref={handleMount}` | match | 4 | callback ref, entry point for portals and focus |

## Control flow (Solid: components; BarefootJS: compiler)

| Solid (baseline) | React | BarefootJS | Symmetry | Imp. | Notes |
|---|---|---|---|---|---|
| `<Show when fallback>` | `cond && …` / ternary | `cond() && …` / ternary (compiler-lowered) | match | 5 | React shape, Solid granularity; lowers to template conditionals on all adapters |
| `<For each>` / `mapArray` | `items.map()` | `items().map()` | match | 5 | keyed; `.filter()` / `.sort()` / `.flatMap()` chains inside the subset |
| `<Index each>` | — | — | none | 2 | |
| `<Switch>` / `<Match>` | ternary chain | ternary chain | partial | 2 | |
| `<Dynamic component>` | variable as tag | — (`asChild` / `Slot` cover most uses) | none | 2 | |
| `<ErrorBoundary>` / `catchError` | Error Boundary | — | none | 3 | SSR errors are the backend's; only client effect / handler errors remain |
| `<Portal>` | `createPortal` (ReactDOM) | [`createPortal`](./api-reference.md#createportal) Beta + [`isSSRPortal`](./api-reference.md#isssrportal) / [`findSiblingSlot`](./api-reference.md#findsiblingslot) | partial | 4 | imperative (move a `ref` element to `body`); SSR leaves a placeholder. `cleanupPortalPlaceholder` (the placeholder's own cleanup) is compiler ABI, not public — zero authored uses. uses 14 / 13 / 6 |
| `<Suspense fallback>` | `<Suspense fallback>` | [`<Async fallback>`](./api-reference.md#async) Beta | partial | 4 | Solid: client boundary on suspense-tracked reads. BF: SSR streaming only, compiled away to the adapter primitive; client-side boundary is layer 1 of [`spec/async.md`](../../../spec/async.md) |
| `<SuspenseList>` | experimental | — | none | 1 | |
| `lazy()` | `React.lazy` | — (Vite dynamic import) | partial | 3 | islands split per entry anyway |

## Components and props

| Solid (baseline) | React | BarefootJS | Symmetry | Imp. | Notes |
|---|---|---|---|---|---|
| `splitProps` | destructure + rest | [`splitProps`](./api-reference.md#splitprops) Alpha | match | 3 | ui uses `...props` via compiler `forwardProps`; ui=0 site=0 |
| `mergeProps` | destructure defaults | literal destructure defaults (compiler) | partial | 2 | `{ size = 'md' }` resolved at compile time |
| `children()` | `props.children` | `props.children` + `Slot` / `asChild` | partial | 3 | |
| `createUniqueId` | `useId` | — | none | 4 | today `props.id` from outside; needed for `aria-labelledby` / `htmlFor` (task F of #3078) |
| `createContext` | `createContext` | [`createContext`](./api-reference.md#createcontext) Beta | match | 4 | ui=21 |
| `<Ctx.Provider value>` | same | same | match | 4 | compiled to `provideContext()` |
| `useContext` | `useContext` | [`useContext`](./api-reference.md#usecontext) Beta | match | 4 | ui=23 |

## Async (lowest symmetry, highest importance)

| Solid (baseline) | React | BarefootJS | Symmetry | Imp. | Notes |
|---|---|---|---|---|---|
| `createResource` (`loading` / `error` / `latest` / `state`) | `use(promise)` + Suspense | — | none | 5 | design: [`spec/async.md`](../../../spec/async.md) layer 0 — `createQuery` with the `AsyncState` sum type, sync accessors `q()` / `q.loading()` / `q.error()`. Not implemented yet |
| `query(fn, name)` / `createAsync` (Solid Router) | RSC / router loaders | — | none | 4 | key = name + serialized args; cross-island cache sharing |
| `action()` / `useSubmission` (pending · input · result · error · url · clear) | `useActionState` → `[state, dispatch, isPending]`; `useFormStatus` (inside `<form>` only) | — (nearest: `createForm().isSubmitting()`) | partial | 4 | design: [`spec/async.md`](../../../spec/async.md) layer 0 — `createAction`. Not implemented yet |
| `createResource` `mutate` | `useOptimistic` | — | none | 3 | hand-written today |
| `useTransition` → `[pending, start]` | `useTransition` / `useDeferredValue` | — | none | 2 | server `pending()` always false in Solid; [`spec/async.md`](../../../spec/async.md) layer 2, gated |
| — (community) | `<ViewTransition>` (19.3 canary) | — | none | 3 | router only sets `data-bf-navigating`; not in the async layer by design |
| — (`renderToStream`) | — | [`<Async>`](./api-reference.md#async) + [`setupStreaming()`](./api-reference.md#setupstreaming) Beta | BF-only | 4 | compile-time boundary lowered to backend streaming; site=6, 7 router entries. Keep |

## Mount and SSR

| Solid (baseline) | React | BarefootJS | Symmetry | Imp. | Notes |
|---|---|---|---|---|---|
| `render(() => <App/>, el)` | `createRoot(el).render()` | [`render(el, 'Name', props)`](./api-reference.md#render) Beta (`@barefootjs/client/runtime`) | match | 4 | by registered name; `ComponentDef` direct is Alpha |
| `hydrate()` | `hydrateRoot()` | automatic per `"use client"` file | partial | 4 | |
| `renderToString` / `renderToStream` | `renderToString` / `renderToPipeableStream` | — (emits templates) | partial | 4 | SSR is the backend's job |
| `<NoHydration>` | Server Components | default (no `"use client"`) | partial | 3 | opt-out vs opt-in |
| `isServer` | `typeof window` | `"use client"` / `/* @client */` | partial | 3 | static, per file / per expression |
| DEV / Solid Devtools | React DevTools | `bf debug graph` / profiler plumbing (**compiler ABI, not public**) | partial | 3 | CLI, no extension. Profiler surface: `bf debug profile` |

## Router and URL

| Solid (baseline) | React | BarefootJS | Symmetry | Imp. | Notes |
|---|---|---|---|---|---|
| `useSearchParams` (Solid Router) | `useSearchParams` (React Router) | [`createSearchParams`](./api-reference.md#createsearchparams) Beta | match | 4 | signal-shaped; query-only navigation updates the signal without a swap. ui=0 site=0 integrations=1 (`integrations/shared/blog/PostList.tsx`) |
| `<A href>` / `useNavigate` | `<Link>` / `useNavigate` | plain `<a>` + [`queryHref()`](./api-reference.md#queryhref) Beta + router `navigate()` | partial | 4 | `queryHref` also lowered to SSR adapters. ui=0 site=0 integrations=1 (same file) |
| — | — (Next `layout.tsx` is close) | [`<Region>`](./api-reference.md#region) Beta | BF-only | 4 | page lifecycle boundary, compiled to `bf-region`; [`spec/router.md`](../../../spec/router.md). Keep |

## Other BarefootJS-only

| BarefootJS | Tier | Imp. | Notes |
|---|---|---|---|
| `formatDate` | Beta | 2 | adapter-lowered helper on 9 adapters; ui=1 site=2 (task C of #3078) |
| `trackPosition` | Alpha | 2 | floating UI; ui=6 (task C) |
| `beginTurn` / `endTurn` / `createRecordingSink` / `setProfilerSink` / `ProfilerEvent*` | **compiler ABI, not public** | 1 | profiler plumbing; compiler-emitted + `bf debug profile` (task B of #3078, done) |

## Sources

- Solid columns verified against [docs.solidjs.com](https://docs.solidjs.com) on 2026-09-18.
- React columns verified against [react.dev](https://react.dev) on 2026-09-18.
- BarefootJS tiers and usage counts re-measured against [API Reference](./api-reference.md) and the repository on 2026-09-19.
