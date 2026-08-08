---
'@barefootjs/jsx': patch
'@barefootjs/hono': patch
---

Re-anchor relative specifiers inside dynamic `import()` and `typeof import()` when emitting SSR templates (#2588). Those specifiers ride along inside declaration source text re-emitted verbatim (module-scope consts/functions, a component body's local handlers), so they never reach `metadata.templateImports` and were left pointing at the source file's directory — an unresolvable path once the template lands at a different depth, failing the backend bundler with `Could not resolve "…"`. Adds `rewriteDynamicImportsInSource` (TS AST + span splicing) to `@barefootjs/jsx`, applied by `HonoAdapter` alongside the existing static-import rewrite.
