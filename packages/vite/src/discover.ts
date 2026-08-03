/**
 * Component discovery: which `.tsx` files live under the configured
 * `components` dirs, and which of those carry a `'use client'` directive.
 *
 * `hasUseClientDirective` and `discoverComponentFiles` are ported verbatim
 * from `packages/cli/src/lib/build.ts` (same behavior, same test coverage
 * intent) rather than imported from `@barefootjs/cli` — that package's
 * `exports` map only publishes the `bf` binary entry point, not this
 * internal module path, and pulling in the CLI's esbuild-heavy dependency
 * graph for two small pure functions would be the wrong shape for a Vite
 * plugin. See CLAUDE.md: "reuse or port it, don't reinvent."
 */
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

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
}

/**
 * Scan every configured `components` directory (absolute paths) for `.tsx`
 * files and classify each as client (`'use client'`) or server-only.
 */
export async function discoverComponents(
  componentDirs: string[],
  readFile: (absPath: string) => Promise<string>,
): Promise<DiscoveredComponent[]> {
  const seen = new Set<string>()
  const out: DiscoveredComponent[] = []
  for (const dir of componentDirs) {
    for (const absPath of await discoverComponentFiles(dir)) {
      if (seen.has(absPath)) continue
      seen.add(absPath)
      const content = await readFile(absPath)
      out.push({ absPath, isClient: hasUseClientDirective(content) })
    }
  }
  return out
}
