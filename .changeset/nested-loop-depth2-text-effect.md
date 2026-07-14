---
"@barefootjs/jsx": patch
---

Fix #2264: a reactive text child of the innermost element in a **depth-2 nested `.map()`** (three loop levels) now gets a `createEffect` update effect on the client, instead of being silently folded into the static clone template only.

`collectInnerLoops` (`ir-to-client-js/collect-elements.ts`) gated reactive-text collection on whether the loop's array expression referenced `outerLoopParam` — but that variable is fixed at the OUTERMOST loop's param for the whole descent and never updated per nesting level. At depth 2, the innermost loop's array (`band.panels`) only references its immediate parent (`band`), not the top-level param (`page`), so the gate was always false and the text effect was dropped. The sibling `className`/`style` attribute effects on the same element were ungated and worked fine, and depth-1 nesting happened to pass the gate (its array does reference the top-level param), which is why the bug only showed at depth 2+.

Reactive texts are now collected on the same unconditional terms as attrs/refs — `classifyReactivity` (used internally by `collectLoopChildReactiveTexts`) already filters out genuinely non-reactive reads against the loop's own param, so this doesn't introduce spurious effects for a fully-static inner array.
