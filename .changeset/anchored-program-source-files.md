---
"@barefootjs/jsx": patch
---

Test harness speedup: Programs built by `createAnchoredProgram` (used by the conformance and docs-example harnesses) now share parsed SourceFiles through an internal cache, so a Program per harness compile no longer re-parses `lib.*.d.ts` and `@barefootjs/client`'s declarations (#3666). Each distinct file text is parsed once, so a changed file is parsed again and never served stale, and every compile still gets its own Program and checker. The public `createProgramForFile` signature is unchanged. `bf build`, `@barefootjs/vite` and `compileJSX`'s own per-file Program are unchanged, and compiled output is byte-identical for every fixture.
