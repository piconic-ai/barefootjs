---
"@barefootjs/cli": patch
---

`bf debug profile --scenario` now loads child components imported through a tsconfig `paths` alias (the scaffold's `@/components/*`), so profiling the starter `Counter` mounts its `Button`s instead of empty placeholders. When an alias target exists both as a build output and as a source file, the file the tsconfig treats as a project source is used. An alias that matches `paths` but resolves to no file now fails with an error naming the import and its importer instead of silently profiling a partial mount. Import specifiers are now read from the parsed source instead of a regex.
