// The one answer to "which workspace packages does a release publish, and in
// what order?" — derived from the checkout, never hand-listed.
//
//   scripts/lib/npm-packages.ts   every package below goes to npm
//   scripts/lib/jsr-packages.ts   the scoped-library subset goes to JSR
//   scripts/release-preflight.ts  every package below must already exist on
//                                 its registries before anything is published
//
// A hand-maintained publish list was the previous design, and a new adapter
// had to remember to insert itself (the add-adapter checklist carried the
// reminder). Deriving it means a package that Changesets versions is a
// package the release publishes — the same rule changeset-check.yml and
// verify-released.ts already apply: under packages/, not `private`, not in
// `.changeset/config.json`'s ignore list.

import { resolve, join } from 'node:path'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

export interface PkgJson {
  name: string
  version: string
  private?: boolean
  exports?: Record<string, unknown>
  bin?: unknown
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export interface WorkspacePackage {
  /** Absolute package directory. */
  dir: string
  /** Repo-relative directory, e.g. `packages/adapter-pebble`. */
  rel: string
  pkg: PkgJson
}

/**
 * Every `packages/*` directory with a package.json, in sorted directory
 * order. `readdirSync` order is filesystem-dependent — observed differing
 * across CI runners and checkouts — and it used to decide publish order via
 * topoSort's tie-breaking, so which packages a stalled run stranded varied
 * run to run. Sort for a deterministic traversal.
 */
export function workspacePackages(repoRoot: string): WorkspacePackage[] {
  return readdirSync(resolve(repoRoot, 'packages'))
    .sort()
    .map(d => ({ dir: resolve(repoRoot, 'packages', d), rel: `packages/${d}` }))
    .filter(({ dir }) => existsSync(join(dir, 'package.json')))
    .map(({ dir, rel }) => ({
      dir,
      rel,
      pkg: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PkgJson,
    }))
}

/** Names Changesets is told to ignore (`.changeset/config.json`). */
export function changesetIgnoreList(repoRoot: string): string[] {
  return JSON.parse(readFileSync(resolve(repoRoot, '.changeset/config.json'), 'utf8')).ignore ?? []
}

/**
 * Topological order, dependencies before dependents, over `dependencies` +
 * `peerDependencies` edges between workspace packages. Cycles are tolerated
 * (client ↔ jsx are mutual peers): a DFS with a visited set emits each
 * package once, and a cycle member simply comes out wherever the walk first
 * completes it. Ties keep the input order.
 */
export function topoSort<T extends { pkg: PkgJson }>(items: T[]): T[] {
  const byName = new Map(items.map(c => [c.pkg.name, c]))
  const sorted: T[] = []
  const seen = new Set<string>()
  const visit = (c: T) => {
    if (seen.has(c.pkg.name)) return
    seen.add(c.pkg.name)
    const deps = { ...(c.pkg.dependencies ?? {}), ...(c.pkg.peerDependencies ?? {}) }
    for (const dep of Object.keys(deps)) {
      const depItem = byName.get(dep)
      if (depItem) visit(depItem)
    }
    sorted.push(c)
  }
  for (const c of items) visit(c)
  return sorted
}

/**
 * The packages a release publishes: not `private`, not ignored by
 * Changesets, dependencies before dependents.
 */
export function publishablePackages(repoRoot: string): WorkspacePackage[] {
  const ignore = changesetIgnoreList(repoRoot)
  return topoSort(
    workspacePackages(repoRoot).filter(({ pkg }) => !pkg.private && !ignore.includes(pkg.name)),
  )
}
