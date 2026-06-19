---
"@barefootjs/go-template": patch
---

Fix invalid template syntax for a dynamic text node whose expression is a template literal with leading literal text.

Such an expression lowers to a **mix** of literal text and `{{...}}` actions (e.g. ` · #${tag}` → ` · #{{.Tag}}`). `renderExpression` only skipped re-wrapping when the lowered string *started* with `{{`, so a template literal with leading literal text fell through and got wrapped whole — emitting `{{ · #{{.Tag}}}}`, which `html/template` rejects at parse time (`unrecognized character in action: U+00B7 '·'`). It now skips re-wrapping when the lowered string starts with `{{` (an `{{if}}`/`{{with}}` action chain) **or** the parsed expression is a `template-literal`, and emits it as-is between `bfTextStart`/`bfTextEnd`. The check keys off the parsed expression kind rather than substring-matching `{{`, so a bare string literal that merely contains `{{` (JSX `{"{{"}` → Go expr `"{{"`) is still wrapped and stays escaped. This is the shared blog `PostList` status-line shape (the `· #${params().tag}` branch).
