---
"@barefootjs/router": minor
---

Compiler-derived nested / sibling regions (spec/router.md **v2**). When a fetched page exposes the same `bf-region` ids as the live document, the router now swaps only the **deepest regions whose owned content differs** instead of always replacing the single broadest region:

- **Nested** `<Region>…<Region/>…</Region>` — a change confined to an inner region swaps only that inner region; the outer shell (and its island state, scroll, focus) persists. A change to the outer region's own content rebuilds it, and its nested regions ride along.
- **Sibling** `<><Region/><Region/></>` — independent regions (master–detail): the region that changed swaps while the other keeps its live DOM/state. Both can swap in one navigation when both differ.

A region's *owned* content is compared with its nested `[bf-region]` subtrees masked out, so an outer region is left mounted when only an inner region changed. The match is keyed by the compiler's stable `bf-region="<file scope>:<index>"` id, so the same logical region is recognised across page documents. When the two documents' region-id sets don't line up (or an id collides), the router falls back to the single broadest-region swap — the v0 behaviour, never worse than before. All swaps remain synchronous-before-`await` (last-wins safe) and compose with `data-bf-permanent` morphing (v1).
