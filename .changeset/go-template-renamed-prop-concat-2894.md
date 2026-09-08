---
"@barefootjs/go-template": patch
---

Fix #2894 (go-template sibling of #2883): a `+` concat against a bare-props-form BODY-destructured, RENAMED prop (`const { fallbackLabel: skipLabel } = props`, the #2788 alias family) lowered to Go's numeric `bf_add` instead of `bf_concat_str`, because `collectStringValueNames`'s string-typed-name witness had no notion of this alias family. `bf_add` coerces both operands through `toFloat64`, so the string operand silently evaluated to `0` instead of concatenating. `collectStringValueNames` now also resolves this alias family via the shared `resolveBodyDestructuredPropAliases` helper, mirroring the fix already shipped for the Mojolicious adapter.
