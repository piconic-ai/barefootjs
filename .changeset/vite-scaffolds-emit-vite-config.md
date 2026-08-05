---
"@barefootjs/cli": minor
---

Scaffolds emit `vite.config.ts` instead of `barefoot.config.ts`

All nineteen integrations run on `@barefootjs/vite`, and PR 7a made `bf`
read its project config from `vite.config.ts` (with `barefoot.config.ts`
still working as a fallback). Until now, `bf init` (and therefore
`npm create barefootjs@latest`) kept generating fresh projects wired to the
legacy pipeline: every scaffold wrote a `barefoot.config.ts` targeting
`@barefootjs/<adapter>/build`'s `createConfig`, with `bf build [--watch]`
wired into every `dev`/`build`/`start` script. This PR is the last thing
standing between here and deleting that pipeline (7c).

**Every scaffold** (`hono`, `hono-node`, `echo`, `gin`, `chi`, `nethttp`,
`mojo`, `xslate`, `csr`) now writes `vite.config.ts` using that adapter's
composed plugin — `import { barefoot } from '@barefootjs/<adapter>/vite'`
(CSR uses `@barefootjs/vite` directly with `CSRAdapter`, matching the
migrated `integrations/csr`) — mirroring the shape of the corresponding
migrated integration rather than inventing a new one. `package.json`'s
`dev`/`build`/`start` scripts now run `vite build`/`vite dev` (SSR
adapters: `vite build` once up front so the compiled templates exist
before the backend server starts, then `vite dev` takes over the watch
loop with dev-origin script URLs; CSR: `vite build --watch`, since it has
no backend to bake a dev-origin URL into — see its `vite.config.ts`'s
docstring). `--minify` is gone from every build/deploy script — `vite
build` minifies production output by default, no flag needed.

Hono's renderer (`@barefootjs/hono/scripts`'s `<BfScripts />`) no longer
needs a hand-wired import map or a `manifest.json` prop: under Vite,
`@barefootjs/client` is an ordinary bundled ESM specifier every compiled
entry imports, and `HonoAdapter.generate()` bakes each component's
Vite-resolved script URL(s) into its SSR template at codegen time.

Every `vite.config.ts` sets `publicDir: false` — the scaffold's own
`public/` (hand-written CSS + `unocss --watch`'s output) is served
directly by each backend, not by Vite, and Vite's default publicDir
behavior (copy it verbatim into `build.outDir`) would otherwise write a
second, build-order-dependent copy that goes stale relative to
`unocss`'s own regeneration — discovered by inspecting real build
output, not by inspection alone. Every `vite.config.ts` also adds a
`resolve.alias` mapping `@/components` to the source `components/`
dir, mirroring `tsconfig.json`'s existing path mapping: `tsc`/`tsx`
already read that from `tsconfig.json`, but Vite's dev-server dependency
pre-scan (esbuild, run before this plugin's own `transform` hook ever
sees a file) parses raw source directly and has no notion of tsconfig
`paths` without it — `vite dev` failed to resolve the starter Counter's
registry `<Button>` import without this.

The CSR scaffold's starter Counter switches to the bare, registry-free
variant (`bundledRegistryComponents: []`, following the Xslate
scaffold's own precedent for a different compiler gap): the registry
`<Button>`/`<Slot>` pair each re-export named types, and the compiler
always emits that re-export line into a component's `markedTemplate`
output regardless of adapter. With no `templates` dir configured (CSR's
whole point), `@barefootjs/vite`'s `assertNoRealTemplateOutput` guard
correctly refuses to silently drop that non-empty output, so `vite
build` failed outright the moment the scaffold's default Button fetch
pulled it in — a latent compiler/CSR interaction no existing
integration had ever exercised (every migrated integration's
CSR-equivalent Counter uses native `<button>` elements).

`bf init`'s "already initialized" guard now checks for `vite.config.ts`
instead of `barefoot.config.ts`. `packages/adapter-tests/src/
scaffold.contract.ts`'s cross-adapter contract asserts `vite.config.ts` is
written (step 3) instead of `barefoot.config.ts`; the Hono and Mojolicious
`scaffold.test.ts` integration suites assert the new config's shape and
dev script.

Verified by scaffolding and building real projects — `chi` (Go),
`hono-node` (JS/Node), and `csr` — via the built CLI, installing real
packed `@barefootjs/*` tarballs (not a monorepo `file:` symlink, which
hits an unrelated dual-module-instance hazard), and running both
`<pm> run build` and `<pm> run dev` (the `vite build`/`vite dev` +
backend-server watch loop) to a live server serving hydrated SSR HTML /
a working CSR page with correctly resolved static assets.
