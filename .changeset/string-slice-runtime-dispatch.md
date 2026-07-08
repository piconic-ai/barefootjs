---
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/rust": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/perl": patch
"@barefootjs/php": patch
---

Dispatch `.slice()` to a string branch in every backend's runtime helper. `word.slice(0, 4)` on a `string` prop rendered empty (Go/Ruby/Perl/PHP/Rust) or `[]` (Python/Perl EP text) instead of the substring — the adapter can't disambiguate a string receiver from an array receiver at compile time (both lower through the same `bf_slice`/`bf.slice` call), so the compiled template already emits the correct polymorphic call; only the runtime helper itself needed a string branch, the same way `.includes()` already dispatches on the runtime value's type. Negative start (`slice(-4)`), an absent end (`slice(4)`), out-of-range clamping, and multi-byte characters (indexed by code point, not byte offset) all match the JS reference. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts`) pin the string-receiver shape across every runtime that consumes the shared corpus (Go, Perl, Python, Ruby, PHP), plus a matching Rust test. The `string-slice` fixture graduates from all eight template adapters' `renderDivergences` declarations.
