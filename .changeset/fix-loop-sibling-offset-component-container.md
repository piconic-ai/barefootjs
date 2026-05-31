---
"@barefootjs/jsx": patch
---

Fix a nested child component being dropped during hydration when a static sibling element precedes a `.map()` inside a component (or fragment / provider / async) container (#1688). `computeLoopSiblingOffsets` only counted preceding DOM siblings under element parents, so a loop nested directly inside such a container got a silently-zero `siblingOffset`. The generated `container.children[__idx]` lookup for each item's nested child was then off by one, resolving the first item's child against the static sibling and dropping it. Sibling counting now runs for every container whose children render as a contiguous run of DOM siblings.
