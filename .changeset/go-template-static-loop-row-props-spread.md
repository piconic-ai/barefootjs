---
"@barefootjs/go-template": patch
---

go-template now passes a `{...props}` spread onto a child component in a `.map()` over a local constant array through to each row. `fixed.map((it) => <Child key={it} size="s" {...props} label={it} />)` dropped the spread, so each row's child received only the call's explicit props. The constructor bakes each row's explicit props as before and merges the spread with them in source order: a key the caller passed wins over an explicit prop written before the spread, and an explicit prop written after it wins over the caller's. The `props-spread-static-loop-row` limitation is removed (#3713).
