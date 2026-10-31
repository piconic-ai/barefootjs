---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/perl": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/php": patch
"@barefootjs/pebble": patch
"@barefootjs/erb": patch
---

A JS boolean now renders as it does in JSX on every template adapter and in the client runtime (#3824 step 5).

- A text child whose value is a boolean renders nothing, as JSX renders no `true` / `false` child (#3789). The shared plan decides it from the types: a child proven a boolean (or nil) renders only its markers, and a child that may be a boolean among other types goes through the new runtime helper `display` (`bf_display` in Go), which blanks a boolean. The client runtime's text writes (`escapeText`, `textOrNode`, the 'text' slot writer and `__bfText`) render a boolean as no text too, and a loop row's text slot is written through `textOrNode` instead of `String`.
- Mojolicious and Xslate pass a boolean that leaves the expression as a JSON boolean (`boolean`), so it prints `true` / `false`, not Perl's `1` / `''` / `0`: a child prop (#3808), a signal seed, memo or loop-row local, a `JSON.stringify` element, a displayed text child, an inlined boolean `const`, a `createContext` default and a bare `<Child flag />`. A comparison concatenated to a string (`'c=' + (n > 1)`) prints `true` / `false` too. A test (`if`, `?:`, `!`) keeps Perl's own truthiness.
- A signal or local constant initialized with a comparison or `!` is typed `boolean`, so its tests are native where the target's table allows it.
