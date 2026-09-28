---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Fixed a `vite build` failure for `CSRAdapter` projects where a component file also exported a plain value (a constant or a function): `compileJSX` appended the file's module-level value exports to `markedTemplate` regardless of the adapter's own `generate()` output, so a CSR file's markedTemplate became that export alone — which `@barefootjs/vite`'s `assertNoRealTemplateOutput` then treated as real template output requiring a configured `templates` dir, even though nothing ever reads a CSR template.

`TemplateAdapter` gains an optional `emitsTemplates` field (default `true`); `CSRAdapter` sets it to `false`, and `compileJSX` now skips markedTemplate assembly entirely — module exports included — for any adapter that opts out this way.
