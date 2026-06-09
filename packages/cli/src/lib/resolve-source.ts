// Resolve a component name or file path to a source file + optional component name.
//
// Resolution order:
// 1. Direct file path (absolute or relative)
// 2. ui/components/ui/<name>/index.tsx (monorepo layout)
// 3. project-config `paths.components` (where `bf add` lands registry items)
// 4. `barefoot.config.ts`'s `components` source dirs (where the user
//    keeps their own app components — e.g. the scaffold's
//    `components/Counter.tsx`)
// 5. Current working directory (PascalCase fallback)

import { existsSync, readdirSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'

export interface ResolvedSource {
  filePath: string
  componentName?: string
  /**
   * True when the only entry on disk was `index.preview.tsx` (no `index.tsx`) —
   * a preview-only component dir like `settings-form` (#1849 B5). Callers should
   * note that they resolved a preview rather than a real component entry.
   */
  isPreview?: boolean
}

/**
 * Try a single candidate path and return it (resolved) if the file exists.
 * Always appends to `searched` so callers can build a transcript for error messages.
 */
function tryCandidate(candidate: string, searched: string[]): string | null {
  searched.push(candidate)
  return existsSync(candidate) ? candidate : null
}

/**
 * Find a directory entry whose basename matches `target` case-insensitively
 * but with no exact-case match. Returns the actual on-disk name (preserving
 * the directory's casing) so the caller can rebuild a correct path.
 *
 * Returns `null` when:
 *   - the directory doesn't exist or can't be read
 *   - no case-insensitive match exists
 *   - an exact-case match already does (the regular `tryCandidate` path
 *     would have caught it — don't double-resolve)
 *   - **multiple case-insensitive matches exist** (case-sensitive
 *     filesystems can legally hold both `Counter.tsx` and `counter.tsx`).
 *     Returning a single result there would be nondeterministic
 *     (depends on `readdirSync` ordering); the caller falls through to
 *     the "not found" error transcript so the user sees the conflict
 *     before any tooling commits to one half of it.
 */
function caseInsensitiveMatch(dir: string, target: string): string | null {
  if (!existsSync(dir)) return null
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return null
  }
  const lower = target.toLowerCase()
  // Exact-case hit means a previous tryCandidate already returned it — skip.
  if (entries.includes(target)) return null
  const matches: string[] = []
  for (const entry of entries) {
    if (entry.toLowerCase() === lower) matches.push(entry)
  }
  // 0 → no fallback to surface; 1 → unambiguous match; 2+ → ambiguous,
  // fail closed so the user resolves the conflict before we pick a side.
  return matches.length === 1 ? matches[0] : null
}

export function resolveComponentSource(
  nameOrPath: string,
  ctx: CliContext,
  searched: string[] = [],
): ResolvedSource | null {
  // 1. Direct file path
  if (nameOrPath.endsWith('.tsx') || nameOrPath.endsWith('.ts')) {
    const abs = path.isAbsolute(nameOrPath) ? nameOrPath : path.resolve(nameOrPath)
    const hit = tryCandidate(abs, searched)
    if (hit) return { filePath: hit }
  }

  // 2. ui/components/ui/<name>/index.tsx (monorepo). Skip the candidate
  //    entirely when the monorepo root isn't present — in a scaffolded
  //    app `ctx.root` resolves to `node_modules/`, and listing
  //    `node_modules/ui/components/ui/...` in error transcripts is
  //    noise that confuses users about where their components are.
  if (existsSync(path.join(ctx.root, 'ui/components/ui'))) {
    const monoHit = tryCandidate(
      path.join(ctx.root, 'ui/components/ui', nameOrPath, 'index.tsx'),
      searched,
    )
    if (monoHit) return { filePath: monoHit }

    // Preview-only entry: the dir exists with `index.preview.tsx` but no
    // `index.tsx` (e.g. `settings-form`). Fall back to the preview so the
    // command works instead of erroring with "Cannot find component" (#1849 B5);
    // `isPreview` lets the caller note it resolved a preview, not a real entry.
    const monoPreview = tryCandidate(
      path.join(ctx.root, 'ui/components/ui', nameOrPath, 'index.preview.tsx'),
      searched,
    )
    if (monoPreview) return { filePath: monoPreview, isPreview: true }
  }

  // 3. paths.components from barefoot.config.ts (registry-item layout)
  if (ctx.config && ctx.projectDir) {
    const configIndex = tryCandidate(
      path.join(ctx.projectDir, ctx.config.paths.components, nameOrPath, 'index.tsx'),
      searched,
    )
    if (configIndex) return { filePath: configIndex }

    const configFlat = tryCandidate(
      path.join(ctx.projectDir, ctx.config.paths.components, `${nameOrPath}.tsx`),
      searched,
    )
    if (configFlat) return { filePath: configFlat }

    // 4. Source dirs from barefoot.config.ts's `components` array. The
    //    scaffold puts user-authored components (Counter.tsx) here, not
    //    under `paths.components`. Try both flat (Counter.tsx) and
    //    nested (Counter/index.tsx) layouts.
    for (const dir of ctx.config.sourceDirs ?? []) {
      const flat = tryCandidate(
        path.join(ctx.projectDir, dir, `${nameOrPath}.tsx`),
        searched,
      )
      if (flat) return { filePath: flat }
      const nested = tryCandidate(
        path.join(ctx.projectDir, dir, nameOrPath, 'index.tsx'),
        searched,
      )
      if (nested) return { filePath: nested }
    }
  }

  // 5. PascalCase component name in the current working directory
  const cwdHit = tryCandidate(path.resolve(`${nameOrPath}.tsx`), searched)
  if (cwdHit) return { filePath: cwdHit }

  // 6. Case-insensitive fallback. Users naturally type `bf docs counter`
  //    when the file on disk is `Counter.tsx`; rather than punish that
  //    with a "not found" error, re-run resolution under the canonical
  //    on-disk casing. Only fires after every case-sensitive attempt
  //    misses, so existing exact-case behavior is unchanged.
  if (ctx.config && ctx.projectDir) {
    const dirs: string[] = [
      path.join(ctx.projectDir, ctx.config.paths.components),
      ...((ctx.config.sourceDirs ?? []).map((d) => path.join(ctx.projectDir!, d))),
    ]
    for (const dir of dirs) {
      // <Name>.tsx (flat layout)
      const flatMatch = caseInsensitiveMatch(dir, `${nameOrPath}.tsx`)
      if (flatMatch) {
        return { filePath: path.join(dir, flatMatch) }
      }
      // <Name>/index.tsx (nested layout)
      const dirMatch = caseInsensitiveMatch(dir, nameOrPath)
      if (dirMatch) {
        const indexFile = path.join(dir, dirMatch, 'index.tsx')
        if (existsSync(indexFile)) return { filePath: indexFile }
      }
    }
  }

  return null
}
