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
import { chmodSync, cpSync, existsSync, rmSync } from 'node:fs'
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
// scaffolded apps. We don't gate on file extension — `scanCoreDocs`
// already filters to .md.
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

console.log(`Built: ${outfile}`)
