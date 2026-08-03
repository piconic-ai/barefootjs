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
  `@barefootjs/xslate`) now points at built JS (`dist/vite.js` +
  `dist/vite.d.ts`) unconditionally — no publishConfig src→dist swap,
  matching `@barefootjs/client`'s existing "always dist" treatment for
  entries a non-bun runtime must load directly.
- `@barefootjs/vite`'s own `.` entry gets the same unconditional
  dist-only treatment (previously src-in-dev, dist-at-pack like most
  other entries).
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
- `@barefootjs/client`'s `./build` entry (already dist-only) had the
  identical latent bug one level removed: `CSRAdapter` (`csr-adapter.ts`)
  imports `BaseAdapter` from `@barefootjs/jsx` as a real value, and
  `build:js` externalized it — so `integrations/csr`'s `vite.config.ts`
  (`import { CSRAdapter } from '@barefootjs/client/build'`) hit the same
  crash one hop further down the chain. Fixed the same way: stop
  externalizing `@barefootjs/jsx`, add `--target node`.
- Root `build` script: `@barefootjs/vite` now builds before the
  `@barefootjs/hono` / `@barefootjs/go-template` / `@barefootjs/mojolicious`
  early-build trio, whose `build:types` step type-checks their `./vite`
  entry's `import type { AfterEmitContext } from '@barefootjs/vite'`
  against `@barefootjs/vite`'s (now dist-only) `.d.ts` — a real
  dependency edge the previous ordering didn't account for.
- `packages/vite/tsconfig.json` gains `DOM`/`DOM.Iterable` lib entries
  (every sibling adapter tsconfig already had them) — needed once
  `bun run build:types` for this package actually has to succeed instead
  of emitting into a `dist/` nobody read.

**DX cost**: every one of these packages now needs `bun run build` before
its `./vite` (or `@barefootjs/vite`'s `.`) entry resolves to anything
runnable — previously the workspace/dev resolution pointed straight at
`.ts` source with nothing to build. Running `vite dev` / `vite build` in
any integration (`hono`, `gin`, `csr`, …) without building the workspace
packages first now fails the same `ERR_UNKNOWN_FILE_EXTENSION` /
`Cannot find module` way it always would have on a stricter Node — the
fix removes the accidental "works because dist happens to already exist
from an unrelated build" case, it doesn't add a new requirement so much as
make the existing one enforced everywhere instead of hidden by this
container's Node version.

Backstop: `__tests__/vite-entry-node-loadable.test.ts` reads every
workspace package's manifest and fails if any `./vite` (or
`@barefootjs/vite`'s `.`) export's `types`/`import` resolves to raw `.ts`
source (a `.d.ts` declaration file is fine) — a future adapter that copies
the old `./build`-shaped entry fails loudly here instead of silently
depending on a new-enough Node.
