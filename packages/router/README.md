# @barefootjs/router

Backend-agnostic, progressively-enhanced client router for BarefootJS. It
intercepts same-origin navigations, fetches the **ordinary full-page HTML** any
backend already returns (no protocol header, no JSON endpoint), swaps only the
page **region**, and disposes/re-hydrates just the islands inside it. The shell
stays mounted; everything outside the region keeps its DOM, scroll, and state.

```ts
import { startRouter } from '@barefootjs/router'

startRouter() // install once on the client
```

Mark the swappable region in your layout with `<Region>` (compiled to
`[bf-region]`, see `spec/router.md`); the router swaps the first match.

## Public API

- `startRouter(options?): Router` — install once; SSR no-op. Returns
  `{ stop, navigate, prefetch }`.
- `navigate(href, { history? }): Promise<void>` — programmatic navigation.
- `BF_REGION` — re-export of the `bf-region` marker for server-side helpers.

### Options

| option | default | purpose |
| --- | --- | --- |
| `region` | `[bf-region]` | selector for the swap point |
| `rehydrate` / `dispose` | runtime fallback chain | override island lifecycle |
| `loadModule` | `import(src)` | how island modules are loaded |
| `shouldIntercept` | same-origin, plain click | per-anchor opt-out (`data-bf-router="false"`, `download`, `target`, `rel=external`) |
| `prefetch` / `prefetchDelay` | `true` / `65` | hover/focus/pointerdown prefetch + `modulepreload` |
| `cacheFreshMs` / `cacheStaleMs` / `cacheCap` | `15000` / `60000` / `30` | SWR + LRU snapshot cache |
| `scrollToTop` | `true` | scroll to top after a swap |
| `manageFocus` | `true` | move focus into the region + announce the route |

## Correct by default

The client runtime is an **optional peer**: a fully static shell ships the
router with zero `@barefootjs/client`. When islands are present, `dispose` and
`rehydrate` degrade through the same fallback chain
(`window.__bf_*` seams → `@barefootjs/client/runtime`'s
`disposeScope`/`rehydrateScope`) and never silently no-op. There is no opt-in
setup step.

## Behaviour

- **Last-wins** across overlapping navigations (a newer nav aborts the older).
- **SWR cache** stores promises (a prefetch + click share one request); aging
  entries serve instantly and refresh in the background; failures aren't cached.
- **Module-aware**: a response's new island modules are imported *before* the
  re-hydration walk, and deduped across navigations.
- **Redirect-aware**: history commits at the response's final URL.
- **History.state preserved**: a router replace merges rather than clobbers
  existing state (scroll-restoration libs, framework state).
- **A11y**: focus moves into the swapped region (its first heading) and the new
  title is announced via a polite live region.

## v0 scope

This is the **v0** floor: a single authored region (the broadest match),
correct by default. Compiler-derived **nested** regions (deepest-differs swap,
sibling master–detail) are v2. `searchParams()` (query-only navigation without a
swap) ships in `@barefootjs/client` at v0.5; the router already drives it via
the `__bf_pushSearch` seam, so query-only navigations short-circuit once a
consumer is present.
