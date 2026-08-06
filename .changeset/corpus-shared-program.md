---
"@barefootjs/vite": minor
"@barefootjs/jsx": patch
---

Share one ts.Program across every compile in the Vite plugin — and unblock Reactive<T>-brand components from building through it at all

Type-based reactivity detection (Reactive<T> brand classification, the
BF023/BF024 nullable-loop-key check) needs a `ts.TypeChecker`. The plugin
never passed `CompileOptions.program`, so every type-needing file paid its
own `ts.createProgram` inside `compileJSX`'s per-file fallback — and the
dominant cost of that call is constructing the lib.d.ts/node_modules type
graph, not parsing the one source file (~500-800 ms per call regardless of
file size; 36-52 s extrapolated across site/ui's 67 type-needing files).
Worse than slow: a file importing a Reactive<T>-branded package
(`@barefootjs/form`) got BF050 at severity `error` without a shared
Program, and the plugin throws on error diagnostics — such a file could
not build through the plugin at all.

`@barefootjs/vite` now maintains a `CorpusProgramManager`: one Program
whose roots are every discovered file that `needsTypeBasedDetection` says
needs a checker, built once per pass and passed to every compile (both the
cached canonical compile and the eager pass's scriptAssets recompile).
Watch-mode rebuilds go through `ts.createProgram`'s `oldProgram`
incremental path, and in-memory content that diverges from disk falls back
to a virtual single-file Program rather than ever handing the analyzer a
Program it would reject. Measured on the site/ui corpus: 11.2 s for the
67-file type-needing subset (seed + compile) versus 36-52 s extrapolated
per-file, with zero per-file Program creations.

`@barefootjs/jsx` fixes two defects the same measurement surfaced:

- **BF050 single/multi asymmetry**: the multi-component path pre-builds a
  per-file Program to amortize it across siblings and passed it down as if
  the caller had supplied it, suppressing BF050 — so the same brand import
  failed in a single-component file but silently relied on the per-file
  fallback in a multi-component one. BF050 now keys off whether the CALLER
  supplied `options.program` (`analyzeComponent`'s new `programIsShared`
  parameter), in both paths, and a multi-component file reports it once
  rather than once per sibling.
- **Stale-Program rebuild storm**: when an upstream rewrite
  (`preprocessInlineJsxCallbacks`, #1211) makes a caller-supplied Program
  stale, the analyzer silently discarded it PER COMPONENT and rebuilt a
  per-file Program each time — 14 rebuilds ≈ 30 s on site/ui's
  `xyflow-demo.tsx` alone. The multi-component path now detects the
  staleness up front and builds ONE per-file Program for the rewritten
  source, shared by every sibling.
