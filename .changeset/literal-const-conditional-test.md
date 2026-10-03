---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

A `const` initialized with a boolean literal (`const on = true`), at module or component-function scope, now selects the right branch when read as a conditional's test on every template adapter, as Hono renders it. Each adapter used to carry its own copy of the literal-const lookup, matching numbers and strings by regex but not booleans, so the const read as an unset template variable: the falsy branch rendered, or the template failed at render time. Go also missed a function-scope string const. The lookup is now one shared helper, `lookupLiteralConst` in `@barefootjs/jsx`, reading the analyzer's structured literal (boolean, number, string or `null`); each adapter only renders the result in its own syntax. A module `null` const no longer fails Mojolicious's `strict` compile, and on Go a bare `null` const in text renders empty instead of failing with `nil is not a command`.
