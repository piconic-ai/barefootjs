---
"@barefootjs/cli": patch
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Perf: new `runtimeBundle: 'treeshake-exact'` build mode (#2143 gap 4) drops the always-kept public mount API (`render`, `hydrate`, `flushHydration`, `rehydrateAll`, `rehydrateScope`, `disposeScope`, `setupStreaming`, `createSearchParams`) that `'treeshake'` (the default) unconditionally keeps in `barefoot.js` regardless of whether the project actually uses them. Under `'treeshake-exact'` these names ship only if the compiled output, `bundleEntries`, `externals`, or an explicit `runtimeKeep` entry actually reaches them — a hand-written page script the CLI never compiles (e.g. an inline `<script type="module">` calling `hydrate()` directly) must list any such name in `runtimeKeep` or it's silently dropped. Fully opt-in; `'treeshake'` stays the default with unchanged behavior. Also fixes a real crash-to-full-copy bug the new mode could hit: a project with zero reachable runtime exports now skips `barefoot.js` generation (and removes any stale copy from a prior build) instead of failing into shipping the entire uncompressed runtime.
