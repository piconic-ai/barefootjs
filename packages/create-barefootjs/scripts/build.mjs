#!/usr/bin/env node
// Bundle create-barefootjs into a single file for npm distribution.
//
// - Entry: src/index.ts
// - Output: dist/index.js (ESM, single file with shebang)
// - All deps are bundle-internal except @barefootjs/cli, which is left
//   external so `require.resolve('@barefootjs/cli/dist/index.js')` at
//   runtime hits the consumer's installed CLI bin.

import { build } from 'esbuild'
import { chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')
const entry = resolve(pkgDir, 'src/index.ts')
const outfile = resolve(pkgDir, 'dist/index.js')

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@barefootjs/cli'],
  legalComments: 'none',
  logLevel: 'info',
})

chmodSync(outfile, 0o755)
console.log(`Built: ${outfile}`)
