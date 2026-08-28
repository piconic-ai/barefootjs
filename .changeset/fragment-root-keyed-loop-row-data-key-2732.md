---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Fix #2732: a fragment-rooted component (`return <>...</>`) used as a keyed `.map()` row emitted no `data-key` in its SSR bytes at all. `transformFragment` clears `needsScope` on the wrapped element when a fragment root gets a comment-based scope (`wrapWithScopeComment` carries the five hydration markers instead), and `renderElement`'s `data-key` emission lived only inside that `needsScope` block — so the component never even declared a `__dataKey` parameter, let alone emitted the attribute. `mapArray`'s hydration adopt loop still stamps the key onto the row afterward (`primaryEl.setAttribute(BF_KEY, key)`), so this was a genuine, observable DOM mutation the SSR bytes never had — breaking the snap oracle's no-op-hydration invariant.

Fixed with a new `IRElement.carriesDataKey` flag, set by `transformFragment` on the first ELEMENT among a comment-scoped fragment's own top-level children. "First element, not first node" deliberately reuses the CSR runtime's own resolution of the identical ambiguity (`component.ts`'s `roots.find(isElement)`, #2735) rather than inventing a second answer, and keeps `data-key` as a plain DOM attribute (not moved onto the scope comment) so `mapArray`'s existing `primaryEl.dataset.key` read needs no change. `renderElement` (hono-adapter.ts) now emits the same `data-key` spread for a `carriesDataKey` element that it already emits for a `needsScope` one.
