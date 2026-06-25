---
"@barefootjs/form": patch
---

Document the full public API of `@barefootjs/form` so JSR's "has docs for
most symbols" score reflects complete coverage. Adds JSDoc to every
exported symbol that was missing one: `createForm` (now with an
`@example`), `ValidateOn`, `CreateFormOptions` and its members, and the
`FieldReturn` / `FormReturn` interface declarations. Behaviour is
unchanged — documentation only.
