---
"@barefootjs/go-template": patch
---

A per-row prop routed into a child component's `{...rest}` bag inside a composite loop row (`<li><Badge title={row.label} /></li>` with `Badge` capturing `title` only through its rest binding) is now delivered on every row. Each component registers its own child shape from `generate()` (a same-file child previously had no `childComponentShapes` entry, so every prop on it fell onto the named-field path and was swallowed by the unknown-field passthrough), `loopRowChildPropOverrides` routes a rest-bag prop through `bf_with_bag` per row, and both `bf_with_bag` call sites patch every render-consulted bag field (`Rest` and any `Spread_N` an element spread of the same binding renders from). The `loop-row-rest-bag-prop-override` known-limitation entry and its render-divergence pin are removed; the `composite-row-child-rest-bag-prop` fixture is the regression test.
