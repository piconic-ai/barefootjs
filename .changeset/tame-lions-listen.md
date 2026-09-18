---
"@barefootjs/jsx": patch
---

Fix #3044: a `.map()` over a nested array property of a destructured OBJECT-shaped prop (`data.items` where `data` is a prop, or `props.data.items`) now reconciles via `mapArray` instead of silently freezing on the SSR-time array. `isArrayExprDirectPropRef` previously only recognized a bare destructured-prop identifier or a single member access off the WHOLE props object (`props.items`) as prop-derived; a nested member access off a destructured object prop fell through both cases and stayed on the static SSR-row-bind path, so a parent signal driving the prop from an empty array to a non-empty one (e.g. in `onMount`) never inserted rows into the child. The property-access branch now walks to the chain's root identifier and accepts it as prop-derived whether it resolves to the whole props object or to a destructured prop binding, through the same alias-hop chain as before.
