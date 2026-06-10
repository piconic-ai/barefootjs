#!/usr/bin/env node
// Bundle the CLI into a single file for npm distribution.
//
// - Entry: src/index.ts
// - Output: dist/index.js (ESM, single file)
// - Externals: typescript (needed at runtime by bundled jsx compiler),
//   esbuild (used by runtime.ts for transpile).
// - Everything else — including workspace packages like @barefootjs/jsx —
//   is bundled inline so the published CLI is self-contained.

import { build } from 'esbuild'
import { chmodSync, copyFileSync, cpSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { builtinModules } from 'node:module'

// Normalise every Node builtin import to the `node:` specifier. Source
// files import a mix of bare (`from 'fs'`) and prefixed
// (`from 'node:fs'`) builtins; esbuild preserves whichever the source
// used. Deno only resolves Node builtins through the `node:` form, so
// without this the published bundle fails to load under
// `deno x npm:@barefootjs/cli`. Node 22 and Bun both accept `node:`, so the
// rewrite is a no-op for them — it only unlocks the Deno runtime.
const nodeProtocolPlugin = {
  name: 'node-protocol',
  setup(b) {
    b.onResolve({ filter: /^[a-z@]/ }, (args) => {
      if (args.path.startsWith('node:')) return { path: args.path, external: true }
      // `fs/promises` → base `fs`; scoped/npm packages fall through.
      const base = args.path.split('/')[0]
      if (builtinModules.includes(base)) {
        return { path: `node:${args.path}`, external: true }
      }
      // Non-builtins (typescript, esbuild, bundled deps) keep esbuild's
      // default resolution — `external` config still applies.
      return null
    })
  },
}

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')
const entry = resolve(pkgDir, 'src/index.ts')
const outfile = resolve(pkgDir, 'dist/index.js')
// Monorepo `docs/core/` lives three levels up from `packages/cli/`.
// We copy it into `dist/docs/core/` so `bf guide` can read framework
// docs from the installed npm package, not just from a monorepo
// checkout. Only `dist` is in `files`, so this path is what ships.
const docsSrc = resolve(pkgDir, '../../docs/core')
const docsDst = resolve(pkgDir, 'dist/docs/core')
// `bf tokens` reads the default token palette from this JSON. The
// monorepo source lives under `site/shared/tokens/`, but that
// directory ships nowhere — copy it next to the bundle so
// `tokens.ts` can fall back to the bundled copy when the user is
// running inside a scaffolded app instead of the monorepo.
const tokensSrc = resolve(pkgDir, '../../site/shared/tokens/tokens.json')
const tokensDst = resolve(pkgDir, 'dist/tokens.json')
// `bf preview` ships the registry's own globals.css + UnoCSS config as
// the default styling, so `bf add`-ed components render with zero setup
// when the user project provides none of its own. Resolved by
// lib/preview/assets.ts next to the bundle.
const previewGlobalsSrc = resolve(pkgDir, '../../site/ui/styles/globals.css')
const previewGlobalsDst = resolve(pkgDir, 'dist/preview-globals.css')
const previewUnoSrc = resolve(pkgDir, '../../site/ui/uno.config.ts')
const previewUnoDst = resolve(pkgDir, 'dist/preview-uno.config.ts')

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Keep runtime deps external so they are resolved from node_modules, not inlined.
  external: ['typescript', 'esbuild'],
  // Rewrite bare Node builtins to the `node:` specifier so the bundle
  // loads under Deno as well as Node/Bun.
  plugins: [nodeProtocolPlugin],
  // Bundled CJS deps (happy-dom's ws, via `bf debug profile --scenario`)
  // call `require('node:events')` etc. at runtime. In ESM output esbuild
  // routes those through a `__require` shim that throws "Dynamic require
  // of … is not supported" unless a real `require` exists in module scope
  // — so define one via `createRequire`. Deno also supports this (#1871).
  // esbuild keeps the entry's shebang above the banner.
  banner: {
    js: "import { createRequire as __bfCreateRequire } from 'node:module';\nconst require = __bfCreateRequire(import.meta.url);",
  },
  legalComments: 'none',
  logLevel: 'info',
})

// Make the bundle executable so `bin` symlinks work.
chmodSync(outfile, 0o755)

// Ship framework docs alongside the bundle so `bf guide` works in
// scaffolded apps. `cpSync` copies both `.md` and `.mdx`; the CLI
// projects `.mdx` to plain markdown at read time via
// `readDocAsMarkdown` so terminal output stays clean.
if (existsSync(docsSrc)) {
  if (existsSync(docsDst)) rmSync(docsDst, { recursive: true, force: true })
  cpSync(docsSrc, docsDst, { recursive: true })
  console.log(`Copied: ${docsSrc} -> ${docsDst}`)
} else {
  // pkg-pr-new / published-tarball flows always have docs/core in the
  // source tree. A missing source dir means the build is happening
  // somewhere unexpected; warn but don't fail — `bf guide` will surface
  // its own error if the dir is missing at runtime.
  console.warn(`Warning: ${docsSrc} not found; bf guide will fail in the built CLI.`)
}

// Same story for the default token palette — copy it next to the
// bundle so `bf tokens` can read it in scaffolded apps.
if (existsSync(tokensSrc)) {
  copyFileSync(tokensSrc, tokensDst)
  console.log(`Copied: ${tokensSrc} -> ${tokensDst}`)
} else {
  console.warn(`Warning: ${tokensSrc} not found; bf tokens will fail in the built CLI.`)
}

// Default preview styling (globals.css + UnoCSS config).
for (const [src, dst, label] of [
  [previewGlobalsSrc, previewGlobalsDst, 'preview globals.css'],
  [previewUnoSrc, previewUnoDst, 'preview uno.config.ts'],
]) {
  if (existsSync(src)) {
    copyFileSync(src, dst)
    console.log(`Copied: ${src} -> ${dst}`)
  } else {
    console.warn(`Warning: ${src} not found; bf preview defaults (${label}) will be unavailable.`)
  }
}

console.log(`Built: ${outfile}`)
