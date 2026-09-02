---
"@barefootjs/go-template": patch
---

Fix two review-caught gaps in the named-prop dynamic-delivery route added for #2703: `bf_with_props` now targets the child's LOCAL destructured field name instead of the bare JSX attribute name (a child that aliases the prop, e.g. `function Card({ header: h })`, would otherwise silently drop the dynamic value), and a prop routed into the child's rest bag (no declared param at all) now refuses loudly with `BF101` instead of silently no-op'ing through `bf_with_props`'s unmatched-field passthrough (tracked as a capability gap in #2805).
