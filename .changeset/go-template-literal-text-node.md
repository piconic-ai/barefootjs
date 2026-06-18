---
"@barefootjs/go-template": patch
---

Fix invalid template syntax for a dynamic text node whose expression is a template literal with leading literal text.

Such an expression lowers to a **mix** of literal text and `{{...}}` actions (e.g. ` · #${tag}` → ` · #{{.Tag}}`). `renderExpression` only skipped re-wrapping when the lowered string *started* with `{{`, so a template literal with leading literal text fell through and got wrapped whole — emitting `{{ · #{{.Tag}}}}`, which `html/template` rejects at parse time (`unrecognized character in action: U+00B7 '·'`). It now detects any embedded `{{` (the string is already template text) and emits it as-is between `bfTextStart`/`bfTextEnd`. A bare expression (`len .Visible`, `bf_join …`) never contains `{{`, so it still gets wrapped correctly. This is the shared blog `PostList` status-line shape (the `· #${params().tag}` branch).
