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

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Keep runtime deps external so they are resolved from node_modules, not inlined.
  external: ['typescript', 'esbuild'],
  // Source index.ts carries the shebang; esbuild preserves it. No banner needed.
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

console.log(`Built: ${outfile}`)
