---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Lower the string-pattern form of `String.prototype.replace(pattern, replacement)` to the template-language adapters (#1448 Tier B).

`value.replace('o', '0')` now compiles to both template adapters, replacing the **first** occurrence (JS string-pattern semantics — not `.replaceAll`).

Full JS arity: a third+ argument is ignored (the adapter reads only the pattern + replacement). The one- and zero-argument forms are refused — JS coerces the missing replacement (and pattern) to the literal string `"undefined"`, a degenerate result (mirrors the `.includes()` / `.startsWith()` zero-arg refusal).

- Parser: new `array-method` variant `replace`, dropped from `UNSUPPORTED_METHODS`. **Regex-pattern** `.replace(/…/, …)` stays refused with BF101 (the Perl `s///` vs Go `regexp.ReplaceAllString` flavour gap is the open design question), and `.replaceAll` stays refused entirely.
- Go: new `bf_replace` runtime helper (`strings.Replace` with n=1).
- Mojo: new `bf->replace` helper that splices via `index`/`substr` (not `s///`) so both the pattern and the replacement are literal.

Known divergence (documented in `bf.go`, `BarefootJS.pm`): the replacement string is treated **literally** on both template adapters — special replacement patterns (`$&`, `$1`, …) are not interpreted. Go and Perl agree (byte-equal SSR output); this differs from the Hono/CSR JS path only for replacement strings containing `$`-patterns, which are rare in template position.
