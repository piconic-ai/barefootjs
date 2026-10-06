---
"@barefootjs/client": patch
---

A reactive attribute on an element forwarded as a conditional child component's `children` (`{show() && <Wrapper><strong data-label={label()} /></Wrapper>}`) now updates. The branch's `qsa` lookup skipped the parent-owned (`^`-prefixed) slot because it renders inside the child's own scope; it now accepts it, as `$()` already does, after preferring a candidate outside nested child scopes.
