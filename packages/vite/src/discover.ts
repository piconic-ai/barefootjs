/**
 * Component discovery: which `.tsx` files live under the configured
 * `components` dirs, and which of those carry a `'use client'` directive.
 *
 * `hasUseClientDirective` and `discoverComponentFiles` are implemented
 * standalone rather than imported from `@barefootjs/cli` — that package's
 * `exports` map only publishes the `bf` binary entry point, not an
 * internal module path, and pulling in the CLI's whole dependency graph
 * for two small pure functions would be the wrong shape for a Vite
 * plugin. See CLAUDE.md: "reuse or port it, don't reinvent."
 */
import { readdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { listExportedComponents } from '@barefootjs/jsx'

/** Does `content` start with a `'use client'` / `"use client"` directive
 * (after skipping leading block/line comments)? */
export function hasUseClientDirective(content: string): boolean {
  let trimmed = content.trimStart()
  // Skip block comments
  while (trimmed.startsWith('/*')) {
    const endIndex = trimmed.indexOf('*/')
    if (endIndex === -1) break
    trimmed = trimmed.slice(endIndex + 2).trimStart()
  }
  // Skip line comments
  while (trimmed.startsWith('//')) {
    const endIndex = trimmed.indexOf('\n')
    if (endIndex === -1) break
    trimmed = trimmed.slice(endIndex + 1).trimStart()
  }
  return trimmed.startsWith('"use client"') || trimmed.startsWith("'use client'")
}

/**
 * Is `name` (a bare filename, not a path) a component source file this
 * plugin should discover/compile? `.tsx`, excluding `.test.tsx`,
 * `.spec.tsx`, and `.preview.tsx`. Exported separately from
 * `discoverComponentFiles` so the dev-server file watcher (`plugin.ts`'s
 * `configureServer`) can apply the exact same filter to a single changed
 * path without re-walking a directory.
 */
export function isComponentSourceFile(name: string): boolean {
  return (
    name.endsWith('.tsx') &&
    !name.endsWith('.test.tsx') &&
    !name.endsWith('.spec.tsx') &&
    !name.endsWith('.preview.tsx')
  )
}

/**
 * Recursively discover `.tsx` component files in a directory.
 * Skips `.test.tsx`, `.spec.tsx`, and `.preview.tsx` files.
 */
export async function discoverComponentFiles(
  dir: string,
  options?: { skipDirs?: string[] }
): Promise<string[]> {
  const results: string[] = []
  const skipDirs = options?.skipDirs ? new Set(options.skipDirs) : null

  let entries: { name: string; isDirectory(): boolean }[]
  try {
    entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    )
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = resolve(dir, String(entry.name))
    if (entry.isDirectory()) {
      if (skipDirs?.has(String(entry.name))) continue
      results.push(...await discoverComponentFiles(fullPath, options))
    } else if (isComponentSourceFile(String(entry.name))) {
      results.push(fullPath)
    }
  }

  return results
}

export interface DiscoveredComponent {
  /** Absolute path to the `.tsx` source file. */
  absPath: string
  /** Whether the file's content starts with a `'use client'` directive. */
  isClient: boolean
  /**
   * Every component this file exports, from `@barefootjs/jsx`'s TS-AST
   * walk (`listExportedComponents`) — never a regex, and never the
   * basename standing in for the name. A file exporting more than one
   * component (`icon/index.tsx` → `CopyIcon` + `CheckIcon`) is why this
   * exists; see `buildChildNameIndex`.
   */
  exportedComponents: string[]
  /**
   * `CompileOptions.cssLayerPrefix` this file should compile with, carried
   * over unchanged from whichever `components` entry's `dir` this file was
   * discovered under (see `ResolvedComponentDirEntry.cssLayerPrefix`).
   * `undefined` when that entry set none (or was a plain string entry).
   */
  cssLayerPrefix?: string
}

/**
 * A `components` directory to scan, already resolved to an absolute `dir`,
 * plus the per-directory compile behavior `barefoot()`'s `ComponentDirEntry`
 * (`types.ts`) carries. `discoverComponents` also accepts a plain absolute
 * path string as shorthand for `{ dir: string }` — the same "string is
 * exactly equivalent to `{ dir }`" equivalence `ComponentDirEntry` itself
 * documents — so existing callers that only ever had bare directories
 * (`integrations/h3`/`elysia`'s `vite.config.ts`, reusing this exported
 * function to resolve every discovered client component's URL) keep
 * compiling and behaving unchanged.
 */
