---
"@barefootjs/jsx": patch
---

Fixes #2960: a ternary conditional whose one arm is a single element and whose other arm is a multi-root JSX fragment now compiles correctly even when the fragment's roots share the SAME tag name (e.g. `cond ? <div>...</div> : (<><div id="before">...</div><div id="after">...</div></>)`).

`addCondAttrToTemplate`'s `isSingleRootElement` helper decided "single root" by checking whether the branch's HTML string ended with a closing tag of the root's own tag name — a check that a second, unrelated sibling of the same tag name satisfies just as well as a genuine single root's own closing tag. Misclassified this way, the multi-root branch got `bf-c="<id>"` stamped onto only its first element instead of being comment-wrapped, which routed the client runtime's branch swap (`insert()`) through `updateElementConditional`'s `fragment.firstChild`-only path and silently dropped every sibling after the first on a live toggle.

`isSingleRootElement` now walks top-level tags tracking nesting depth instead of that lexical shortcut, while keeping the same entry/exit guards as before so a shape the `bf-c` splice can't stamp (a self-closing root, a hyphenated custom-element tag) still falls through to comment-wrap exactly as it did previously.
