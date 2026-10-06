---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

A reactive attribute on an element forwarded as a conditional child component's `children` (`{show() && <Wrapper><strong data-label={label()} /></Wrapper>}`) now updates. The branch's `qsa` lookup skipped the parent-owned (`^`-prefixed) slot because it renders inside the receiving child's scope. The compiler now passes the slot ids of the receiving components (`qsa(__branchScope, '[bf="^s2"]', ["s3"])`), and `qsa` accepts a nested parent-owned candidate only when every scope between it and the searching component is one of those receivers — so a same-numbered `^sN` another component authored (a sibling, or a receiver's own internal component) is never written.
