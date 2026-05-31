---
"@barefootjs/jsx": patch
---

Fix mapped items in the second and later `static + .map()` groups staying inert after hydration inside a self-portaling container (#1693, follow-up to #1688). The `children[idx]` offset for a loop's nested child components only counted statically-sized preceding siblings, so siblings whose rendered element count is only known at runtime shifted the items and left them resolving against the wrong element (unhydrated):

- a preceding `.map()` contributes `array.length` children — the original report's two-group shadcn `Select`;
- a preceding `{cond && <el/>}` / `{cond ? <el/> : null}` conditional contributes 0 elements when its branch is absent (it renders only comment anchors), but was over-counted as a static `1`.

The offset is now computed from the actual element count of each preceding sibling — a folded integer for statically-sized nodes, plus a runtime term (`(arr).length`, `(cond ? 1 : 0)`) for dynamic ones. Non-element siblings (bare text / expressions) correctly contribute 0 since `container.children` is element-only.
