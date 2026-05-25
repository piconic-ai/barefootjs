#!/usr/bin/env node
//
// Prepack / postpack helper for workspace packages.
//
// Two responsibilities:
//
// 1. Merge `publishConfig` overrides into the top-level manifest so that
//    `exports` can point to src/ in-tree (bun dev) and dist/ when shipped.
//
// 2. Resolve `workspace:*` / `workspace:^` / `workspace:~` references in
//    dependencies, peerDependencies, and optionalDependencies to concrete
//    version ranges. npm does not understand the workspace: protocol and
//    publishes the raw string, causing EUNSUPPORTEDPROTOCOL on install.
//
// Usage (wired through package.json scripts):
//   "scripts": {
//     "prepack":  "node ../../scripts/swap-publish-config.mjs pack",
//     "postpack": "node ../../scripts/swap-publish-config.mjs unpack"
//   }
//
// `pack` snapshots package.json to package.json.publish-bak, merges
// publishConfig, and resolves workspace: deps. `unpack` restores from
// the backup unconditionally.

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { argv, cwd, exit } from 'node:process'

const PKG_PATH = resolve(cwd(), 'package.json')
const BAK_PATH = `${PKG_PATH}.publish-bak`

function usage() {
  console.error('Usage: swap-publish-config.mjs <pack|unpack>')
  exit(2)
}

function findRepoRoot(from) {
  let dir = from
  while (dir !== resolve(dir, '..')) {
    const rootPkg = resolve(dir, 'package.json')
    if (existsSync(rootPkg)) {
      const p = JSON.parse(readFileSync(rootPkg, 'utf-8'))
      if (p.workspaces) return dir
    }
    dir = resolve(dir, '..')
  }
  return null
}

function resolveWorkspaceVersion(depName, repoRoot) {
  const shortName = depName.replace(/^@[^/]+\//, '')
  const searchDirs = ['packages', 'integrations', 'ui', 'site']
  for (const dir of searchDirs) {
    const candidate = resolve(repoRoot, dir, shortName, 'package.json')
    if (existsSync(candidate)) {
      const p = JSON.parse(readFileSync(candidate, 'utf-8'))
      if (p.name === depName) return p.version
    }
  }
  const packagesDir = resolve(repoRoot, 'packages')
  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const candidate = resolve(packagesDir, entry.name, 'package.json')
      if (existsSync(candidate)) {
        const p = JSON.parse(readFileSync(candidate, 'utf-8'))
        if (p.name === depName) return p.version
      }
    }
  }
  return null
}

function resolveWorkspaceDeps(pkg, repoRoot) {
  const sections = ['dependencies', 'peerDependencies', 'optionalDependencies']
  let changed = false
  for (const section of sections) {
    if (!pkg[section]) continue
    for (const [name, spec] of Object.entries(pkg[section])) {
      if (typeof spec !== 'string' || !spec.startsWith('workspace:')) continue
      const version = resolveWorkspaceVersion(name, repoRoot)
      if (!version) {
        console.error(
          `[swap-publish-config] cannot resolve workspace version for ${name}`,
        )
        exit(1)
      }
      const qualifier = spec.slice('workspace:'.length)
      if (qualifier === '*') {
        pkg[section][name] = version
      } else if (qualifier === '^' || qualifier === '~') {
        pkg[section][name] = `${qualifier}${version}`
      } else {
        pkg[section][name] = version
      }
      changed = true
    }
  }
  return changed
}

const mode = argv[2]
if (mode !== 'pack' && mode !== 'unpack') usage()

if (mode === 'pack') {
  if (existsSync(BAK_PATH)) {
    console.error(
      `[swap-publish-config] ${BAK_PATH} already exists. ` +
      `A previous pack didn't complete; restore it manually before retrying.`,
    )
    exit(1)
  }
  const raw = readFileSync(PKG_PATH, 'utf-8')
  const pkg = JSON.parse(raw)

  const repoRoot = findRepoRoot(resolve(cwd(), '..'))
  const hasPublishConfig = !!pkg.publishConfig
  const hasWorkspaceDeps = repoRoot && resolveWorkspaceDeps(pkg, repoRoot)

  if (!hasPublishConfig && !hasWorkspaceDeps) {
    writeFileSync(BAK_PATH, raw)
    exit(0)
  }

  const merged = { ...pkg }
  if (hasPublishConfig) {
    for (const [k, v] of Object.entries(pkg.publishConfig)) {
      merged[k] = v
    }
    delete merged.publishConfig
    delete merged['//publishConfig']
  }

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
