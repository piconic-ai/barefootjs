// Guards the packaging invariant behind the fix in
// https://github.com/piconic-ai/barefootjs (Vite migration entry
// packaging): Vite's own config loader externalizes bare imports like
// `@barefootjs/hono/vite`, so Node — NOT bun — is the one that resolves
// and loads them. Node has no built-in TypeScript support unless the
// running version happens to have type-stripping on by default (22.18+):
// pointing a `./vite` export (or `@barefootjs/vite`'s own `.` export) at
// `.ts` source works only by accident of the dev container's Node
// version, and breaks with
// `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"`
// on any older Node.
//
// This test reads every workspace package's manifest and asserts that
// none of these Node-loaded entry points resolve to a `.ts` file — a
// tenth adapter (or a new @barefootjs/vite export) that copies the
// `.ts`-pointing shape must fail loudly here rather than silently
// depending on a new-enough Node.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'

const REPO_ROOT = resolve(import.meta.dir, '..')
const PACKAGES_DIR = resolve(REPO_ROOT, 'packages')

interface ExportTarget {
  types?: string
  import?: string
  bun?: string
}

interface PackageManifest {
  name: string
  exports?: Record<string, ExportTarget | string>
  publishConfig?: { exports?: Record<string, ExportTarget | string> }
}

function loadManifest(dir: string): PackageManifest | null {
  const pkgPath = resolve(dir, 'package.json')
  try {
    if (!statSync(pkgPath).isFile()) return null
  } catch {
    return null
  }
  return JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageManifest
}

/** Every workspace package directory under `packages/` that has a
 * `package.json` — mirrors the `packages/*` workspace glob in the root
 * manifest. */
const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => resolve(PACKAGES_DIR, entry.name))

/** Node-loaded export keys, per package name: the `./vite` subpath every
 * adapter ships (loaded by Vite's own Node-based config loader when a
 * downstream app's `vite.config.ts` imports `<adapter>/vite`), plus
 * `@barefootjs/vite`'s own `.` entry (loaded directly by `vite.config.ts`
 * files that use core `barefoot()`, and transitively by every adapter's
 * `./vite`). A tenth adapter's `./vite` export is covered automatically —
 * this list only needs the one special case (core's `.`).
 */
function nodeLoadedKeysFor(pkgName: string): string[] {
  const keys = ['./vite']
  if (pkgName === '@barefootjs/vite') keys.push('.')
  return keys
}

function targetsToCheck(target: ExportTarget | string | undefined): string[] {
  if (!target) return []
  if (typeof target === 'string') return [target]
  return [target.types, target.import].filter((v): v is string => typeof v === 'string')
}

/** True for raw TypeScript SOURCE Node's ESM loader would choke on
 * (`ERR_UNKNOWN_FILE_EXTENSION`) — but not for a `.d.ts` DECLARATION file,
 * which is never executed and is exactly what a `types` field should
 * point at once an entry is built. */
function isRawTsSource(path: string): boolean {
  return path.endsWith('.ts') && !path.endsWith('.d.ts')
}

describe('Node-loaded package exports never point at .ts source', () => {
  const manifests = packageDirs
    .map(dir => ({ dir, manifest: loadManifest(dir) }))
    .filter((entry): entry is { dir: string; manifest: PackageManifest } => entry.manifest !== null)

  // Sanity check on the test itself: fail loudly if the workspace scan
  // came up empty (a broken path would otherwise make every case below
  // vacuously pass).
  test('found workspace packages to check', () => {
    expect(manifests.length).toBeGreaterThan(0)
  })

  for (const { dir, manifest } of manifests) {
    for (const key of nodeLoadedKeysFor(manifest.name)) {
      const topLevel = manifest.exports?.[key]
      const published = manifest.publishConfig?.exports?.[key]
      if (topLevel === undefined && published === undefined) continue

      test(`${manifest.name}${key === '.' ? '' : key} does not resolve to .ts source`, () => {
        // The workspace (dev/bun) resolution — this is the one Vite's
        // Node config loader actually walks when a sibling package's
        // `vite.config.ts` imports this specifier, so it is the entry
        // that must never point at `.ts`.
        for (const path of targetsToCheck(topLevel)) {
          expect(isRawTsSource(path)).toBe(false)
        }
        // The published-tarball resolution (after swap-publish-config.mjs
        // merges `publishConfig` in at pack time) — checked too so a
        // future edit can't silently regress just the published shape
        // while leaving the workspace shape fixed.
        for (const path of targetsToCheck(published)) {
          expect(isRawTsSource(path)).toBe(false)
        }
        // `dir` is asserted on implicitly above (loadManifest read from
        // it) — kept in scope for a clearer failure message via `test`'s
        // own title rather than repeated here.
        void dir
      })
    }
  }
})
