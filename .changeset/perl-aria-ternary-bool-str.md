---
"@barefootjs/jsx": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

An attribute serialized through `bool_str` as a whole (an ARIA boolean name or a boolean-typed prop) whose ternary mixes a boolean branch with another kind (`aria-hidden={yes() ? false : no()}`) renders the taken branch's truth again (`"false"`), instead of `"true"` from the stringified `'false'` branch. The boolean-result classifier the two Perl adapters kept as identical copies now lives in `@barefootjs/jsx` (`isBooleanResultParsed`, `stringifyBooleanTernaryBranches`).
