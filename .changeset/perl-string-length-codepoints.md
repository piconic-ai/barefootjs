---
"@barefootjs/perl": patch
---

Fix `.length` on strings in the ParsedExpr evaluator (`BarefootJS::Evaluator`, shared by the Mojolicious and Xslate adapters) to count Unicode codepoints instead of UTF-8 bytes. Perl previously counted raw bytes, diverging from JS on any non-ASCII string (e.g. `"café".length` was `5` instead of `4`); it now agrees with JS — and with the Go/Ruby/Python/PHP evaluators, which already counted codepoints — for any BMP-only string. Astral characters (emoji, CJK extension ideographs) still diverge from JS's UTF-16 code-unit count on every backend, a separate, documented, and still-open limitation (#2196 Level 2).
