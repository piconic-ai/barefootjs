---
"@barefootjs/go-template": patch
---

Go template: `generateTypes(ir)` called on its own now gives a component the fields of the derived string consts its own template reads. It took them from the component the adapter rendered last, so in a file with several components every other component lost its field (`can't evaluate field Root in type CardProps` at render). The types `generate()` returns, which a build writes, were already correct.
