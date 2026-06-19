# @barefootjs/router

## 0.15.0

### Minor Changes

- 34e8613: New package `@barefootjs/router` — a backend-agnostic, progressively-enhanced partial-navigation router (spec/router.md **v0**). `startRouter()` intercepts same-origin navigations, fetches the ordinary full-page HTML any backend already returns (no protocol header), and swaps only the `[bf-region]` subtree — disposing and re-hydrating just the islands inside it while the shell stays mounted.

  - **Correct by default.** The client runtime is an optional peer; a static shell ships zero of it. When islands are present, `dispose`/`rehydrate` degrade through the same fallback chain (`window.__bf_*` seams → `@barefootjs/client/runtime`'s `disposeScope`/`rehydrateScope`) and never silently no-op — no opt-in setup step.
  - **Resilient navigation.** Last-wins across overlapping navigations; an SWR + LRU snapshot cache (promise-based, so a prefetch and click share one request; aging entries serve instantly and revalidate in the background; failures aren't cached); module-aware import-before-hydrate, deduped across navigations; redirect-aware history commits; `history.state` preserved on replace.
  - **Prefetch** on hover (dwell) / focus / pointerdown with `<link rel=modulepreload>`.
  - **Accessibility on swap**: focus moves into the new region (its first heading) and the route is announced via a polite live region.

  Scope is the v0 floor — a single authored region (the broadest `[bf-region]` match), "never worse than an MPA". `searchParams()` (v0.5) and compiler-derived nested regions (v2) build on this.

- 4da5c80: Persistence within a region (spec/router.md **v1**): `data-bf-permanent`. An element marked `<div data-bf-permanent="player">` keeps its **live** DOM node across a navigation — its state, media playback, scroll position, and already-hydrated reactive scope survive — instead of being disposed and recreated. (Focus is not among them: with the default `manageFocus: true` the router moves focus to the swapped region's heading after the swap, overriding focus inside a preserved node.) The live node is moved into the incoming tree (before the dispose walk, so it is spared) at the position of the matching marked element, keyed by the `data-bf-permanent` value (falling back to `id`) so the same logical element is recognised across the two page documents — idiomorph's id-keyed node reuse, scoped to the nodes the author marks.

  On by default and a no-op when nothing is marked (then a swap is exactly the previous `replaceChildren`); pass `morph: false` to force a plain swap.

- cdf428b: Compiler-derived nested / sibling regions (spec/router.md **v2**). When a fetched page exposes the same `bf-region` ids as the live document, the router now swaps only the **deepest regions whose owned content differs** instead of always replacing the single broadest region:

  - **Nested** `<Region>…<Region/>…</Region>` — a change confined to an inner region swaps only that inner region; the outer shell (and its island state, scroll, focus) persists. A change to the outer region's own content rebuilds it, and its nested regions ride along.
  - **Sibling** `<><Region/><Region/></>` — independent regions (master–detail): the region that changed swaps while the other keeps its live DOM/state. Both can swap in one navigation when both differ.

  A region's _owned_ content is compared with its nested `[bf-region]` subtrees masked out, so an outer region is left mounted when only an inner region changed. The match is keyed by the compiler's stable `bf-region="<file scope>:<index>"` id, so the same logical region is recognised across page documents. When the two documents' region-id sets don't line up (or an id collides), the router falls back to the single broadest-region swap — the v0 behaviour, never worse than before. All swaps remain synchronous-before-`await` (last-wins safe) and compose with `data-bf-permanent` morphing (v1).

### Patch Changes

- f90d05c: Normalize the random `scopeID` inside the Go template adapter's `bf-p` props attribute when diffing regions.

  The router already blanks the per-render scope id in `bf-s` / `bf-h` and the JS adapters' `bf-scope:` comment so a region isn't flagged as changed just because its island re-randomized its id. The Go template adapter instead carries props (including `scopeID`) in a `bf-p` attribute, which was left untouched — so a persistent sibling region whose island sits _inside_ the region element (e.g. a hand-authored `<aside bf-region>` sidebar) compared unequal on every navigation and got swapped, resetting its state. `ownedContentKey` now blanks the `scopeID` field in `bf-p` too (keeping every other prop, so a real prop change is still detected). No effect on the JS adapters, which don't emit `bf-p`.

- Updated dependencies [071a1a3]
  - @barefootjs/shared@0.15.0
