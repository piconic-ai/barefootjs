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
| `morph` | `true` | preserve `[data-bf-permanent]` live nodes across a swap (no-op when none present); `false` forces a plain `replaceChildren` |

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
- **Head metadata**: title, description, `og:`/`twitter:`, canonical and friends
  are reconciled against the incoming page; head *resources* are not (see below).
- **Persistence** (`data-bf-permanent`): an element marked
  `<div data-bf-permanent="player">` keeps its *live* node across a swap — its
  state, media playback, scroll, and hydrated scope survive — matched between
  documents by the attribute value (or `id`). A no-op when no element is marked;
  pass `morph: false` for a plain swap.
- **Swap in flight** (`data-bf-navigating`): set on `<html>` for the duration of
  a region swap. A swap commits the new markup *before* re-hydrating it, so
  "present in the DOM" and "interactive" are two moments — until this clears, a
  swapped-in island may still be server markup with no handlers, and a click on
  it is lost. Style off it for a loading indicator, or wait for its absence
  before driving new content. `NAVIGATING_ATTR` is exported so callers need not
  hard-code the string. Query-only navigations swap nothing and never set it.

## `<head>`: metadata is reconciled, resources are not

A region is a **body** subtree, so `<head>` is not swapped wholesale. It splits
in two, and the split is the whole contract.

### Page metadata — reconciled on every swap, always

Page metadata is page-scoped by definition, so the router brings a closed
allowlist of it in line with the incoming document. This always runs and there
is no flag to disable it: a stale `<meta name="description">` is wrongness you
*cannot see* in development (unlike the tab title), and this package doesn't
leave that class opt-in.

| head node | key |
| --- | --- |
| `<title>` | — |
| `<meta name="description \| keywords \| robots \| author \| theme-color">` | `name` |
| `<meta property="og:*">` / `<meta name="twitter:*">` | `name` or `property` |
| `<link rel="canonical \| alternate \| prev \| next">` | `rel` + `hreflang`/`type`/`media` |

A key in both documents is replaced (skipped when the nodes are already equal,
so metadata shared across routes causes no DOM churn); a key only in the
incoming page is added; a key only in the live page is **removed**, so it can't
leak forward into every later route.

Anything whose key isn't in that table is never read, replaced, or removed —
runtime-injected analytics tags, CSP `<meta http-equiv>`, `<link rel=preconnect>`
and friends are safe by construction. (This is the deliberate difference from
Turbo, which removes every untracked head element.) Opt a node out with
`data-bf-head="false"` when the page itself owns it.

### Head resources — untouched

`<link rel="stylesheet">`, `<script>`, and `<style>` in `<head>` are left alone
in both directions. Not an oversight: a resource's lifetime isn't derivable from
the incoming document. The shell, a `[data-bf-permanent]` node, a portal, or an
island that outlives the region may still depend on a sheet the next page's head
doesn't list, so "absent downstream" is no evidence of "no longer needed".

That makes a **route-scoped stylesheet in `<head>`** the one real trap:
navigating *into* the route renders it unstyled (a reload "fixes" it, which
points the investigation at caching or the build instead of at navigation), and
navigating *out* leaves the sheet linked, so its rules then apply to every route
after it.

Put it **inside** the region, where it enters and leaves with the swap:

```tsx
<Region>
  {isEditor ? <link rel="stylesheet" href="/editor.css" /> : null}
  {children}
</Region>
```

`rel="stylesheet"` is body-ok per HTML, so this is valid — and it is the right
placement under a region-swap contract, not a workaround. It gets both orderings
right *by construction* (the sheet is inserted with the content it styles and
removed with it), with no load awaited in the navigation path. Sheets that are
genuinely global stay in `<head>`, where never touching them is exactly what you
want.

## Scope

A **single authored region** (the broadest `[bf-region]` match), correct by
default. `searchParams()` (query-only navigation without a swap) ships in
`@barefootjs/client` (v0.5); the router drives it via the `__bf_pushSearch`
seam, so query-only navigations short-circuit once a consumer is present.
`data-bf-permanent` persistence is v1. Compiler-derived **nested** regions
(deepest-differs swap, sibling master–detail) are v2.
