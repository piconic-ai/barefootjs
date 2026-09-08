---
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
---

Fix #2894 sibling gap (surfaced by the `string-concat-plus-renamed-prop` fixture added in this same PR): a `+` concat against a bare-props-form BODY-destructured, RENAMED prop (`const { fallbackLabel: skipLabel } = props`, the #2788 alias family) lowered to each adapter's numeric `+` instead of its string-concat operator (Kolon's `~` for Xslate, `~` for Twig, `.` for Blade), because `collectStringValueNames`'s string-typed-name witness had no notion of this alias family. Xslate's `+` coerces a non-numeric string operand to `0`; Twig and Blade's PHP arithmetic underneath fatals with "Unsupported operand types". `collectStringValueNames` now resolves this alias family via the shared `resolveBodyDestructuredPropAliases` helper in all three adapters, mirroring the fix already shipped for Mojolicious (#2883) and go-template (this PR).
