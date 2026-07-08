---
"@barefootjs/jsx": patch
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

Support `String.prototype.replaceAll(pattern, replacement)` with a string pattern. Previously refused at compile time with BF101 (no lowering existed); the string-pattern form now lowers through a new `replaceAll` `ArrayMethod` IR member — parsed with the same arity/regex/object-literal gates as `.replace` (a regex-literal pattern stays refused, matching `.replace`'s deferred-form treatment) — to a dedicated all-occurrences helper on every backend: Go `bf_replace_all` (`strings.ReplaceAll`), the shared Perl runtime's `replace_all` (Mojolicious + Text::Xslate, index/substr loop keeping the replacement literal), Python's `bf.replace_all` (native `str.replace`, already global by default), Ruby's `bf.replace_all` (an index/splice loop — deliberately not `String#gsub`, which interprets `\1`/`\&` backreferences in the replacement even for a literal pattern), the shared PHP runtime's `replace_all` (`str_replace`, with the empty-pattern case hand-rolled since PHP's `str_replace("")` is a no-op unlike JS), and Rust's `bf.replace_all` (native `str::replace`, already global by default).

A dedicated helper, not the existing `.replace` lowering with a flag — reusing the first-occurrence helper would have silently truncated the replacement to one match. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) mirror `.replace`'s cases with a multi-occurrence receiver as the flagship, catching that exact swapped-lowering bug on every runtime that consumes the shared corpus (Go, Perl, Python, Ruby, PHP) plus a matching Rust vector. The `string-replaceall` fixture graduates from a BF101 refusal to a passing render on all eight template adapters.
