// Core build module: shared pipeline for `barefoot build`.

import { compileJSX, combineParentChildClientJs, createProgramForCorpus } from '@barefootjs/jsx'
import type { TemplateAdapter, OutputLayout, PostBuildContext, ExternalSpec, BundleEntry } from '@barefootjs/jsx'
import type ts from 'typescript'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { resolve, basename, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveRelativeImports } from './resolve-imports'
import {
  emptyCache,
  hashContent,
  isEntryFresh,
  loadCache,
  saveCache,
  type BuildCache,
  type CacheEntry,
} from './build-cache'
import { writeIfChanged } from './fs-utils'
import { fileExists, readBytes, readText, transpile } from './runtime'
import { build as esbuildBuild } from 'esbuild'

export { resolveRelativeImports } from './resolve-imports'

// ── Types ────────────────────────────────────────────────────────────────

export interface BuildConfig {
  /** Absolute path to the project directory (where barefoot.config.ts lives) */
  projectDir: string
  /** Adapter instance */
  adapter: TemplateAdapter
  /** Source component directories (absolute paths) */
  componentDirs: string[]
  /** Output directory (absolute path) */
  outDir: string
  /** Minify client JS */
  minify: boolean
  /** Add content hash to filenames */
  contentHash: boolean
  /** Output only client JS, skip marked templates and manifest */
  clientOnly: boolean
  /** Adapter-specific post-processing hook for marked templates */
  transformMarkedTemplate?: (content: string, componentId: string, clientJsPath: string) => string
  /** Custom output directory layout */
  outputLayout?: OutputLayout
  /** Post-build hook called after minification, before manifest write */
  postBuild?: (ctx: PostBuildContext) => Promise<void> | void
  /** Vendor packages to split out as separately-cached browser chunks */
  externals?: Record<string, ExternalSpec>
  /** URL base path for vendor chunks in the emitted importmap (default: /<runtimeSubdir>/) */
  externalsBasePath?: string
  /** Additional entry points to bundle with esbuild, with config.externals auto-applied */
  bundleEntries?: BundleEntry[]
}

export interface BuildResult {
  /** Number of components compiled this run */
  compiledCount: number
  /** Number of components skipped (no "use client") */
  skippedCount: number
  /** Number of components reused from cache without recompilation */
  cachedCount: number
  /** Number of compilation errors */
  errorCount: number
  /** Manifest entries */
  manifest: Record<string, { clientJs?: string; markedTemplate: string }>
  /** True when any output file on disk was changed (write or delete) */
  changed: boolean
  /**
   * The shared ts.Program used (or lazily built) during this run, if any.
   * Surfaced so watch mode can pass it back in as `oldProgram` on the next
   * tick, letting TypeScript reuse parsed SourceFiles for unchanged files
   * and avoiding a full ~500 ms Program reconstruction per save.
   */
  sharedProgram?: ts.Program
}

export interface BuildRunOptions {
  /** Ignore the build cache and recompile every entry. */
  force?: boolean
  /**
   * Program from a previous build() invocation. When provided, the shared
   * Program constructor passes it as `oldProgram` to `ts.createProgram`,
   * which reuses cached SourceFile objects for files whose content on disk
   * has not changed since the old Program was built. Used by watch mode.
   */
  oldProgram?: ts.Program
}

// ── Utility functions ────────────────────────────────────────────────────

/**
 * Check if file content starts with a "use client" directive.
 * Skips leading comments (block and line).
 */
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
 * Recursively discover .tsx component files in a directory.
 * Skips .test.tsx, .spec.tsx, and .preview.tsx files.
 */
export async function discoverComponentFiles(
  dir: string,
  options?: { skipDirs?: string[] }
): Promise<string[]> {
  const results: string[] = []
  const skipDirs = options?.skipDirs ? new Set(options.skipDirs) : null

  let entries: { name: string; isDirectory(): boolean }[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = resolve(dir, String(entry.name))
    if (entry.isDirectory()) {
      if (skipDirs?.has(String(entry.name))) continue
      results.push(...await discoverComponentFiles(fullPath, options))
    } else if (
      String(entry.name).endsWith('.tsx') &&
      !String(entry.name).endsWith('.test.tsx') &&
      !String(entry.name).endsWith('.spec.tsx') &&
      !String(entry.name).endsWith('.preview.tsx')
    ) {
      results.push(fullPath)
    }
  }

  return results
}

/**
 * Generate a short content hash string (8 hex chars).
 */
export function generateHash(content: string): string {
  return hashContent(content).slice(0, 8)
}

// ── Resolve BuildConfig from BarefootBuildConfig ─────────────────────────

/**
 * Resolve a BuildConfig from a BarefootBuildConfig (from barefoot.config.ts).
 * Resolves relative paths against projectDir.
 */
export function resolveBuildConfigFromTs(
  projectDir: string,
  tsConfig: { adapter: TemplateAdapter; components?: string[]; outDir?: string; minify?: boolean; contentHash?: boolean; clientOnly?: boolean; transformMarkedTemplate?: (content: string, componentId: string, clientJsPath: string) => string; outputLayout?: OutputLayout; postBuild?: (ctx: PostBuildContext) => Promise<void> | void; externals?: Record<string, ExternalSpec>; externalsBasePath?: string; bundleEntries?: BundleEntry[] },
  overrides?: { minify?: boolean }
): BuildConfig {
  const componentDirs = (tsConfig.components ?? ['components']).map(
    dir => resolve(projectDir, dir)
  )
  const outDir = resolve(projectDir, tsConfig.outDir ?? 'dist')

  return {
    projectDir,
    adapter: tsConfig.adapter,
    componentDirs,
    outDir,
    minify: overrides?.minify ?? tsConfig.minify ?? false,
    contentHash: tsConfig.contentHash ?? false,
    clientOnly: tsConfig.clientOnly ?? false,
    transformMarkedTemplate: tsConfig.transformMarkedTemplate,
    outputLayout: tsConfig.outputLayout,
    postBuild: tsConfig.postBuild,
    externals: tsConfig.externals,
    externalsBasePath: tsConfig.externalsBasePath,
    bundleEntries: tsConfig.bundleEntries?.map(e => ({
      entry: resolve(projectDir, e.entry),
      outfile: e.outfile,
      externals: e.externals,
    })),
  }
}

