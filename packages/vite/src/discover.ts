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
import { scanComponentFile } from '@barefootjs/jsx'

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
  /**
   * The file's full source text, as read by the discovery pass. Retained
   * (discovery had to read it anyway for the directive/exports checks) so
   * downstream consumers — the corpus-program seeding and the eager pass's
   * compile loop — work from the SAME snapshot discovery classified,
   * instead of re-reading and racing an edit that landed in between.
   */
  content: string
  /** Whether the file's content starts with a `'use client'` directive. */
  isClient: boolean
  /**
   * `isClient`, OR this file transitively instantiates a component that
   * needs one — the property `computeClientEntryPaths` computes over the
   * whole discovered corpus. This, not `isClient`, is the signal for
   * "does this file need its own client bundle and a `<script>` on the
   * page": a plain server component that merely renders a `'use client'`
   * descendant still needs an `initChild(...)` call to run in the
   * browser, and that call lives in ITS OWN compiled init, not the
   * child's (issue #2767 — `hydrateElementScope` in
   * `@barefootjs/client`'s `runtime/hydrate.ts` explicitly skips any
   * element carrying the child marker, deferring to the parent's
   * `initChild`; if the parent's own bundle never ships, that call never
   * happens and the child never hydrates, silently).
   */
  needsClientEntry: boolean
  /**
   * Every component this file exports, from `@barefootjs/jsx`'s TS-AST
   * walk (`listExportedComponents`) — never a regex, and never the
   * basename standing in for the name. A file exporting more than one
   * component (`icon/index.tsx` → `CopyIcon` + `CheckIcon`) is why this
   * exists; see `buildChildNameIndex`. Populated for EVERY file, not just
   * client ones — `computeClientEntryPaths` resolves JSX tag references
   * by name across the whole corpus, so a server file must be indexable
   * too (it may itself be someone else's `referencedComponents` target).
   */
  exportedComponents: string[]
  /**
   * PascalCase JSX tag identifiers this file's JSX instantiates (its
   * component-instantiation out-edges), from `@barefootjs/jsx`'s
   * `scanComponentFile`. Feeds `computeClientEntryPaths` — never used for
   * anything import-resolution-shaped, so an unresolved or aliased tag
   * name is simply not an edge (see that function's docstring).
   */
  referencedComponents: string[]
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
  const out: Omit<DiscoveredComponent, 'needsClientEntry'>[] = []
  for (const raw of entries) {
    const entry: ResolvedComponentDirEntry = typeof raw === 'string' ? { dir: raw } : raw
    for (const absPath of await discoverComponentFiles(entry.dir, { skipDirs: entry.skipDirs })) {
      if (seen.has(absPath)) continue
      seen.add(absPath)
      const content = await readFile(absPath)
      const isClient = hasUseClientDirective(content)
      // One parse gets both the export list AND the JSX tags this file
      // references — every file needs both now, not just client ones:
      // `computeClientEntryPaths` walks the instantiation graph across
      // the whole corpus, so a server file must carry its out-edges (and
      // be indexable by name) too.
      const scan = scanComponentFile(content, absPath)
      out.push({
        absPath,
        content,
        isClient,
        exportedComponents: scan.exports,
        referencedComponents: scan.referencedComponents,
        cssLayerPrefix: entry.cssLayerPrefix,
      })
    }
  }
  const clientEntryPaths = computeClientEntryPaths(out)
  return out.map(row => ({ ...row, needsClientEntry: clientEntryPaths.has(row.absPath) }))
}

/**
 * The component-name → absolute-path index shared by `computeClientEntryPaths`
 * (resolving JSX-tag out-edges to the file that exports them) and
 * `buildChildNameIndex` (resolving `@bf-child:<Name>` markers) — both need
 * the identical "exported names, falling back to the basename when the AST
 * walk found none; first writer wins on a duplicate name" rule, so it lives
 * in exactly one place. `include` lets each caller restrict which rows are
 * indexable: `computeClientEntryPaths` indexes every row (a server file can
 * be another file's out-edge target), `buildChildNameIndex` only rows that
 * ended up needing a client entry (a marker can only ever resolve to a file
 * that actually ships a bundle).
 */
function nameIndexOver<T extends Pick<DiscoveredComponent, 'absPath' | 'exportedComponents'>>(
  rows: readonly T[],
  include: (row: T) => boolean,
): Map<string, string> {
  const index = new Map<string, string>()
  for (const c of rows) {
    if (!include(c)) continue
    const names = c.exportedComponents.length > 0
      ? c.exportedComponents
      : [basename(c.absPath).replace(/\.tsx?$/, '')]
    for (const name of names) {
      if (!index.has(name)) index.set(name, c.absPath)
    }
  }
  return index
}

