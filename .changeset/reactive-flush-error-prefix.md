---
"@barefootjs/client": patch
---

When several effects or memos throw during one update, the errors after the first (which is rethrown to the writer) are now logged as `[BarefootJS] additional error during update:` so they can be attributed to the reactive runtime.
