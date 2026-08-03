---
"@barefootjs/vite": patch
"@barefootjs/client": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/hono": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Fix `./vite` entry points crashing on Node versions without native TypeScript stripping

Every adapter's `./vite` subpath (and `@barefootjs/vite`'s own `.` entry)
pointed at `.ts` source, e.g. `{"types": "./src/vite.ts", "import":
"./src/vite.ts"}`. That copied the shape of `./build` — which is only ever
loaded by `bf build` running under bun, a runtime that reads `.ts`
natively — but Vite's own config loader is a different kind of consumer:
it externalizes bare imports like `import { barefoot } from
'@barefootjs/hono/vite'` and lets **Node**, not bun, resolve and load them.
This only ever worked in a container whose Node happens to have native
type-stripping on by default (22.18+); on any older Node it fails with
`TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"` the
moment a downstream app's `vite.config.ts` does `import { barefoot } from
'@barefootjs/<adapter>/vite'`.

Fix, per package:

- Every `./vite` subpath (`@barefootjs/blade`, `@barefootjs/erb`,
  `@barefootjs/go-template`, `@barefootjs/hono`, `@barefootjs/jinja`,
  `@barefootjs/mojolicious`, `@barefootjs/rust`, `@barefootjs/twig`,
  `@barefootjs/xslate`) now SPLITS its two conditions instead of pointing
  both at the same file: `{"types": "./src/vite.ts", "import":
  "./dist/vite.js"}`. TypeScript reads `types`, Node reads `import` — they
  never had to be the same file, and keeping `types` on real source means
  every consumer that only ever needed to *type-check* against this entry
  (an adapter's own `build:types`, a downstream app's `tsc`) keeps doing so
  straight from source, with nothing built, exactly as before. Only the
  condition Node's ESM loader actually resolves (`import`) needs to be
  built JS. `publishConfig` is untouched — it already swapped both
  conditions to `dist` at pack time, which is correct: nothing outside
  this workspace should type-check against source.
- `@barefootjs/vite`'s own `.` entry gets the same split (top-level `types`
  → `./src/index.ts`, `import` → `./dist/index.js`; `publishConfig` keeps
  swapping both to dist at pack time, restored to its original shape).
- Each adapter's `build:js` now bundles `src/vite.ts` in its own `bun
  build` invocation, separate from the `index.ts`/`adapter/index.ts`/
  `build.ts` invocation those subpaths keep sharing. The `./vite` build
  does NOT externalize `@barefootjs/jsx` / `@barefootjs/shared` — Node
  would otherwise hit the exact same `.ts`-extension failure one hop
  later, resolving `@barefootjs/jsx`'s own (still src-pointing, unchanged)
  `.` export. `@barefootjs/vite`'s own build drops the same two externals
  for the same reason. Both keep `typescript` external (a real npm
  package, already Node-loadable) to avoid bundling the whole TS compiler
  into every adapter's `./vite` output.
- `--target node` on both of the above: bun's default bundle target is
  `browser`, which polyfills `node:fs/promises` et al. into browser stubs
  — silently turning every `readFile`/`writeFile`/`mkdir` call into
  `undefined` at runtime (`TypeError: readFile is not a function`) instead
  of failing to build. Only surfaces once something (Vite's config loader)
  actually calls the plugin's manifest-reading code, so it hid behind the
  same "nothing loads dist under Node" gap as the `.ts`-extension bug.
- `@barefootjs/client`'s `./build` entry (already dist-only on both
  conditions, unchanged by this PR — its consumers always needed it
  built) had the identical latent runtime bug one level removed:
  `CSRAdapter` (`csr-adapter.ts`) imports `BaseAdapter` from
  `@barefootjs/jsx` as a real value, and `build:js` externalized it — so
  `integrations/csr`'s `vite.config.ts` (`import { CSRAdapter } from
  '@barefootjs/client/build'`) hit the same crash one hop further down the
  chain. Fixed the same way: stop externalizing `@barefootjs/jsx`, add
  `--target node`.
- Root `build` script keeps `@barefootjs/vite` as an explicit early build
  step, before the `@barefootjs/hono` / `@barefootjs/go-template` /
  `@barefootjs/mojolicious` trio and the rest of `--filter '*'`. This is
  NOT for type resolution (the `types`/`import` split above already
  decouples that from build order — a scoped `build:types` run, e.g. `cd
  packages/blade && bun run build`, never needs `@barefootjs/vite` built).
  It's for the RUNTIME resolution real `vite build`/`vite dev` invocations
  need: `--filter '*'` does not reliably build `@barefootjs/vite` before
  workspace packages whose OWN build step actually executes a Vite config
  that imports it (`integrations/nethttp`, `integrations/chi`, and any
  other integration whose `build` script runs `vite build` for real, not
  just type-checks) — confirmed by dropping this step and watching a
  clean `bun run build` fail with `ERR_MODULE_NOT_FOUND` resolving
  `@barefootjs/vite/dist/index.js` from `adapter-go-template/dist/vite.js`
  partway through `--filter '*'`.
- `packages/vite/tsconfig.json` gains `DOM`/`DOM.Iterable` lib entries
  (every sibling adapter tsconfig already had them) — still needed
  independent of the above: `packages/vite`'s OWN `build:types` walks real
  (non-type-only) imports from `@barefootjs/jsx`, whose `html-types.ts`
  needs DOM lib to resolve `HTMLButtonElement` and friends. Confirmed by
  reverting just this file and rebuilding — `tsgo` fails the same way
  whether or not the root build ordering or the `types`/`import` split are
  in place.

**DX cost**: every one of these packages' `./vite` (or `@barefootjs/vite`'s
`.`) entry now needs `bun run build` before `vite dev` / `vite build` can
actually load and run it — the `import` condition was always meant to be a
build artifact, this just stops it accidentally working off raw source.
Type-checking (`tsc`/`tsgo` against the `types` condition) needs no build
step at all, in any of these packages, scoped or full — that's the whole
point of the split. Running an integration's `vite dev`/`vite build`
without building workspace packages first fails the same
`ERR_UNKNOWN_FILE_EXTENSION` / `ERR_MODULE_NOT_FOUND` way it always would
have on a stricter Node; the fix removes the accidental "works because
dist happens to already exist from an unrelated build" case rather than
adding a new requirement.

Backstop: `__tests__/vite-entry-node-loadable.test.ts` reads every
workspace package's manifest and fails if any `./vite` (or
`@barefootjs/vite`'s `.`) export's `import`/`default` condition — the ones
Node's ESM loader itself resolves — points at raw `.ts` source. `types` is
deliberately exempt (see above); a `.d.ts` declaration file is fine on
either condition. A future adapter that copies the old fully-`.ts`-pointing
shape, or that regresses `import` back onto source, fails loudly here
instead of silently depending on a new-enough Node.