/**
 * Locate the @barefootjs/cli package.json regardless of whether this module is
 * running from source (packages/cli/src/lib/build.ts) or from the published
 * bundle (packages/cli/dist/index.js). Returns null if it can't be found.
 */
async function findCliPackageJson(): Promise<string | null> {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '../package.json'),      // bundled dist/index.js
    resolve(here, '../../package.json'),   // source src/lib/build.ts
  ]
  for (const cand of candidates) {
    if (await fileExists(cand)) return cand
  }
  return null
}

/**
 * Compute the invalidation hash shared by every cache entry. Captures the
 * configuration surface that would change build output globally (so a shift
 * here invalidates the whole cache, not a single entry).
 *
 * The CLI's own package.json is mixed in so any library upgrade — and
 * therefore any change to the cache schema that ships with it — implicitly
 * invalidates the on-disk cache without needing a hand-maintained version
 * counter.
 */
export async function computeGlobalHash(config: BuildConfig): Promise<string> {
  const parts: string[] = [
    config.adapter.name,
    String(config.minify),
    String(config.contentHash),
    String(config.clientOnly),
    JSON.stringify(config.outputLayout ?? null),
  ]
  const cliPkgPath = await findCliPackageJson()
  if (cliPkgPath) {
    parts.push(await readText(cliPkgPath))
  }
  const configCandidates = [
    resolve(config.projectDir, 'barefoot.config.ts'),
    resolve(config.projectDir, 'barefoot.config.js'),
    resolve(config.projectDir, 'barefoot.config.mjs'),
  ]
  for (const cand of configCandidates) {
    if (await fileExists(cand)) {
      parts.push(await readText(cand))
      break
    }
  }
  return hashContent(parts.join('\x00'))
}

// ── Main build pipeline ──────────────────────────────────────────────────

