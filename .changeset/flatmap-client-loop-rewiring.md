---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Rewire the client side of JSX-returning `.flatMap()` loops onto flattened leaf descriptors. Previously the emitted `mapArray` reconciled the UN-flattened source items against the flattened SSR leaves with a null keyFn and an EMPTY item template — leaves vanished at hydration with zero interaction, adding an item crashed on `cloneNode(null)`, and the list never reacted to data changes. The accessor now flattens through the callback body producing `({ k, h })` descriptors per leaf (keyed by the leaf's own `key`, index fallback), renderItem builds new leaves from the descriptor HTML and patches existing ones in place via the new `patchLeaf` runtime helper, and leaf `data-key` moved off the string templates onto `mapArray`'s `setAttribute` path (closing the CSR/SSR data-key asymmetry, escaping included). A flatMap leaf carrying an event handler, component, nested loop, or spread now refuses loudly instead of rendering silently-dead DOM.
