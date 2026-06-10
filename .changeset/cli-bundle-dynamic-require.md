---
"@barefootjs/cli": patch
---

fix(cli): `bf debug profile --scenario` crashed with `Dynamic require of "node:events" is not supported` (#1871)

The published CLI is a single-file ESM bundle, but the dynamic profiler's
lazily-imported DOM stack (happy-dom, whose `ws` dependency is CJS) calls
`require('node:events')` and friends at runtime. esbuild routes those through a
`__require` shim that throws under both Node and Bun unless a real `require`
exists in module scope. The bundle now defines one via
`createRequire(import.meta.url)` in the build banner, and the published-tarball
smoke suite runs `bf debug profile --scenario auto` so this interop class can't
regress silently again.
