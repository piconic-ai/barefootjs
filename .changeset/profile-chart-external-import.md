---
"@barefootjs/cli": patch
---

fix(profile): actionable error for external `@barefootjs/client/runtime` imports (#1849 B3 follow-up)

`bf debug profile chart --scenario auto` leaked a raw `Cannot find module
'@barefootjs/client/runtime'` stack. The B3 classifier only matched a bare
`@barefootjs/client` import, but the cached `@barefootjs/chart` dist imports the
`/runtime` subpath. `isExternalClientImportError` now also matches the subpath
when the failing importer is a third-party bundle (bun cache / node_modules), so
these surface the same actionable "use `--scenario <story.tsx>` or the static
budget" message as xyflow instead of a raw module-resolution stack.
