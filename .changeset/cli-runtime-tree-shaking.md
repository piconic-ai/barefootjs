---
"@barefootjs/cli": patch
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

`bf build` now tree-shakes the client runtime bundle (`barefoot.js`) down to only the `@barefootjs/client*` exports a project's compiled client JS (components, `bundleEntries`, rebundled `externals` chunks) actually imports, plus a small always-kept public mount API (`render`, `hydrate`, `flushHydration`, `rehydrateAll`, `rehydrateScope`, `disposeScope`, `setupStreaming`, `createSearchParams`) for hand-written page scripts the compiler never sees. Previously `barefoot.js` was always a byte-for-byte copy of the entire prebuilt runtime regardless of what the project used — on the CSR benchmark app this shipped ~72KB raw / ~19.4KB gzip; the same app now ships ~24KB raw / ~8.8KB gzip.

New config surface (`createConfig()` in `@barefootjs/client/build`, or any `barefoot.config.ts`):
- `runtimeBundle?: 'treeshake' | 'full'` — defaults to `'treeshake'`. Set to `'full'` to restore the previous verbatim-copy behavior.
- `runtimeKeep?: string[]` — extra runtime export names to force-keep, for names only ever referenced from hand-written page scripts beyond the always-kept set.

Safety: if the collector sees an import shape it can't safely narrow (a namespace import, a default import, or a dynamic `import()` of the runtime — reachable only through `bundleEntries`/rebundled `externals`, since the compiler's own component codegen never emits these shapes), the build falls back to a full runtime copy for that build and logs why, rather than risk shipping a `barefoot.js` missing something that's actually used.
