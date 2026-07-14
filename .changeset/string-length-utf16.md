---
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/mojolicious": patch
---

Fix #2255: `.length` on a string now counts UTF-16 code units, matching JS `String.prototype.length`, on all 8 template adapters — previously each backend counted either bytes (Go's native `len`) or Unicode codepoints (every other backend's native string-length primitive), both of which diverge from JS for an astral-plane character (a surrogate pair in UTF-16, e.g. '👍' — length 2 in JS, 1 under codepoint-counting).

- Go: new `Length`/`bf_length` runtime helper (`bf.go`), used by the `.length` member lowering's generic (non-array, non-loop-slice) fallback. The array-only specialized `.length` shapes (filter-result count, memo-backed loop slice count) are unaffected and stay on native `len`.
- ERB: the `.length` lowering now routes through the shared `bf.length` runtime helper (previously called Ruby's native `.length` directly) so both call sites share one UTF-16-aware implementation.
- Jinja/Rust/Twig/Blade/Xslate/Mojolicious: fixed in place in each backend's shared `bf.length` runtime function (already the uniform `.length` dispatch point on 5 of the 6); Mojolicious additionally had a second `.length` lowering (a string-receiver fast path emitting Perl's native `length()` directly) now routed through the shared `bf->length` helper too.

All fixes implement the same UTF-16 code-unit count: iterate codepoints, count 1 for a Basic-Multilingual-Plane codepoint and 2 for an astral one (U+10000-U+10FFFF).

Out of scope: the separate `ParsedExpr` Evaluator subsystem (used for `.sort()`/`.filter()`/`.reduce()` callback bodies) has its own `.length` implementation with a documented, deliberate astral-plane divergence (`spec/compiler.md`, "byte-isomorphic between backends" contract) — unrelated to and unaffected by this fix.

Removes the `string-length-text:multibyte` (Go only) and `string-length-text:astral` (all 8 backends) `skipDataPoints` pins.
