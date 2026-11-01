---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/pebble": patch
"@barefootjs/erb": patch
"@barefootjs/perl": patch
"@barefootjs/php": patch
---

Binary `+`, template literals and the nil reading of an omitted prop now give the JS answer on every template adapter, decided once by the shared primitive plan (#3824 step 4a).

- A `+` is the host's `+` only over two proven numbers, the host's concatenation only when one operand is a proven string (the other through the runtime's JS ToString, `to_string`), and the runtime's JS `+` (`plus`) otherwise. A `+` over operands Phase 1 cannot type no longer adds a string as `0` (Go, Perl) or raises (Python, Ruby, PHP).
- A template-literal part prints through `to_string` unless it is a proven string: `null` prints `null`, a number with `Number::toString`, an array joined with `,`.
- An omitted optional prop (`s?: string`, `n?: number`) is read as `undefined` wherever its coercion is static, in every position: `props.s + '!'` is `undefined!`, `props.n + 1` and `props.n * 2` are `NaN`, `` `${props.n}` `` is `undefined`, and `props.n < 1` is false. This now also holds in `.filter()` predicates, body destructures, memos the Go adapter evaluates, Go child props, and Go attribute ternaries (#3740, #3750). An optional string row field under `+ number` concatenates when present and is `NaN` when omitted.
- Every runtime's JS ToString joins an array with `,` and spells an object `[object Object]`, and `+` over an array concatenates. Ruby's `plus` rounds a sum past 2^53 as a double; the native `+` over two proven numbers keeps the host's exact integer sum there on PHP (an accepted gap, `plus-beyond-safe-integer`).
- Unchanged until the runtimes carry `undefined` (#3848): a string prop typed `?: string | null`, a `+` whose other operand is untyped, and an untyped nil in a template literal (pinned by `awaits-undefined-plus-shapes`); arithmetic over `?: number | null` stays a BF101 refusal.
