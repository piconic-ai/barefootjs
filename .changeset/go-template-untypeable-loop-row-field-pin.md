---
"@barefootjs/go-template": patch
---

Pin the `loop-row-child-children-untyped-array-nested-field` conformance fixture to the new `untyped-loop-array-untypeable-field` registry entry. On `@barefootjs/go-template`, a static loop over an unannotated object-literal array whose rows share their keys but carry a field with no plain value type (a nested object, a `null`, a non-identifier key) refuses with `BF101`; annotating the const with an explicit element type renders it. No behavior change.
