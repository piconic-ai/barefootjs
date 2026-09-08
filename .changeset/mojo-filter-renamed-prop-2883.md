---
"@barefootjs/mojolicious": patch
---

Fix #2883: a `.filter()`/`.find()` predicate comparing against a bare-props-form BODY-destructured, RENAMED prop (`const { fallbackLabel: skipLabel } = props`, the #2788 alias family) lowered to Perl's numeric `!=`/`==` instead of string `ne`/`eq`, because `collectStringValueNames`'s string-typed-name witness had no notion of this alias family — only `MojoTopLevelEmitter`'s stash-derived `$skipLabel` variable (correctly resolved, contrary to this issue's original diagnosis of `MojoFilterEmitter.identifier()`) ever reached the comparison. `'Alpha' != 'Alpha'` and `'Beta' != 'Alpha'` both numify to `0 != 0`, so every row was silently filtered out regardless of the real string value. `collectStringValueNames` now also resolves this alias family via the shared `resolveBodyDestructuredPropAliases` helper (already used by the #2788 top-level splice path), so both emitters read the same, now-correct witness.
