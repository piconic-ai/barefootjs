---
"@barefootjs/jsx": patch
---

A `{...props}` spread onto a child component now merges with the call's explicit props in source order in the client JS, as it does in JS and on the server (#3688). The registration template used to drop the spread from the child's `renderChild(...)` props, so a client-side mount lost every spread key, and `initChild` let every explicit prop win, so `<Tag tone="first" {...props} />` overwrote the caller's `tone` once the child's effects ran. The template now keeps the spread at its source position, and an explicit prop written before the spread reads the caller's value first. Phase 1 marks such a spread (`SpreadAttr.propsObject`, the component's own props object through any alias hop); a `{...rest}` bag is not marked and is unchanged.