/**
 * Which discovered files need their OWN client bundle and `<script>` tag on
 * the page: every `'use client'` file (the seed set), plus every file that
 * transitively instantiates one — a plain server component nested between
 * the SSR root and a `'use client'` descendant still needs its own compiled
 * `init` to run in the browser, because that's the ONLY place the
 * `initChild(...)` call reaching the client descendant is emitted (issue
 * #2767; see `DiscoveredComponent.needsClientEntry`'s docstring). A nested
 * component can't self-hydrate to make up for a missing parent bundle: its
 * SSR root carries the child marker (`bf-h`), which `hydrateElementScope`
 * (`@barefootjs/client`'s `runtime/hydrate.ts`) unconditionally skips,
 * deferring to a parent's `initChild` call that only exists if the parent's
 * own bundle shipped.
 *
 * Deliberately NOT `analyzeClientNeeds(ir).needsInit` (the compiler's
 * per-file "does this file's compiled init do anything nontrivial" signal)
 * — that's true for almost any server component with dynamic content at
 * all (a prop interpolation, a conditional, a `.map()`, a plain
 * `onClick`...), not just ones that own a client descendant. Gating Vite
 * entries on it would bundle huge swaths of purely-server trees that have
 * nothing to hydrate. The property this function computes — "is there a
 * `'use client'` file reachable via component-instantiation edges" — is
 * inherently cross-file, so it can only be answered here, with the whole
 * discovered corpus in hand, not by any single-file compiler analysis.
 *
 * Pure structural closure over JSX tag references — no compile. Resolves
 * each file's `referencedComponents` (JSX tag names) to the file that
 * exports that name via the shared `nameIndexOver` index, then walks the
 * REVERSE edges breadth-first from the `isClient` seed set. Cycle-safe (a
 * visited-set) and runs in O(files + edges); on this repo's real
 * `ui`/`site` component corpus (~260 files) the whole discovery pass
 * (parse + this closure) costs low-single-digit milliseconds.
 *
 * The closure only ever needs to walk upward from a `'use client'` seed:
 * a client file cannot legally import a server component in the first
 * place (`analyzer.ts`'s `validateClientImports` raises BF003, a hard
 * compile error), so there is no "server child of a client parent needing
 * its own entry" shape to account for.
 */
export function computeClientEntryPaths(
  rows: readonly Pick<DiscoveredComponent, 'absPath' | 'isClient' | 'exportedComponents' | 'referencedComponents'>[],
): Set<string> {
  const nameToPath = nameIndexOver(rows, () => true)

  // Reverse edges: referencers.get(g) = every file that references a name
  // resolving to g.
  const referencers = new Map<string, Set<string>>()
  for (const row of rows) {
    for (const name of row.referencedComponents) {
      const target = nameToPath.get(name)
      if (!target || target === row.absPath) continue
      let set = referencers.get(target)
      if (!set) {
        set = new Set()
        referencers.set(target, set)
      }
      set.add(row.absPath)
    }
  }

  const visited = new Set<string>()
  const queue: string[] = []
  for (const row of rows) {
    if (row.isClient && !visited.has(row.absPath)) {
      visited.add(row.absPath)
      queue.push(row.absPath)
    }
  }
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const referencer of referencers.get(current) ?? []) {
      if (visited.has(referencer)) continue
      visited.add(referencer)
      queue.push(referencer)
    }
  }
  return visited
}

/**
 * Component-name → absolute-path index used to resolve `@bf-child:<Name>`
 * markers (see `child-marker.ts`) to a real file: a bare-marker child
 * reference embeds only the referenced component's NAME (the compiler has
 * no filesystem access at that phase — see `child-components.ts`), so
 * `resolveId` needs a name→file lookup built from a full discovery pass.
 *
 * Keyed by each exported component NAME, which is what the marker
 * carries. Files that don't need their own client entry are excluded: a
 * `@bf-child:` marker only ever names another component this one
 * instantiates at runtime (`initChild`/`createComponent`), which requires
 * a REAL `init` — and a file with `needsClientEntry: false` compiles to a
 * no-op template-only mount (`generateTemplateOnlyMount` in
 * `@barefootjs/jsx`'s `ir-to-client-js`), nothing to jump to. This is
 * `needsClientEntry`, not `isClient` — a plain server file that owns a
 * `'use client'` descendant is a legitimate marker target too (issue
 * #2767: it's the file whose compiled init actually contains the
 * `initChild(...)` call reaching that descendant).
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
export function buildChildNameIndex(
  // Only the fields the index actually reads — callers with a full
  // `DiscoveredComponent[]` pass it as-is, and tests can construct rows
  // without dragging in `content`.
  discovered: readonly Pick<DiscoveredComponent, 'absPath' | 'needsClientEntry' | 'exportedComponents'>[],
): Map<string, string> {
  return nameIndexOver(discovered, c => c.needsClientEntry)
}
