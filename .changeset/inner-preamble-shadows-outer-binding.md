---
'@barefootjs/jsx': patch
---

The client JS no longer rewrites an inner `.map()` row's own names as an enclosing row's bindings (#3394). An inner preamble local, item or index named like an outer destructure binding (`const name = t + '!'` inside a row bound as `({ name, tags })`) used to become `const __bfItem().name = …`, which does not parse. Each enclosing loop's accessor rewrite now skips the names the inner row rebinds, found via `BindingScope.enterLoopRow`.
