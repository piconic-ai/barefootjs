---
"@barefootjs/go-template": patch
---

Refactor the Go html/template adapter: extract pure helpers, internal types, and per-compile state out of the 8.6k-line single-file `GoTemplateAdapter` into focused `adapter/lib/*` modules.

Internal-only, output byte-identical (verified by the adapter unit + conformance suites). No behavioural or public-API change:

- `lib/go-naming.ts` — Go identifier/initialism/keyword tables and field-name capitalisation.
- `lib/go-emit.ts` — Go-template string escaping, arg wrapping, and `bf_*` runtime-helper emitters (de-duplicates two identical `escapeGoString` copies).
- `lib/types.ts` / `lib/ir-scope.ts` / `lib/constants.ts` — adapter bookkeeping interfaces (`GoTemplateAdapterOptions` re-exported unchanged), IR scope traversal, and the template-primitive table.
- `lib/compile-state.ts` — `CompileState` groups the ~24 per-compile fields reset at the start of `generate()`/`generateTypes()` into one object, preserving field lifetimes 1:1.