export interface ResolvedComponentDirEntry {
  /** Absolute path to the source directory to scan. */
  dir: string
  /** Stamped onto every `DiscoveredComponent` found under `dir` — see
   * `DiscoveredComponent.cssLayerPrefix`. */
  cssLayerPrefix?: string
  /** Directory NAMES to skip anywhere under `dir` — passed straight
   * through to `discoverComponentFiles`. */
  skipDirs?: string[]
}

/**
 * Scan every configured `components` directory for `.tsx` files and
 * classify each as client (`'use client'`) or server-only. Each entry may
 * be a plain absolute path (shorthand for `{ dir }`, no `cssLayerPrefix`/
 * `skipDirs`) or a `ResolvedComponentDirEntry`.
 *
 * A file reachable under more than one entry is discovered once, stamped
 * with the FIRST matching entry's `cssLayerPrefix` — entries are walked in
 * array order and `seen` short-circuits every later match, the same
 * first-writer-wins precedence `buildChildNameIndex` already documents for
 * `@bf-child:` name collisions.
 */
export async function discoverComponents(
  entries: readonly (string | ResolvedComponentDirEntry)[],
  readFile: (absPath: string) => Promise<string>,
): Promise<DiscoveredComponent[]> {
  const seen = new Set<string>()
  const out: DiscoveredComponent[] = []
  for (const raw of entries) {
    const entry: ResolvedComponentDirEntry = typeof raw === 'string' ? { dir: raw } : raw
    for (const absPath of await discoverComponentFiles(entry.dir, { skipDirs: entry.skipDirs })) {
      if (seen.has(absPath)) continue
      seen.add(absPath)
      const content = await readFile(absPath)
      const isClient = hasUseClientDirective(content)
      // Only client files can be `@bf-child:` targets, so only they need
      // their export list parsed — this is a `ts.createSourceFile` per
      // file and server-only components are the majority in most trees.
      out.push({
        absPath,
        isClient,
        exportedComponents: isClient ? listExportedComponents(content, absPath) : [],
        cssLayerPrefix: entry.cssLayerPrefix,
      })
    }
  }
  return out
}

/**
 * Component-name → absolute-path index used to resolve `@bf-child:<Name>`
 * markers (see `child-marker.ts`) to a real file: a bare-marker child
 * reference embeds only the referenced component's NAME (the compiler has
 * no filesystem access at that phase — see `child-components.ts`), so
 * `resolveId` needs a name→file lookup built from a full discovery pass.
 *
 * Keyed by each exported component NAME, which is what the marker
 * carries. Server-only files are excluded: a `@bf-child:` marker only
 * ever names another component this one instantiates at runtime
 * (`initChild`/`createComponent`), which requires an `init` function only
 * a `'use client'` file has.
 *
 * This used to key on the file's basename, which worked only because the
 * one-component-per-file convention makes the two coincide
 * (`TodoItem.tsx` exports `TodoItem`). A file exporting several
 * components broke it silently: `icon/index.tsx` was keyed `index`, so
 * `@bf-child:CopyIcon` found nothing and fell through to the no-op module
 * (`plugin.ts`'s `resolveId`) — a child that never hydrates, with no
 * diagnostic.
 *
 * The blast radius was wider than multi-export files. Because the key was
 * the bare basename, EVERY colocated `index.tsx` collided on the single
 * key `"index"` — including single-export ones like `ui/button/index.tsx`
 * exporting `Button`. No colocated component was reachable as a
 * `@bf-child:` target at all, whatever its export count. Measured with
 * `listExportedComponents` over `ui/components` + `site/ui/components`:
 * 112 files export more than one component, 105 of them `'use client'`.
 *
 * First writer wins on a duplicate name, and discovery order is the
 * `components` option's order — so an earlier directory shadows a later
 * one, the same precedence the option list already implies.
 */
export function buildChildNameIndex(discovered: readonly DiscoveredComponent[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const c of discovered) {
    if (!c.isClient) continue
    // Fall back to the basename when the AST walk found no exports: a
    // file can still be a marker target through the old convention, and
    // losing that would be a regression rather than a fix.
    const names = c.exportedComponents.length > 0
      ? c.exportedComponents
      : [basename(c.absPath).replace(/\.tsx?$/, '')]
    for (const name of names) {
      if (!index.has(name)) index.set(name, c.absPath)
    }
  }
  return index
}
