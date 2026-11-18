---
"@barefootjs/go-template": patch
---

Go template: an identity memo over a destructured prop (`createMemo(() => local)`) now holds the binding's value with its destructure default applied. When the default is a callback call (`{ b: local = ['y', ''].filter((x) => x !== '') }`) and the prop is omitted, the memo seeded from the raw Input field instead, so it and every memo computed from it rendered empty or `NaN`.
