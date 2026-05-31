---
"@barefootjs/jsx": patch
---

Fix mapped items in the second and later `static + .map()` groups staying inert after hydration inside a self-portaling container (#1693, follow-up to #1688). `computeLoopSiblingOffsets` only counted static (non-loop) preceding siblings, so a `.map()` that followed an earlier `.map()` in the same container got a `children[idx]` offset that skipped the static labels but not the first group's mapped items. The generated `container.children[idx]` lookup for each later item's nested child component then resolved against the wrong element, leaving it unhydrated. The offset now also adds the runtime length of every preceding sibling loop's rendered array, so later groups resolve the correct children.
