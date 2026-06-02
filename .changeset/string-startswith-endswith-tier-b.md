---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Lower `String.prototype.startsWith(prefix)` / `endsWith(suffix)` to the template-language adapters (#1448 Tier B).

`value.startsWith('a')` / `value.endsWith('z')` now compile to both template adapters instead of refusing with BF101. Both return a boolean, so they slot naturally into condition position (`value.startsWith(p) ? … : …`).

Full JS arity: the optional `position` (`startsWith`) / `endPosition` (`endsWith`) second argument re-anchors the test, clamped to `[0, length]` so it never crashes — `"hello world".startsWith("world", 6)` and `"hello world".endsWith("hello", 5)` both lower. A third+ argument is ignored. The zero-arg form (`.startsWith()`) is refused: JS coerces the missing search to the literal string `"undefined"`, a degenerate result (mirrors the `.includes()` zero-arg refusal). Verified byte-equal across Hono/CSR, Go, and Mojo.

- Parser: two new `array-method` variants `startsWith` / `endsWith`, dropped from `UNSUPPORTED_METHODS`.
- Go: new `bf_starts_with` / `bf_ends_with` runtime helpers (`strings.HasPrefix` / `strings.HasSuffix`, with the optional clamped position).
- Mojo: new `bf->starts_with` / `bf->ends_with` helpers doing a `substr`-anchored literal comparison (no regex metachar surprises), with the optional clamped position and empty-prefix/suffix + undef-receiver handling matching JS and Go.
