---
"@barefootjs/perl": patch
---

Print a loop row's `data-key` as JS `String(key)` does, so a boolean row used as the key renders `data-key="true"` / `"false"` instead of `"1"` / `"0"` on Mojolicious and Xslate.
