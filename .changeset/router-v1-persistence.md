---
"@barefootjs/router": minor
---

Persistence within a region (spec/router.md **v1**): `data-bf-permanent`. An element marked `<div data-bf-permanent="player">` keeps its **live** DOM node across a navigation — its state, media playback, scroll position, and already-hydrated reactive scope survive — instead of being disposed and recreated. (Focus is not among them: with the default `manageFocus: true` the router moves focus to the swapped region's heading after the swap, overriding focus inside a preserved node.) The live node is moved into the incoming tree (before the dispose walk, so it is spared) at the position of the matching marked element, keyed by the `data-bf-permanent` value (falling back to `id`) so the same logical element is recognised across the two page documents — idiomorph's id-keyed node reuse, scoped to the nodes the author marks.

On by default and a no-op when nothing is marked (then a swap is exactly the previous `replaceChildren`); pass `morph: false` to force a plain swap.
