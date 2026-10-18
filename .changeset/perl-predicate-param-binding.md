---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/erb": patch
---

A filter predicate's param now reads as the right Perl variable through the emitter's binding instead of a regex rename over the rendered predicate. A string literal that spells the param with a sigil (`t.name !== '$t'`) is no longer rewritten, and on Mojolicious a nested callback that reads the outer param (`t => t.tags.some(g => g === t.main)`) now sees the outer element: each `grep` binds its param as a named lexical. On ERB, the same nested callback inside a `filter().map()` loop gate emitted the outer param under its JS name instead of the loop's bound local, which raised a `NameError` at render time; it now emits the bound local.
