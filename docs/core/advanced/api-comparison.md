---
title: Coming from React or Solid
description: The BarefootJS name for each React and Solid concept, one row per concept, and what BarefootJS deliberately leaves out.
---

# Coming from React or Solid

BarefootJS uses Solid's names and shapes for reactivity, React's JSX for control flow, and the compiler for what both do at runtime. Components run once — there is no re-render:

```tsx
"use client"
import { createSignal, createEffect } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)   // useState / createSignal
  createEffect(() => console.log(count()))    // useEffect, no deps array
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
```

## Reactive primitives

| Solid | React | BarefootJS |
|---|---|---|
| `createSignal` | `useState` | [`createSignal`](./api-reference.md#createsignal) — `[getter, setter]`, read as `count()` |
| `createMemo` | `useMemo` | [`createMemo`](./api-reference.md#creatememo) — no deps array, auto-tracked |
| `createEffect` | `useEffect` | [`createEffect`](./api-reference.md#createeffect) — no deps array; exclude reads with `untrack` |
| `batch` | automatic batching | [`batch`](./api-reference.md#batch) |
| `untrack` | deps array | [`untrack`](./api-reference.md#untrack) — the only way to narrow dependencies |
| `on(deps, fn)` | deps array | — write it with `untrack` |
| `createStore` / `produce` | `useReducer` / external store | — put the object in a signal; forms live in `@barefootjs/form` |
| `createRoot` | — | [`createRoot`](./api-reference.md#createroot) — test and CSR harness use |
| `createRenderEffect` / `createComputed` | `useLayoutEffect` | — one effect timing only |

## Lifecycle

| Solid | React | BarefootJS |
|---|---|---|
| `onMount` | `useEffect(fn, [])` | [`onMount`](./api-reference.md#onmount) — once, after hydration |
| `onCleanup` | effect return value | [`onCleanup`](./api-reference.md#oncleanup) |
| `ref={el => …}` | `useRef` / ref callback | `ref={handleMount}` — callback ref; the entry point for portals and focus |

## Control flow

Solid ships components; BarefootJS lowers React's JSX shapes in the compiler, with Solid's granularity, on every adapter.

| Solid | React | BarefootJS |
|---|---|---|
| `<Show when fallback>` | `cond && …` / ternary | `cond() && …` / ternary |
| `<For each>` | `items.map()` | `items().map()` — keyed; `.filter()` / `.sort()` / `.flatMap()` chains allowed |
| `<Switch>` / `<Match>` | ternary chain | ternary chain |
| `<Index each>` | — | — |
| `<Dynamic component>` | variable as tag | — `asChild` / `Slot` cover most uses |
| `<ErrorBoundary>` | Error Boundary | — SSR errors are the backend's; only client effects and handlers can throw |
| `<Portal>` | `createPortal` | [`createPortal`](./api-reference.md#createportal) — imperative: move a `ref` element to `body`; SSR leaves an inert placeholder |
| `<Suspense fallback>` | `<Suspense fallback>` | [`<Async fallback>`](./api-reference.md#async) — an SSR streaming boundary, compiled to the adapter's primitive |
| `lazy()` | `React.lazy` | — Vite dynamic import; islands split per entry anyway |

## Components and props

| Solid | React | BarefootJS |
|---|---|---|
| `splitProps` | destructure + rest | [`splitProps`](./api-reference.md#splitprops) |
| `mergeProps` | destructure defaults | literal destructure defaults, resolved at compile time (`{ size = 'md' }`) |
| `children()` | `props.children` | `props.children` + `Slot` / `asChild` |
| `createContext` | `createContext` | [`createContext`](./api-reference.md#createcontext) |
| `<Ctx.Provider value>` | same | same |
| `useContext` | `useContext` | [`useContext`](./api-reference.md#usecontext) |
| `createUniqueId` | `useId` | — pass `props.id` in from outside |

## Async

| Solid | React | BarefootJS |
|---|---|---|
| `createResource` | `use(promise)` + Suspense | — |
| `action()` / `useSubmission` | `useActionState` / `useFormStatus` | — nearest: `createForm().isSubmitting()` |
| `renderToStream` | `renderToPipeableStream` | [`<Async>`](./api-reference.md#async) + [`setupStreaming()`](./api-reference.md#setupstreaming) |

`createQuery` and `createMutation` — `[value, action]` with `action.isPending()` / `action.error()` — are a design draft in [`spec/async.md`](../../../spec/async.md), not a shipped API.

## Mount and SSR

| Solid | React | BarefootJS |
|---|---|---|
| `render(() => <App/>, el)` | `createRoot(el).render()` | [`render(el, 'Name', props)`](./api-reference.md#render) from `@barefootjs/client/runtime` |
| `hydrate()` | `hydrateRoot()` | automatic, per `"use client"` file |
| `renderToString` | `renderToString` | — the compiler emits templates; SSR is the backend's job |
| `<NoHydration>` | Server Components | the default: no `"use client"` |
| `isServer` | `typeof window` | `"use client"` / `/* @client */` — static, per file or per expression |
| Solid Devtools | React DevTools | `bf debug graph` / `bf debug profile` |

## Router and URL

| Solid Router | React Router | BarefootJS |
|---|---|---|
| `useSearchParams` | `useSearchParams` | [`createSearchParams`](./api-reference.md#createsearchparams) — signal-shaped; query-only navigation updates it without a page swap |
| `<A href>` / `useNavigate` | `<Link>` / `useNavigate` | plain `<a>` + [`queryHref()`](./api-reference.md#queryhref) + router `navigate()` |
| — | Next `layout.tsx` (close) | [`<Region>`](./api-reference.md#region) — page lifecycle boundary |

## What BarefootJS deliberately does not have

- **`createResource` / route loaders** — data fetching is the backend's job; the client-side async layer is a draft.
- **`on()` / deps arrays** — `untrack` is the one way to narrow what an effect tracks.
- **Stores** — a signal holding an object, or `@barefootjs/form`, covers it.
- **`<ErrorBoundary>`** — SSR errors belong to the backend; only client effects and handlers can throw.
- **`renderToString` / `hydrate()`** — templates render on the server; hydration is automatic per `"use client"` file.
- **`createUniqueId`** — ids come in as props.
- **`useTransition` / `<ViewTransition>`** — the router only sets `data-bf-navigating`.
