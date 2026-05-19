#!/usr/bin/env node
//
// Merge / restore `publishConfig` overrides on package.json.
//
// Why this script exists:
// Several workspace packages (`@barefootjs/jsx`, `@barefootjs/hono`) ship
// their TS source via `exports` so the in-monorepo dev loop (bun test,
// `bf build`, etc.) reads source directly — no rebuild between edits.
// That works at runtime because bun + esbuild transpile on the fly, but
// breaks downstream `tsc --noEmit`: TypeScript walks into our raw .ts
// files in `node_modules`, sees `import fs from 'node:fs'`, and demands
// the consumer install `@types/node` + add `"node"` to tsconfig.types
// just to type-check the scaffold.
//
// The packages keep their src-pointed `exports` in-tree (so monorepo dev
// stays untouched) and a `publishConfig` block holds the dist-pointed
// `exports` for the published tarball. npm + bun only merge a small
// allow-list of `publishConfig` keys at pack time (registry, tag, etc.),
// so a manual swap is required.
//
// Usage (wired through package.json scripts):
//   "scripts": {
//     "prepack":  "node ../../scripts/swap-publish-config.mjs pack",
//     "postpack": "node ../../scripts/swap-publish-config.mjs unpack"
//   }
//
// `pack` snapshots package.json to package.json.publish-bak and merges
// every key from `publishConfig` into the top-level (overwriting). The
// `publishConfig` block + the sibling `//publishConfig` comment field
// are removed from the snapshot so consumers don't see them in the
// shipped manifest. `unpack` restores from the backup unconditionally.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { argv, cwd, exit } from 'node:process'

const PKG_PATH = resolve(cwd(), 'package.json')
const BAK_PATH = `${PKG_PATH}.publish-bak`

function usage() {
  console.error('Usage: swap-publish-config.mjs <pack|unpack>')
  exit(2)
}

const mode = argv[2]
if (mode !== 'pack' && mode !== 'unpack') usage()

if (mode === 'pack') {
  if (existsSync(BAK_PATH)) {
    // A previous pack didn't run postpack — refuse rather than
    // silently overwrite the backup and lose the original.
    console.error(
      `[swap-publish-config] ${BAK_PATH} already exists. ` +
      `A previous pack didn't complete; restore it manually before retrying.`,
    )
    exit(1)
  }
  const raw = readFileSync(PKG_PATH, 'utf-8')
  const pkg = JSON.parse(raw)
  if (!pkg.publishConfig) {
    // Nothing to swap. Still create the backup so `postpack` doesn't
    // need to special-case "no publishConfig" — it always restores.
    writeFileSync(BAK_PATH, raw)
    exit(0)
  }

  // Merge each publishConfig key into the top-level. Object values are
  // replaced wholesale rather than deep-merged so a package can swap
  // its full `exports` map without leaking the src-pointed entries.
  const merged = { ...pkg }
  for (const [k, v] of Object.entries(pkg.publishConfig)) {
    merged[k] = v
  }
  delete merged.publishConfig
  delete merged['//publishConfig']

  writeFileSync(BAK_PATH, raw)
  writeFileSync(PKG_PATH, JSON.stringify(merged, null, 2) + '\n')
  exit(0)
}

// unpack
if (!existsSync(BAK_PATH)) {
  // postpack runs even when prepack didn't (e.g. pack failed early).
  // Treat missing backup as a no-op — there's nothing to restore.
  exit(0)
}
renameSync(BAK_PATH, PKG_PATH)
