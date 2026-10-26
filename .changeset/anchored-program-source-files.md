---
"@barefootjs/jsx": patch
---

Test harness speedup: Programs built by `createAnchoredProgram` (the conformance and docs-example harnesses) now share parsed SourceFiles through a new `SourceFileCache`, which `createProgramForFile` accepts as `hostOptions.sourceFiles`. A Program per harness compile no longer re-parses `lib.*.d.ts` and `@barefootjs/client`'s declarations (#3666). A cached file is reused only while its text is unchanged. `bf build`, `@barefootjs/vite` and `compileJSX`'s own per-file Program are unchanged, and compiled output is byte-identical for every fixture.
