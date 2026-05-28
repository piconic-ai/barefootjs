---
"@barefootjs/jsx": patch
---

Auto-defer reactive brand-package bindings (e.g. `@barefootjs/form` field accessors) referenced from template positions instead of raising BF061. `value={field.value()}`, `disabled={form.isSubmitting()}`, and `{field.error() && …}` now compile without a manual `/* @client */` on each binding.