export async function build(
  config: BuildConfig,
  options: BuildRunOptions = {},
): Promise<BuildResult> {
  const { force = false, oldProgram } = options

  // Resolve output directories based on layout
  const layout = config.outputLayout
  const templatesSubdir = layout?.templates ?? 'components'
  const clientJsSubdir = layout?.clientJs ?? 'components'
  const runtimeSubdir = layout?.runtime ?? clientJsSubdir

  const templatesOutDir = resolve(config.outDir, templatesSubdir)
  const clientJsOutDir = resolve(config.outDir, clientJsSubdir)
  const runtimeOutDir = resolve(config.outDir, runtimeSubdir)

  // Create all output directories
  await Promise.all([
    mkdir(templatesOutDir, { recursive: true }),
    mkdir(clientJsOutDir, { recursive: true }),
    ...(runtimeSubdir !== clientJsSubdir ? [mkdir(runtimeOutDir, { recursive: true })] : []),
  ])

  // Load cache (discard if global invalidation flag is set)
  const globalHash = await computeGlobalHash(config)
  const loadedCache = force ? null : await loadCache(config.outDir)
  const cache: BuildCache =
    loadedCache && loadedCache.globalHash === globalHash
      ? loadedCache
      : emptyCache(globalHash)
  const nextEntries: Record<string, CacheEntry> = {}
  let anyOutputChanged = false

  // 1. Runtime file — copy the standalone runtime bundle (reactive inlined)
  //    to barefoot.js. The sibling `./runtime` entry keeps
  //    `@barefootjs/client/reactive` as an external import so downstream
  //    bundlers can dedupe it against the main entry; when we ship a file
  //    for the browser to load directly, we need the self-contained build.
  const domPkgDir = resolve(config.projectDir, 'node_modules/@barefootjs/client')
  const domDistCandidates = [
    resolve(config.projectDir, '../../packages/client/dist/runtime/standalone.js'),
    resolve(domPkgDir, 'dist/runtime/standalone.js'),
    // Legacy fallback for older @barefootjs/client dists that only shipped
    // the single runtime entry.
    resolve(config.projectDir, '../../packages/client/dist/runtime/index.js'),
    resolve(domPkgDir, 'dist/runtime/index.js'),
  ]
  let domDistFile: string | null = null
  for (const candidate of domDistCandidates) {
    try {
      await stat(candidate)
      domDistFile = candidate
      break
    } catch {
      // continue
    }
  }

  if (domDistFile) {
    const runtimeOutPath = resolve(runtimeOutDir, 'barefoot.js')
    let runtimeContent: string | Uint8Array
    if (config.minify) {
      // Minify at copy time so the minify pass below doesn't need to touch
      // barefoot.js (keeping it out of the per-build write loop).
      runtimeContent = transpile(await readText(domDistFile), { loader: 'js', minify: true })
    } else {
      runtimeContent = await readBytes(domDistFile)
    }
    const wrote = await writeIfChanged(runtimeOutPath, runtimeContent)
    if (wrote) {
      anyOutputChanged = true
      console.log(`Generated: ${runtimeSubdir}/barefoot.js`)
    }
  } else {
    console.warn('Warning: @barefootjs/client dist not found. Skipping barefoot.js copy.')
  }

  // 1b. Externals — copy vendor chunks, emit importmap + barefoot-externals.json
  const { changed: externalsChanged, allExternals } = await processExternals(config, runtimeSubdir, runtimeOutDir)
  if (externalsChanged) anyOutputChanged = true

  // 1c. bundleEntries entries — bundle with esbuild using auto-applied externals
  if (await processBundleEntries(config, clientJsOutDir, clientJsSubdir, allExternals, cache, nextEntries, force)) {
    anyOutputChanged = true
  }

  // 2. Discover component files
  const allFiles: string[] = []
  for (const dir of config.componentDirs) {
    allFiles.push(...await discoverComponentFiles(dir))
  }
  const allFilesSet = new Set(allFiles)

  // 3. Manifest baseline (runtime sentinel always present)
  const manifest: Record<string, { clientJs?: string; markedTemplate: string }> = {
    '__barefoot__': { markedTemplate: '', clientJs: `${runtimeSubdir}/barefoot.js` },
  }

  let compiledCount = 0
  let skippedCount = 0
  let cachedCount = 0
  let errorCount = 0

  // Collected types from all components (for postBuild hook)
  const collectedTypes = new Map<string, string>()

  // Pre-hash every source file once so cache-fresh checks (and dep lookups)
  // are just map lookups during the compile loop.
  const sourceHashes = new Map<string, string>()
  const sourceContents = new Map<string, string>()
  for (const file of allFiles) {
    const content = await readText(file)
    sourceContents.set(file, content)
    sourceHashes.set(file, hashContent(content))
  }

  // Resolve dep hashes referenced in the cache that aren't current sources, so
  // isEntryFresh can consult a synchronous map. Missing files resolve to null,
  // which invalidates the cached entry and forces a recompile.
  const extraDepPaths = new Set<string>()
  for (const entry of Object.values(cache.entries)) {
    for (const dep of Object.keys(entry.deps)) {
      if (!sourceHashes.has(dep)) extraDepPaths.add(dep)
    }
  }
  const extraDepHashes = new Map<string, string>()
  await Promise.all([...extraDepPaths].map(async (p) => {
    if (await fileExists(p)) {
      extraDepHashes.set(p, hashContent(await readText(p)))
    }
  }))
  const lookupDepHash = (absPath: string): string | null => {
    return sourceHashes.get(absPath) ?? extraDepHashes.get(absPath) ?? null
  }

  // Lazy shared ts.Program. The Program is expensive to construct
  // (~300-500 ms on a typical corpus) but essentially free to query
  // through its TypeChecker. To keep cache-only builds — where every
  // entry is fresh and nothing recompiles — at their current cost, we
  // only pay the construction when the first compile actually runs.
  //
  // On full rebuilds the cost is amortised over every file; on no-op
  // builds it is skipped entirely.
  let sharedProgram: ts.Program | undefined
  let sharedProgramInitialized = false
  const getSharedProgram = (): ts.Program | undefined => {
    if (sharedProgramInitialized) return sharedProgram
    sharedProgramInitialized = true
    if (allFiles.length === 0) return undefined
    const programBuildStart = performance.now()
    try {
      // Passing `oldProgram` lets TypeScript reuse SourceFile objects for
      // unchanged files. In watch mode this turns the per-tick Program cost
      // from ~500 ms (full reconstruction) into ~tens of ms (reparse only
      // the edited file).
      sharedProgram = createProgramForCorpus(allFiles, { oldProgram })
      const programBuildMs = performance.now() - programBuildStart
      if (programBuildMs > 200) {
        console.log(`Built shared ts.Program for ${allFiles.length} files in ${programBuildMs.toFixed(0)} ms`)
      }
    } catch (err) {
      // Module-resolution edge cases (virtual file paths, missing
      // tsconfig anchors) can trip Program construction. Fail open: the
      // analyzer's name-based fast path still works, aliased imports just
      // degrade to regex detection the way they did pre-refactor.
      sharedProgram = undefined
      console.warn(
        `Shared ts.Program construction failed; falling back to name-based reactive primitive detection. (${(err as Error).message})`
      )
    }
    return sharedProgram
  }

  // 4. Compile each component (or reuse from cache)
  for (const entryPath of allFiles) {
    const sourceContent = sourceContents.get(entryPath)!
    if (!hasUseClientDirective(sourceContent)) {
      skippedCount++
      continue
    }

    const currentHash = sourceHashes.get(entryPath)!
    const cached = cache.entries[entryPath]
    const canReuse =
      !force &&
      cached !== undefined &&
      isEntryFresh(cached, currentHash, lookupDepHash)

    if (canReuse) {
      nextEntries[entryPath] = cached
      if (cached.manifestKey && cached.manifestEntry) {
        manifest[cached.manifestKey] = cached.manifestEntry
      }
      if (cached.typesKey && cached.types) {
        collectedTypes.set(cached.typesKey, cached.types)
      }
      cachedCount++
      continue
    }

    const result = await compileEntry({
      entryPath,
      sourceContent,
      config,
      templatesSubdir,
      clientJsSubdir,
      templatesOutDir,
      clientJsOutDir,
      sharedProgram: getSharedProgram(),
    })

    if (result.kind === 'error') {
      errorCount++
      // Preserve old cache entry so we do not lose prior outputs on a failed
      // compile (they stay on disk and we reuse the prior manifest row).
      if (cached) {
        nextEntries[entryPath] = cached
        if (cached.manifestKey && cached.manifestEntry) {
          manifest[cached.manifestKey] = cached.manifestEntry
        }
        if (cached.typesKey && cached.types) {
          collectedTypes.set(cached.typesKey, cached.types)
        }
      }
      continue
    }

    if (result.kind === 'skipped') {
      skippedCount++
      continue
    }

    compiledCount++
    if (result.wroteAny) anyOutputChanged = true
    if (result.types) collectedTypes.set(result.typesKey!, result.types)

    if (result.manifestKey && result.manifestEntry) {
      // Detect silent overwrites. Two sources resolving to the same manifest key
      // would leave one of them out of the final manifest — and the combiner
      // would then fail to inline its @bf-child placeholders. Surface loudly.
      const existing = manifest[result.manifestKey]
      if (
        existing !== undefined &&
        existing.markedTemplate !== result.manifestEntry.markedTemplate
      ) {
        throw new Error(
          `Manifest key collision: "${result.manifestKey}" would be overwritten by ${relative(config.projectDir, entryPath)}. ` +
          `Two component files share a basename — rename one to give each a unique manifest key.`
        )
      }
      manifest[result.manifestKey] = result.manifestEntry
    }

    nextEntries[entryPath] = {
      hash: currentHash,
      deps: result.deps,
      outputs: result.outputs,
      manifestKey: result.manifestKey,
      manifestEntry: result.manifestEntry,
      typesKey: result.typesKey,
      types: result.types,
    }
  }

  // 5. Prune outputs for cache entries whose source was deleted since last build.
  //    - Component entries: keyed by source path; delete if path is no longer in allFilesSet.
  //    - Bundle entries ("bundle:" prefix): delete if no longer present in nextEntries
  //      (i.e. removed from config.bundleEntries).
  const toDelete = Object.keys(cache.entries).filter((key) => {
    if (key.startsWith('bundle:')) return !(key in nextEntries)
    return !allFilesSet.has(key)
  })
  for (const deletedPath of toDelete) {
    const entry = cache.entries[deletedPath]
    for (const output of entry.outputs) {
      const abs = resolve(config.outDir, output)
      try {
        await unlink(abs)
        anyOutputChanged = true
        console.log(`Deleted: ${output}`)
      } catch {
        // already gone
      }
    }
  }

  // 6. Combine parent-child client JS
  const clientJsFiles = new Map<string, string>()
  for (const [name, entry] of Object.entries(manifest)) {
    if (!entry.clientJs) continue
    const filePath = resolve(config.outDir, entry.clientJs)
    try {
      clientJsFiles.set(name, await readText(filePath))
    } catch {
      // File may not exist (e.g. __barefoot__)
    }
  }

  if (clientJsFiles.size > 0) {
    const combined = combineParentChildClientJs(clientJsFiles)
    for (const [name, content] of combined) {
      const entry = manifest[name]
      if (!entry?.clientJs) continue
      const filePath = resolve(config.outDir, entry.clientJs)
      if (await writeIfChanged(filePath, content)) {
        anyOutputChanged = true
        console.log(`Combined: ${entry.clientJs}`)
      }
    }
  }

  // 6b. Resolve relative imports (idempotent — writeIfChanged keeps it quiet)
  await resolveRelativeImports({ distDir: config.outDir, manifest })

  // 6c. Rewrite bare @barefootjs/client imports to relative barefoot.js path,
  //     then dedupe if a file ends up with multiple imports from the same
  //     source. Watch rebuilds can pull a freshly-compiled parent (still
  //     using `@barefootjs/client/runtime`) together with a child that was
  //     read back from disk in its previously-rewritten form (`./barefoot.js`).
  //     Combine treats those as different sources and emits two import lines;
  //     after the rewrite below they collapse to the same path, which is a
  //     `SyntaxError: Identifier 'X' has already been declared` at runtime.
  {
    const runtimeAbs = resolve(config.outDir, runtimeSubdir, 'barefoot.js')
    for (const [name, entry] of Object.entries(manifest)) {
      if (!entry.clientJs || name === '__barefoot__') continue
      const filePath = resolve(config.outDir, entry.clientJs)
      // Compute the runtime path relative to THIS file's directory so
      // nested client JS (e.g. dist/components/ui/button/index.client.js)
      // gets the correct number of `..` segments instead of looking for
      // a sibling `./barefoot.js` that doesn't exist.
      let rel = relative(dirname(filePath), runtimeAbs)
      if (!rel.startsWith('.')) rel = './' + rel
      try {
        let content = await readText(filePath)
        const before = content
        if (content.includes('@barefootjs/client')) {
          content = content.replace(
            /from ['"]@barefootjs\/client\/runtime['"]/g,
            `from '${rel}'`,
          )
        }
        content = mergeDuplicateNamedImports(content)
        if (content !== before && await writeIfChanged(filePath, content)) {
          anyOutputChanged = true
        }
      } catch {
        // File may not exist
      }
    }
  }

  // 7. Minify client JS (after combine so all files are final).
  // Runtime (__barefoot__) is already minified at copy time above.
  if (config.minify) {
    for (const [name, entry] of Object.entries(manifest)) {
      if (!entry.clientJs || name === '__barefoot__') continue
      const filePath = resolve(config.outDir, entry.clientJs)
      try {
        const content = await readText(filePath)
        if (content) {
          const minified = transpile(content, { loader: 'js', minify: true })
          if (await writeIfChanged(filePath, minified)) {
            anyOutputChanged = true
          }
        }
      } catch {
        // File may not exist
      }
    }
  }

  // 7b. Post-build hook (after minification, before manifest write).
  // Post-build writes (e.g. adapter-generated Go types) happen outside the
  // writeIfChanged tracking above, so the hook uses `markChanged()` to bubble
  // up real file changes — keeps the dev-reload sentinel honest.
  if (config.postBuild) {
    await config.postBuild({
      types: collectedTypes,
      outDir: config.outDir,
      projectDir: config.projectDir,
      manifest,
      markChanged: () => { anyOutputChanged = true },
    })
  }

  // 8. Write manifest (skip in clientOnly mode)
  if (!config.clientOnly) {
    const manifestDir = resolve(config.outDir, templatesSubdir)
    const manifestPath = resolve(manifestDir, 'manifest.json')
    const manifestContent = JSON.stringify(manifest, null, 2)
    if (await writeIfChanged(manifestPath, manifestContent)) {
      anyOutputChanged = true
      console.log(`Generated: ${templatesSubdir}/manifest.json`)
    }
  }

  // 9. Persist cache
  const nextCache: BuildCache = {
    globalHash,
    entries: nextEntries,
  }
  await saveCache(config.outDir, nextCache)

  return {
    compiledCount,
    skippedCount,
    cachedCount,
    errorCount,
    manifest,
    changed: anyOutputChanged,
    sharedProgram,
  }
}

// ── Externals processing ─────────────────────────────────────────────────

const BF_CLIENT_DEDUP_KEYS = [
  '@barefootjs/client',
  '@barefootjs/client/runtime',
  '@barefootjs/client/reactive',
]

/**
 * Derive the output filename for a vendored chunk from its package name.
 * `@barefootjs/xyflow` → `xyflow.js`, `yjs` → `yjs.js`.
 */
export function vendorChunkFilename(pkgName: string): string {
  const base = pkgName.includes('/') ? pkgName.split('/').pop()! : pkgName
  return `${base}.js`
}

/**
 * Derive the effective base name for a source file's outputs, preserving
 * the file's full position under any configured `componentDirs` root so
 * the on-disk layout in `dist/` mirrors the source layout. For a source
 * like `<root>/components/ui/button/index.tsx` with componentDirs
 * `['components']`:
 *
 *   - returns `{ baseFileName: 'ui/button/index.tsx',
 *               baseNameNoExt: 'ui/button/index' }`
 *
 * — emitting `dist/components/ui/button/index.tsx` and keeping any
 * `import { Slot } from '../slot'` in the compiled template valid because
 * the sibling `dist/components/ui/slot/index.tsx` exists at the same
 * relative depth.
 *
 * Falls back to plain basename when the file isn't under any of the
 * configured input dirs (legacy / out-of-tree compilation).
 */
export function effectiveNamesFor(
  entryPath: string,
  componentDirs?: readonly string[],
): { baseFileName: string; baseNameNoExt: string } {
  const bn = basename(entryPath)

  if (componentDirs && componentDirs.length > 0) {
    for (const dir of componentDirs) {
      const root = resolve(dir)
      if (entryPath !== root && entryPath.startsWith(root + '/')) {
        const rel = entryPath.slice(root.length + 1)
        const noExt = rel.replace(/\.[^.]+$/, '')
        return { baseFileName: rel, baseNameNoExt: noExt }
      }
    }
  }

  const noExt = bn.replace(/\.[^.]+$/, '')
  return { baseFileName: bn, baseNameNoExt: noExt }
}

/**
 * Output filename (relative to the templates dir) for a marked template.
 * The compiler may emit the marked template under the same basename as
 * the source; we splice in the subdir prefix so the on-disk layout
 * matches the source.
 */
export function effectiveOutName(tplPath: string, entryBaseNoExt: string): string {
  const bn = basename(tplPath)
  // entryBaseNoExt may carry a subdir prefix like 'ui/button/index'.
  const entryDir = entryBaseNoExt.includes('/')
    ? entryBaseNoExt.slice(0, entryBaseNoExt.lastIndexOf('/'))
    : ''
  return entryDir ? `${entryDir}/${bn}` : bn
}

/**
 * Collapse multiple `import { ... } from 'X'` lines that share the same source
 * into a single line with the union of their names. No-op if every source
 * appears at most once. Only handles the `import { a, b } from 'X'` form —
 * default, namespace, and side-effect imports are passed through verbatim.
 */
export function mergeDuplicateNamedImports(content: string): string {
  const lines = content.split('\n')
  const namedImportRe = /^import\s+\{\s*([^}]+)\s*\}\s+from\s+(['"])([^'"]+)\2\s*;?\s*$/
  const bySource = new Map<string, { firstIdx: number; names: Set<string>; quote: string }>()
  const dropIndices = new Set<number>()
  let changed = false

  lines.forEach((line, idx) => {
    const m = line.match(namedImportRe)
    if (!m) return
    const names = m[1].split(',').map(s => s.trim()).filter(Boolean)
    const source = m[3]
    const quote = m[2]
    const existing = bySource.get(source)
    if (!existing) {
      bySource.set(source, { firstIdx: idx, names: new Set(names), quote })
    } else {
      for (const n of names) existing.names.add(n)
      dropIndices.add(idx)
      changed = true
    }
  })

  if (!changed) return content

  // Rewrite the first occurrence of each duplicated source with the merged set,
  // and drop the later duplicates.
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (dropIndices.has(i)) continue
    let line = lines[i]
    for (const { firstIdx, names, quote } of bySource.values()) {
      if (firstIdx === i && names.size > 0) {
        const sorted = [...names].sort().join(', ')
        line = line.replace(namedImportRe, `import { ${sorted} } from ${quote}$3${quote}`)
        break
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

interface PkgBrowserEntry {
  /** Absolute path to the resolved file. */
  path: string
  /**
   * True when the file was resolved via a browser-ready field (`umd`, `unpkg`,
   * or `jsdelivr`). False when we fell back to `exports["."].import` or `main`,
   * which may still contain bare external imports that are not browser-ready.
   */
  isBrowserReady: boolean
}

/**
 * Locate the browser-ready entry for a package.
 * Preference order: `exports["."].umd` → `unpkg` → `jsdelivr` → `exports["."].import` → `main`.
 * Returns `isBrowserReady: false` when the resolved file came from an
 * `import`/`main` fallback rather than an explicit browser field.
 */
async function resolvePkgBrowserEntry(pkgDir: string): Promise<PkgBrowserEntry | null> {
  const pkgJsonPath = resolve(pkgDir, 'package.json')
  if (!(await fileExists(pkgJsonPath))) return null
  const pkg = JSON.parse(await readText(pkgJsonPath))

  // Browser-ready candidates: these fields are intended for direct browser use.
  const browserCandidates = [
    pkg.exports?.['.']?.umd,
    pkg.unpkg,
    pkg.jsdelivr,
  ].filter((v): v is string => typeof v === 'string')
  for (const rel of browserCandidates) {
    const abs = resolve(pkgDir, rel)
    if (await fileExists(abs)) return { path: abs, isBrowserReady: true }
  }

  // Fallback candidates: may contain bare external imports not suitable for
  // direct browser loading without a bundler or importmap.
  const fallbackCandidates = [
    pkg.exports?.['.']?.import,
    pkg.main,
  ].filter((v): v is string => typeof v === 'string')
  for (const rel of fallbackCandidates) {
    const abs = resolve(pkgDir, rel)
    if (await fileExists(abs)) return { path: abs, isBrowserReady: false }
  }

  return null
}

export interface ExternalsManifest {
  /** Entries for `<script type="importmap">` */
  importmap: { imports: Record<string, string> }
  /** URLs to emit as `<link rel="modulepreload">` */
  preloads: string[]
  /** Package names to pass as `--external` to bun build */
  externals: string[]
}

/**
 * Process the `externals` config: copy vendor chunks to outDir, build the
 * importmap JSON, and write `barefoot-externals.json`.
 * Returns whether any output file changed and the full list of external package names.
 */
export async function processExternals(
  config: BuildConfig,
  runtimeSubdir: string,
  runtimeOutDir: string,
): Promise<{ changed: boolean; allExternals: string[] }> {
  if (!config.externals || Object.keys(config.externals).length === 0) return { changed: false, allExternals: [] }

  const basePath = config.externalsBasePath ?? `/${runtimeSubdir}/`
  const base = basePath.endsWith('/') ? basePath : basePath + '/'

  const imports: Record<string, string> = {}
  const preloads: string[] = []
  let anyChanged = false

  for (const [pkgName, spec] of Object.entries(config.externals)) {
    const isChunk = spec === true || (typeof spec === 'object' && !('url' in spec))
    const isCdn = typeof spec === 'object' && 'url' in spec
    const wantPreload = typeof spec === 'object' && spec.preload === true

    if (isCdn) {
      const url = (spec as { url: string }).url
      imports[pkgName] = url
      if (wantPreload) preloads.push(url)
      continue
    }

    if (isChunk) {
      const pkgDir = resolve(config.projectDir, 'node_modules', pkgName)
      const entry = await resolvePkgBrowserEntry(pkgDir)
      if (!entry) {
        console.warn(`Warning: externals — could not resolve browser entry for "${pkgName}". Skipping.`)
        continue
      }

      const wantRebundle = typeof spec === 'object' && !('url' in spec) && spec.rebundle === true

      // Warn when the resolved file came from an import/main fallback and rebundle is not set.
      // These files may contain bare external imports (e.g. "lib0/observable") that the browser
      // cannot resolve without a bundler or importmap. Set rebundle: true to inline them.
      if (!entry.isBrowserReady && !wantRebundle) {
        console.warn(
          `Warning: externals — "${pkgName}" resolved via import/main entry (no umd/unpkg/jsdelivr found). ` +
          `The copied file may contain external imports that are not browser-ready. ` +
          `Set rebundle: true to re-bundle it into a self-contained ESM file.`
        )
      }

      const srcFile = entry.path
      const filename = vendorChunkFilename(pkgName)
      const destPath = resolve(runtimeOutDir, filename)

      if (wantRebundle) {
        await esbuildBuild({
          entryPoints: [srcFile],
          outfile: destPath,
          format: 'esm',
          bundle: true,
          minify: config.minify ?? false,
        })
        anyChanged = true
        console.log(`Generated (bundled): ${runtimeSubdir}/${filename}`)
      } else {
        let content: string | Uint8Array = await readBytes(srcFile)
        if (config.minify) {
          content = transpile(content instanceof Uint8Array ? new TextDecoder().decode(content) : content, { loader: 'js', minify: true })
        }
        if (await writeIfChanged(destPath, content)) {
          anyChanged = true
          console.log(`Generated: ${runtimeSubdir}/${filename}`)
        }
      }

      const url = `${base}${filename}`
      imports[pkgName] = url
      if (wantPreload) preloads.push(url)
    }
  }

  // Auto-dedup @barefootjs/client* — always emitted when externals is non-empty
  const barefootUrl = `${base}barefoot.js`
  for (const key of BF_CLIENT_DEDUP_KEYS) {
    imports[key] = barefootUrl
  }

  // All packages that go into --external for the user's bun build
  const allExternals = [
    ...Object.keys(config.externals),
    ...BF_CLIENT_DEDUP_KEYS.filter(k => !(k in config.externals!)),
  ]

  const manifest: ExternalsManifest = {
    importmap: { imports },
    preloads,
    externals: allExternals,
  }

  const manifestPath = resolve(config.outDir, 'barefoot-externals.json')
  if (await writeIfChanged(manifestPath, JSON.stringify(manifest, null, 2))) {
    anyChanged = true
    console.log('Generated: barefoot-externals.json')
  }

  return { changed: anyChanged, allExternals }
}

/**
 * Bundle entries listed in `config.bundleEntries` directly with esbuild.
 * Each entry is compiled as an ESM bundle with all externals from
 * `config.externals` (plus any per-entry overrides) excluded from the bundle.
 *
 * Results are cached by source+deps hash. Dependencies are harvested from
 * esbuild's metafile on first build (project-local files only — node_modules
 * and externals are excluded). On subsequent runs, the entry is rebuilt only
 * if the source or any dep hash has changed, or the output file is missing.
 */
export async function processBundleEntries(
  config: BuildConfig,
  clientJsOutDir: string,
  clientJsSubdir: string,
  allExternals: string[],
  cache: BuildCache,
  nextEntries: Record<string, CacheEntry>,
  force: boolean,
): Promise<boolean> {
  if (!config.bundleEntries || config.bundleEntries.length === 0) return false

  let anyChanged = false
  for (const entry of config.bundleEntries) {
    const entryExternals = [...allExternals, ...(entry.externals ?? [])]
    const outfilePath = resolve(clientJsOutDir, entry.outfile)
    const absEntry = resolve(entry.entry)
    const cacheKey = `bundle:${absEntry}`

    const sourceContent = await readText(absEntry)
    const sourceHash = hashContent(sourceContent)

    // Cache lookup: reuse if source + every recorded dep still matches and the
    // output file hasn't been removed by hand.
    const cached = cache.entries[cacheKey]
    if (!force && cached !== undefined && (await fileExists(outfilePath))) {
      const depPaths = Object.keys(cached.deps)
      const depHashes = new Map<string, string>()
      await Promise.all(
        depPaths.map(async (depPath) => {
          if (await fileExists(depPath)) {
            depHashes.set(depPath, hashContent(await readText(depPath)))
          }
        }),
      )
      const lookupDepHash = (absPath: string): string | null => depHashes.get(absPath) ?? null
      if (isEntryFresh(cached, sourceHash, lookupDepHash)) {
        nextEntries[cacheKey] = cached
        continue
      }
    }

    const absWorkingDir = process.cwd()
    const result = await esbuildBuild({
      entryPoints: [entry.entry],
      outfile: outfilePath,
      format: 'esm',
      bundle: true,
      minify: config.minify,
      external: entryExternals,
      metafile: true,
      absWorkingDir,
    })
    anyChanged = true
    console.log(`Generated (entry): ${clientJsSubdir}/${entry.outfile}`)

    // Harvest project-local deps from esbuild's metafile. Keys are relative
    // to absWorkingDir. Skip node_modules (versioning is pinned by the
    // lockfile / package.json, which the global cache hash covers) and any
    // external (those aren't bundled, so their contents don't affect the output).
    const externalsSet = new Set(entryExternals)
    const depsMap: Record<string, string> = { [absEntry]: sourceHash }
    const metafile = result.metafile
    if (metafile) {
      for (const inputPath of Object.keys(metafile.inputs)) {
        if (externalsSet.has(inputPath)) continue
        const abs = resolve(absWorkingDir, inputPath)
        if (abs === absEntry) continue
        if (abs.includes('/node_modules/')) continue
        if (await fileExists(abs)) {
          depsMap[abs] = hashContent(await readText(abs))
        }
      }
    }

    nextEntries[cacheKey] = {
      hash: sourceHash,
      deps: depsMap,
      outputs: [relative(config.outDir, outfilePath)],
      manifestKey: null,
    }
  }
  return anyChanged
}

// ── Dependency scanner ───────────────────────────────────────────────────

const RELATIVE_IMPORT_SCAN_RE = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"\n]+from\s+)?['"](\.[^'"]+)['"]/g

/**
 * Scan a source file for relative imports and return the set of absolute paths
 * that resolve to existing files. Used for dependency tracking in the build
 * cache: when an imported file changes, the importer's cache entry becomes
 * stale and must be recompiled (so its combined client JS picks up the change).
 */
export async function collectRelativeImportDeps(
  entryPath: string,
  sourceContent: string,
): Promise<string[]> {
  const baseDir = dirname(entryPath)
  const seen = new Set<string>()
  const results: string[] = []
  const EXT_CANDIDATES = ['.tsx', '.ts', '/index.tsx', '/index.ts']

  for (const match of sourceContent.matchAll(RELATIVE_IMPORT_SCAN_RE)) {
    const rel = match[1]
    if (!rel.startsWith('.')) continue
    const base = resolve(baseDir, rel)
    const candidates = [base, ...EXT_CANDIDATES.map((ext) => base + ext)]
    for (const cand of candidates) {
      if (seen.has(cand)) continue
      // Require a regular file. A bare `./dir` import resolves to a directory
      // here, and hashing that path via readText would throw EISDIR. The
      // `/index.ts[x]` candidates already cover the directory-as-module case.
      try {
        const s = await stat(cand)
        if (!s.isFile()) continue
      } catch {
        continue
      }
      seen.add(cand)
      results.push(cand)
      break
    }
  }
  return results
}

// ── Per-entry compile helper ─────────────────────────────────────────────

interface CompileEntryArgs {
  entryPath: string
  sourceContent: string
  config: BuildConfig
  templatesSubdir: string
  clientJsSubdir: string
  templatesOutDir: string
  clientJsOutDir: string
  /**
   * Shared ts.Program built once per build invocation. Passed through to
   * compileJSX so the analyzer's TypeChecker can resolve import aliases and
   * namespace-qualified calls to @barefootjs/client primitives. Optional —
   * absent means the analyzer falls back to name-based detection only.
   */
  sharedProgram?: ts.Program
}

type CompileEntryOutcome =
  | { kind: 'error' }
  | { kind: 'skipped' }
  | {
      kind: 'compiled'
      deps: Record<string, string>
      outputs: string[]
      manifestKey: string | null
      manifestEntry?: { markedTemplate: string; clientJs?: string }
      wroteAny: boolean
      types?: string
      typesKey?: string
    }

async function compileEntry(args: CompileEntryArgs): Promise<CompileEntryOutcome> {
  const {
    entryPath,
    sourceContent,
    config,
    templatesSubdir,
    clientJsSubdir,
    templatesOutDir,
    clientJsOutDir,
    sharedProgram,
  } = args

  // Preserve the source path's relative position under `componentDirs`
  // when emitting outputs. For a typical UI-registry layout
  // (`components/ui/button/index.tsx`) this produces
  // `dist/components/ui/button.{tsx,client.js}` rather than collapsing
  // every `<dir>/index.tsx` into a single `dist/components/index.tsx`,
  // which silently overwrites siblings (manifest-key collision detection
  // compares output paths, so it doesn't catch the duplicate either).
  const { baseFileName, baseNameNoExt } = effectiveNamesFor(entryPath, config.componentDirs)
  let clientJsFilename = `${baseNameNoExt}.client.js`

  // Track deps: compileJSX only reads the entry file, so transitive deps via
  // imports are picked up by lexically scanning the source for relative imports.
  const deps: Record<string, string> = {}
  for (const depPath of await collectRelativeImportDeps(entryPath, sourceContent)) {
    deps[depPath] = hashContent(await readText(depPath))
  }

  const result = await compileJSX(
    entryPath,
    async (path) => readText(path),
    { adapter: config.adapter, program: sharedProgram },
  )

  const errors = result.errors.filter(e => e.severity === 'error')
  const warnings = result.errors.filter(e => e.severity === 'warning')

  if (warnings.length > 0) {
    console.warn(`Warnings compiling ${relative(config.projectDir, entryPath)}:`)
    for (const warning of warnings) {
      console.warn(`  ${warning.message}`)
    }
  }

  if (errors.length > 0) {
    console.error(`Errors compiling ${relative(config.projectDir, entryPath)}:`)
    for (const error of errors) {
      console.error(`  ${error.message}`)
    }
    return { kind: 'error' }
  }

  const markedTemplates = result.files.filter(f => f.type === 'markedTemplate')
  let clientJsContent = ''
  let typesContent: string | undefined

  for (const file of result.files) {
    if (file.type === 'clientJs') {
      clientJsContent = file.content
    } else if (file.type === 'types') {
      typesContent = file.content
    }
  }

  if (markedTemplates.length === 0 && !clientJsContent) {
    return { kind: 'skipped' }
  }

  if (config.contentHash && clientJsContent) {
    const hash = generateHash(clientJsContent)
    clientJsFilename = `${baseNameNoExt}-${hash}.client.js`
  }

  const hasClientJs = clientJsContent.length > 0
  const outputs: string[] = []
  let wroteAny = false

  if (hasClientJs) {
    const rel = `${clientJsSubdir}/${clientJsFilename}`
    outputs.push(rel)
    const target = resolve(clientJsOutDir, clientJsFilename)
    await mkdir(dirname(target), { recursive: true })
    if (await writeIfChanged(target, clientJsContent)) {
      wroteAny = true
      console.log(`Generated: ${rel}`)
    }
  }

  if (!config.clientOnly && markedTemplates.length > 0) {
    for (const tpl of markedTemplates) {
      const outName = effectiveOutName(tpl.path, baseNameNoExt)
      let outputContent = tpl.content
      if (hasClientJs && config.transformMarkedTemplate) {
        const componentId = outName.replace(/\.[^.]+$/, '')
        outputContent = config.transformMarkedTemplate(outputContent, componentId, clientJsFilename)
      }
      const rel = `${templatesSubdir}/${outName}`
      outputs.push(rel)
      const target = resolve(templatesOutDir, outName)
      await mkdir(dirname(target), { recursive: true })
      if (await writeIfChanged(target, outputContent)) {
        wroteAny = true
        console.log(`Generated: ${rel}`)
      }
    }
  }

  let manifestKey: string | null = null
  let manifestEntry: { markedTemplate: string; clientJs?: string } | undefined
  if (!config.clientOnly && markedTemplates.length > 0) {
    const primaryTpl =
      markedTemplates.find(t => effectiveOutName(t.path, baseNameNoExt).startsWith(baseNameNoExt + '.'))
      ?? markedTemplates[0]
    manifestKey = baseNameNoExt
    manifestEntry = {
      markedTemplate: `${templatesSubdir}/${effectiveOutName(primaryTpl.path, baseNameNoExt)}`,
      clientJs: hasClientJs ? `${clientJsSubdir}/${clientJsFilename}` : undefined,
    }
  }

  return {
    kind: 'compiled',
    deps,
    outputs,
    manifestKey,
    manifestEntry,
    wroteAny,
    types: typesContent,
    typesKey: baseNameNoExt,
  }
}

// ── Dev sentinel ─────────────────────────────────────────────────────────

// The `<outDir>/.dev/build-id` path is an inter-package contract between the
// CLI (producer) and every adapter's dev reloader (consumer, e.g.
// `packages/adapter-hono/src/dev.tsx`). Adapters re-declare the same literal strings
// to avoid a runtime dependency on `@barefootjs/cli`; if these values change
// here, update every adapter's dev reloader in the same PR.
export const DEV_SENTINEL_SUBDIR = '.dev'
export const DEV_SENTINEL_FILENAME = 'build-id'

/**
 * Dev-only sentinel for signalling browsers to reload after a watch rebuild.
 * Written at `<outDir>/.dev/build-id` only when the build both succeeded and
 * actually changed output on disk — so a touch-save that produces no diff
 * does not trigger a reload.
 */
async function writeBuildId(outDir: string, result: BuildResult): Promise<void> {
  if (result.errorCount > 0 || !result.changed) return
  const devDir = resolve(outDir, DEV_SENTINEL_SUBDIR)
  await mkdir(devDir, { recursive: true })
  const path = resolve(devDir, DEV_SENTINEL_FILENAME)
  await writeIfChanged(path, String(Date.now()))
}

// ── Watch mode ───────────────────────────────────────────────────────────

export interface WatchOptions {
  /** Debounce delay in ms before applying a batch of file events (default 100) */
  debounceMs?: number
  /** Signal to stop watching (optional) */
  signal?: AbortSignal
}

/**
 * Run an initial incremental build and then keep watching source directories
 * and barefoot.config.ts, re-running incremental builds on change.
 * Resolves only when `signal` aborts.
 */
export async function watch(
  config: BuildConfig,
  options: WatchOptions = {},
): Promise<void> {
  const { debounceMs = 100, signal } = options
  const { watch: fsWatch } = await import('node:fs/promises')

  // Initial build
  const initial = await build(config)
  // Thread the shared ts.Program across rebuilds so TypeScript can reuse
  // parsed SourceFile objects for unchanged files. A cold Program build on
  // a 264-file corpus is ~500 ms; an incremental reuse is tens of ms. The
  // alternative — rebuilding the Program on every keystroke-triggered
  // save — was the "checker reinit storm" failure mode called out in the
  // pre-implementation design discussion.
  let cachedProgram: ts.Program | undefined = initial.sharedProgram
  console.log('')
  console.log(
    `Initial build: ${initial.compiledCount} compiled, ${initial.cachedCount} cached, ${initial.errorCount} errors`,
  )
  await writeBuildId(config.outDir, initial)
  console.log('Watching for changes...')

  // Watch component source dirs recursively; watch project dir non-recursively
  // for barefoot.config.ts changes only.
  const componentRoots = config.componentDirs
  const configRoot = config.projectDir

  let pending = false
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    pending = true
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, debounceMs)
  }

  const flush = async () => {
    flushTimer = null
    if (!pending) return
    pending = false

    const t0 = performance.now()
    const result = await build(config, { oldProgram: cachedProgram })
    cachedProgram = result.sharedProgram ?? cachedProgram
    const ms = (performance.now() - t0).toFixed(0)
    console.log(
      `Rebuild: ${result.compiledCount} compiled, ${result.cachedCount} cached, ${result.errorCount} errors (${ms}ms)`,
    )
    await writeBuildId(config.outDir, result)
  }

  const isRelevant = (root: string, filename: string | null): boolean => {
    if (!filename) return false
    if (root === configRoot) {
      return /^barefoot\.config\.(ts|js|mjs)$/.test(filename)
    }
    return filename.endsWith('.tsx') || filename.endsWith('.ts')
  }

  const watchRoot = async (root: string, recursive: boolean) => {
    try {
      const iter = fsWatch(root, { recursive, signal }) as AsyncIterable<{
        eventType: string
        filename: string | null
      }>
      for await (const event of iter) {
        if (!isRelevant(root, event.filename)) continue
        schedule()
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      console.warn(`Watcher for ${root} stopped: ${(err as Error).message}`)
    }
  }

  await Promise.all([
    ...componentRoots.map((r) => watchRoot(r, true)),
    watchRoot(configRoot, false),
  ])
}

