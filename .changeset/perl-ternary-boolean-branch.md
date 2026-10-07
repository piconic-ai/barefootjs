---
"@barefootjs/jsx": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

A non-boolean attribute bound to a ternary whose taken branch is boolean and whose other branch is not (`data-choice={yes() ? false : s()}`, `data-c={yes() ? n() > 0 : 'x'}`, `data-d={yes() ? false : undefined}`) now renders JS `String(boolean)` (`"false"` / `"true"`) instead of Perl's `0` / `1` / `''`. An ARIA boolean attribute (`aria-hidden={yes() ? false : no()}`) keeps rendering `"false"`. The boolean-result classifier the two adapters shared as identical copies now lives in `@barefootjs/jsx` (`isBooleanResultParsed`, `stringifyBooleanTernaryBranches`).
