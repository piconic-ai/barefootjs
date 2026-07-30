---
"@barefootjs/jsx": patch
"@barefootjs/cli": patch
---

Stop per-specifier type-only imports from leaking into the client bundle as value imports

`import { paperColor, type Theme } from '../lib/theme'` could put `Theme` — a
type, with no value binding anywhere — into the generated client JS as a value
import, and from there into the relative-import inliner's IIFE return:

```js
const __bf_inline_0 = (() => {
  function paperColor2(t) { … }
  return { paperColor: paperColor2, Theme };
  //                                ^^^^^ never declared — it is a type
})();
```

`Theme` has no binding in the IIFE, so the module threw
`ReferenceError: Theme is not defined` before anything hydrated. The whole
page's client JS was dead, and because the SSR markup stayed on screen it read
as "hydration silently never ran" rather than as a load error.

Two independent gaps compounded in `collectExternalImports`
(`ir-to-client-js/imports.ts`), which decides which specifiers survive into the
client bundle:

- Only the **declaration-level** `imp.isTypeOnly` was consulted. The analyzer
  has recorded per-specifier `spec.isTypeOnly` since #1915, but this loop never
  read it, so `{ type Foo }` was indistinguishable from `{ Foo }`.
- Usage was decided by a `\bname\b` text scan over the emitted code. A word
  boundary is not a reference: an object key (`{ Theme: 'テーマ' }`), a string
  literal (`'Theme'`), a property access (`obj.Theme`) all matched.

Either alone was survivable — the first only mattered if the name happened to
appear, the second only over-emitted imports whose bindings existed. Together,
a type name that merely *appeared as a word* became a value import.

The fix closes both halves, plus adds a backstop for anything that still slips
through:

- **Per-specifier type-only specifiers are skipped** at every site that emits
  an import into a client bundle: `collectExternalImports`, the state-only
  module path in `compiler.ts`, and `collectUserDomImports` — where
  `import { createSignal, type Signal } from '@barefootjs/client'` would
  otherwise emit `Signal` from the `/runtime` subpath, which does not export it.
  The two sites that only *read* the flag are guarded too, so a type-only
  specifier no longer forces a `.client.js` source rewrite or trips the
  browser-only-API diagnostic.
- **Usage is a value-reference test, not a text scan.** The new
  `collectValueReferencedNames` (`value-references.ts`) walks the emitted code
  with the TypeScript parser and keeps only identifiers in genuine value
  positions, reusing the `isValueReferenceIdentifier` classifier that the CLI's
  stripped-import detector already had (now shared, one door, so the two
  "is this a real use" checks in the pipeline cannot drift apart). A shorthand
  property (`{ helper }`) counts — it reads the binding. When the text cannot be
  parsed cleanly the helper answers `null` and callers fall back to the old text
  scan: narrowing on a partial parse would *drop* a needed import, which is the
  one direction this must never fail in.
- **`BF055` — inlined module missing a requested export.** `buildTopLevelIIFE`
  now compares the names its consumers ask for against the module's export
  surface and fails the build with the name, the module, and the exact
  `ReferenceError` it would have produced. The emitted `return` is left
  unchanged on purpose: the build error is the deliverable, and the throwing
  artifact stays as the loud signal for anyone who ships past a red build. The
  check is skipped when the surface is not exhaustively enumerable (an
  `export * from './other'`), and the surface counts everything a module's
  `export` clauses legally NAME — re-exports, `export enum`,
  `export namespace` — so a legal module shape can never produce a false
  failure. That surface is deliberately wider than the set that populates the
  namespace IIFE's `return`, which stays restricted to names with a binding in
  the inlined body. The module source is parsed at most once per module, and
  not at all when neither the namespace return nor the check needs it —
  `inlineRelativeImports` is `bf build` hot path.

Note this only ever bit projects that do **not** set `localImportPrefixes` —
with it set, relative imports leave the loop before the usage test. It is not
part of `createConfig`'s documented surface for a Hono project, so a stock
config took the scanning path for every relative import.
