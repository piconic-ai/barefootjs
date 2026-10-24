---
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/perl": patch
"@barefootjs/php": patch
"@barefootjs/rust": patch
"@barefootjs/blade": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

`.indexOf`, `.lastIndexOf` and `.at` on a string now work in the template runtimes, counting positions in UTF-16 code units as JS does (#3613). They used to handle only arrays, so a string rendered `-1`, `-1` and an empty value: `'日本語'.indexOf('本')` rendered `-1` instead of `1`, and `'日本語'.at(-1)` rendered nothing instead of `語`. An astral character counts as two units, so `'a😀b'.indexOf('b')` is `3`. The position argument of `.startsWith` / `.endsWith` is now a UTF-16 position too: Go read it as a byte offset, and Perl, Python, Ruby, PHP and Rust read it as a code point offset. An index or position is read with `ToIntegerOrInfinity`, so `'abc'.at(NaN)` is `'a'` and `at(Infinity)` is empty instead of throwing (Python raised `ValueError`, Ruby `FloatDomainError`) or, on PHP, reading `Infinity` as `0`. When `.at` lands on half of a surrogate pair, JS returns a lone surrogate; these runtimes return U+FFFD instead, which differs from JS when the result is compared or concatenated (`${w.at(1)}${w.at(2)}` renders `��`, not the emoji). That gap is declared as the `string-at-lone-surrogate` limitation on every adapter except Pebble. Pebble's runtime already used Java's native UTF-16 strings and needed no change. A separate gap that shows up when the value is empty is now declared on every template adapter (`dataPointDivergences`, limitation `undefined-method-result-attr`): an attribute bound to a method call that returns `undefined`, such as `data-last={word.at(-1)}` with `word: ''`, renders `data-last=""` where JS omits the attribute. `@barefootjs/xslate` now exports `dataPointDivergences` like the other adapters.
