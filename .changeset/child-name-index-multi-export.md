---
"@barefootjs/vite": patch
---

Resolve `@bf-child:` markers by exported component name, not by filename

`buildChildNameIndex` keyed each `'use client'` file by its own basename,
which works only because the one-component-per-file convention makes the
two coincide (`TodoItem.tsx` exports `TodoItem`). A file exporting several
components broke it silently: `icon/index.tsx` was keyed `index`, so a
`@bf-child:CopyIcon` marker found nothing and fell through to the no-op
module — a child that never hydrates, with no diagnostic to say so.

The index now keys on every exported component name, from
`@barefootjs/jsx`'s existing TS-AST walk (`listExportedComponents`) rather
than a new parse or a regex. Files whose export list comes back empty still
fall back to the basename, so the old convention keeps working.

This was found while surveying `site/ui` for the `@barefootjs/vite`
migration: 61 of its `'use client'` component files export more than one
component, so the limitation would have hit at scale.
