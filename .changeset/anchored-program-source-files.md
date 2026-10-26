---
"@barefootjs/jsx": patch
---

Test harness speedup: Programs built by `createAnchoredProgram` (the conformance and docs-example harnesses) now share parsed SourceFiles through a new `SourceFileCache`, which `createProgramForFile` accepts as `hostOptions.sourceFiles`. A Program per harness compile no longer re-parses `lib.*.d.ts` and `@barefootjs/client`'s declarations (#3666). Each distinct file text is parsed once, so a changed file is parsed again and never served stale; every compile still gets its own Program and checker. `bf build`, `@barefootjs/vite` and `compileJSX`'s own per-file Program are unchanged, and compiled output is byte-identical for every fixture.
