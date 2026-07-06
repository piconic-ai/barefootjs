// Core build module: shared pipeline for `bf build`.

import { compileJSX, combineParentChildClientJs, createProgramForCorpus, formatError, renderImportMapHtml, REACTIVE_PRIMITIVES, BROWSER_ONLY_CLIENT_APIS, listComponentFunctions, analyzeComponent, buildMetadata } from '@barefootjs/jsx'
import type { TemplateAdapter, OutputLayout, PostBuildContext, ExternalSpec, BundleEntry, ExternalsManifest, IRMetadata } from '@barefootjs/jsx'
import ts from 'typescript'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { resolve, basename, relative, dirname, isAbsolute } from 'node:path'
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
import {
  BUNDLE_KEY_PREFIX,
  emptyLedger,
  extractLedgerFromCache,
  loadEmitLedger,
  saveEmitLedger,
  type EmitLedger,
} from './emit-ledger'
import { writeIfChanged } from './fs-utils'
import {
  ASSETS_IGNORE_FILENAME,
  collectServerOnlyAssets,
  isCloudflareWorkersProject,
  writeAssetsIgnore,
} from './assets-ignore'
import { fileExists, hashBytes, readBytes, readText, transpile } from './runtime'
import { build as esbuildBuild } from 'esbuild'
import {
  ALWAYS_KEEP_RUNTIME_EXPORTS,
  buildRuntimeBundle,
  collectUsedRuntimeExports,
  mergeRuntimeImportCollections,
  type RuntimeImportCollection,
} from './runtime-treeshake'

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
  /**
   * Import prefixes resolved at build time rather than left as bare
   * specifiers in the emitted client JS (e.g. `['@/', '@ui/']` for
   * tsconfig `paths` aliases). Forwarded to `compileJSX`.
   */
  localImportPrefixes?: string[]
  /**
   * How to produce `barefoot.js`:
   *   - `'treeshake'` (default) — bundle only the `@barefootjs/client*`
   *     exports this project's compiled client JS (plus `bundleEntries` and
   *     rebundled `externals` chunks) actually imports, plus the
   *     always-kept public mount API (`ALWAYS_KEEP_RUNTIME_EXPORTS` in
   *     `./runtime-treeshake.ts`). Falls back to `'full'` for this build,
   *     with a console warning, if collection hits an import shape it can't
   *     safely narrow (namespace import, default import, or dynamic
   *     `import()` of the runtime) or if no prebuilt runtime dist file can
   *     be found to bundle from.
   *   - `'full'` — copy the entire prebuilt runtime bundle verbatim, as
   *     `bf build` always did before per-project tree-shaking.
   */
  runtimeBundle?: 'treeshake' | 'full'
  /**
   * Extra `@barefootjs/client*` export names to force-keep in `barefoot.js`
   * under `runtimeBundle: 'treeshake'`, on top of whatever the collector
   * finds and the always-kept public mount API. Use this for names only
   * ever referenced from hand-written page scripts the CLI never compiles
   * (an inline `<script type="module">` calling `hydrate()` directly, a
   * hand-rolled router bootstrap, etc.) that aren't already covered by
   * `ALWAYS_KEEP_RUNTIME_EXPORTS`.
   */
  runtimeKeep?: string[]
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
  manifest: Record<string, { clientJs?: string; markedTemplate: string; stubDeps?: string[] }>
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
/**
 * Names from `@barefootjs/client` whose presence (without `'use client'`)
 * matches the analyzer's BF001 trigger set. Pulled directly from the
 * authoritative sets in `@barefootjs/jsx`'s analyzer so this CLI surface
 * cannot drift out of sync with what `analyzeComponent` actually raises:
 *
 *   - `REACTIVE_PRIMITIVES` — `createSignal`/`createMemo`/`createEffect`/
 *     `createDisposableEffect`/`onMount`/`onCleanup`. The analyzer fires
 *     BF001 when their calls populate `ctx.signals`/`memos`/`effects`/
 *     `onMounts`; the CLI doesn't have call-site visibility cheaply at
 *     the skip-gate, so it raises on import as a proactive proxy.
 *   - `BROWSER_ONLY_CLIENT_APIS` — `useContext`/`provideContext`/
 *     `createPortal`/`isSSRPortal`/`findSiblingSlot`/
 *     `cleanupPortalPlaceholder`. Matches `importsBrowserOnlyClientApi`
 *     exactly: import alone (not call) is the analyzer's trigger.
 *
 * `untrack` is intentionally absent here — the analyzer doesn't treat it
 * as a tripwire (it has no DOM-runtime tail and doesn't populate any of
 * the ctx arrays), and an earlier version of this list had it as a
 * false-positive source.
 */
const BF001_TRIPWIRE_IMPORTS = new Set<string>([
  ...REACTIVE_PRIMITIVES,
  ...BROWSER_ONLY_CLIENT_APIS,
])

/**
 * Cheap pre-analyzer scan: does this source `import { ... } from '@barefootjs/client'`
 * any name from `BF001_TRIPWIRE_IMPORTS`? Returns the offending names so the
 * diagnostic can list them. Returns `[]` for files that genuinely don't
 * need `'use client'` (server components, type-only imports).
 *
 * Regex-based instead of TS-AST because this runs in the hot skip-gate
 * before `compileEntry` and must stay sub-millisecond. The downside is
 * we may match commented-out imports — that's fine for a diagnostic, the
 * user can resolve it by either adding the directive or removing the
 * import.
 */
export function detectMissingUseClient(content: string): string[] {
  const importRe = /import\s*(?:type\s+)?\{([^}]+)\}\s*from\s*['"]@barefootjs\/client['"]/g
  const hits = new Set<string>()
  for (const m of content.matchAll(importRe)) {
    // Skip `import type { ... }` — type imports erase at compile time and
    // never run, so they don't require the client runtime.
    if (/import\s+type/.test(m[0])) continue
    for (const raw of m[1].split(',')) {
      // Handle `as` aliases — the imported binding is what matters.
      const imported = raw.trim().split(/\s+as\s+/)[0].trim()
      // Type-only specifiers inside a mixed import (`import { type X, Y }`):
      // strip the `type` keyword and ignore the type binding itself.
      if (imported.startsWith('type ')) continue
      if (BF001_TRIPWIRE_IMPORTS.has(imported)) hits.add(imported)
    }
  }
  return [...hits]
}

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
  tsConfig: { adapter: TemplateAdapter; components?: string[]; outDir?: string; minify?: boolean; contentHash?: boolean; clientOnly?: boolean; transformMarkedTemplate?: (content: string, componentId: string, clientJsPath: string) => string; outputLayout?: OutputLayout; postBuild?: (ctx: PostBuildContext) => Promise<void> | void; externals?: Record<string, ExternalSpec>; externalsBasePath?: string; bundleEntries?: BundleEntry[]; localImportPrefixes?: string[]; runtimeBundle?: 'treeshake' | 'full'; runtimeKeep?: string[] },
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
    localImportPrefixes: tsConfig.localImportPrefixes,
    runtimeBundle: tsConfig.runtimeBundle,
    runtimeKeep: tsConfig.runtimeKeep,
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
 * Lockfile names checked, in order of preference. All matching files found while
 * walking up from `projectDir` are mixed into the global hash, so any
 * dependency upgrade — including ones that only touch transitive deps under
 * `node_modules/@barefootjs/*` — invalidates stale per-entry caches. See
 * piconic-ai/barefootjs#1179 for the original incident: bumping barefootjs to
 * a new git ref via `bun install` did not invalidate cached `*.client.js`
 * outputs that were missing freshly registered hydrations.
 */
const LOCKFILE_NAMES = [
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
] as const

/**
 * Walk up from `projectDir` to the filesystem root and return the absolute
 * path of the nearest lockfile, or null if none is found. In a monorepo the
 * lockfile typically lives at the workspace root rather than inside the
 * package directory that hosts `barefoot.config.ts`.
 */
async function findNearestLockfile(projectDir: string): Promise<string | null> {
  let dir = projectDir
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const name of LOCKFILE_NAMES) {
      const candidate = resolve(dir, name)
      if (await fileExists(candidate)) return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
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
 *
 * The nearest lockfile is also mixed in so any `bun install` (or equivalent)
 * that changes installed dependencies — including bumping a git-ref pin of
 * `barefootjs` itself — discards the cache. Per-entry `deps` only track
 * consumer source files, so without this the cache has no signal that
 * `node_modules` content has changed.
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
  const lockfile = await findNearestLockfile(config.projectDir)
  if (lockfile) {
    const bytes = await readBytes(lockfile)
    parts.push(`lockfile:${basename(lockfile)}:${hashBytes(bytes)}`)
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

  // Load cache (discard if global invalidation flag is set). The on-disk file
  // is read independently of `force` so we can still bootstrap the emit
  // ledger below — `--force` should drop compile decisions, not the record
  // of which output files this build owns.
  const globalHash = await computeGlobalHash(config)
  const onDiskCache = await loadCache(config.outDir)
  const loadedCache = force ? null : onDiskCache
  const cache: BuildCache =
    loadedCache && loadedCache.globalHash === globalHash
      ? loadedCache
      : emptyCache(globalHash)
  const nextEntries: Record<string, CacheEntry> = {}
  let anyOutputChanged = false

  // Load the durable emit ledger. The ledger persists across `--force` and
  // any globalHash invalidation (`bun install`, `barefoot.config.ts` edits),
  // so the cleanup pass at step 5 always knows what the previous build owned
  // on disk — even when the per-entry cache was discarded.
  //
  // First run after upgrade has no `.bfemit.json` yet; fall back to projecting
  // the cache file's `entries[*].outputs` into ledger shape so pre-existing
  // orphans get pruned on the first new-style build. See piconic-ai/barefootjs#1455.
  const loadedLedger = await loadEmitLedger(config.outDir, config.projectDir)
  const previousEmitEntries: Record<string, string[]> =
    loadedLedger?.entries ?? extractLedgerFromCache(onDiskCache)

  // 1. Locate the prebuilt runtime dist file (reactive inlined) that
  //    `barefoot.js` gets produced from — either copied verbatim
  //    (`runtimeBundle: 'full'`) or bundled down to only the exports this
  //    project uses (`runtimeBundle: 'treeshake'`, the default; see step 6d).
  //    The sibling `./runtime` entry keeps `@barefootjs/client/reactive` as
  //    an external import so downstream bundlers can dedupe it against the
  //    main entry; when we ship a file for the browser to load directly, we
  //    need the self-contained build.
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

  const runtimeMode: 'treeshake' | 'full' = config.runtimeBundle ?? 'treeshake'

  if (runtimeMode === 'full') {
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
  }
  // `runtimeMode === 'treeshake'`: barefoot.js is produced at step 6d, once
  // every component's (and bundleEntries'/externals') final client JS is
  // known, so the used-export collection sees everything.

  // 1b. Externals — copy vendor chunks, emit importmap + barefoot-externals.json
  const { changed: externalsChanged, allExternals, outfiles: externalOutfiles } =
    await processExternals(config, runtimeSubdir, runtimeOutDir)
  if (externalsChanged) anyOutputChanged = true

  // 1c. bundleEntries entries — bundle with esbuild using auto-applied externals.
  // (Its outputs land in `nextEntries` via the cache row below, same as
  // component entries — step 6d's scan picks them up from there, so the
  // return value here only needs `changed`.)
  const { changed: bundleEntriesChanged } =
    await processBundleEntries(config, clientJsOutDir, clientJsSubdir, allExternals, cache, nextEntries, force)
  if (bundleEntriesChanged) anyOutputChanged = true

  // 2. Discover component files
  const allFiles: string[] = []
  for (const dir of config.componentDirs) {
    allFiles.push(...await discoverComponentFiles(dir))
  }

  // 3. Manifest baseline (runtime sentinel always present)
  const manifest: Record<string, { clientJs?: string; markedTemplate: string; stubDeps?: string[] }> = {
    '__barefoot__': { markedTemplate: '', clientJs: `${runtimeSubdir}/barefoot.js` },
  }

  let compiledCount = 0
  let skippedCount = 0
  let cachedCount = 0
  let errorCount = 0

  // Sources whose compile errored this run. We preserve their previous
  // outputs at the cleanup pass below so a single broken component
  // doesn't take down the last-known-good outputs of other (clean)
  // components, AND a `--force` build that hits a transient error
  // doesn't delete cached client JS that the dev's browser is still
  // loading. See PR #1469 review.
  const failedSources = new Set<string>()

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

  // Lazy child-shape pre-pass (#2131): must run before the FIRST entry that
  // actually compiles (cache-fresh builds skip it entirely, keeping no-op
  // builds free). One flag, not per-entry — `registerAdapterChildShapes`
  // walks the whole corpus once and registration is idempotent.
  let childShapesRegistered = false
  const ensureChildShapesRegistered = (): void => {
    if (childShapesRegistered) return
    childShapesRegistered = true
    registerAdapterChildShapes(config.adapter, allFiles, sourceContents, getSharedProgram())
  }

  // 4. Compile each component (or reuse from cache)
  for (const entryPath of allFiles) {
    const sourceContent = sourceContents.get(entryPath)!
    if (!hasUseClientDirective(sourceContent)) {
      // BF001 surface check (#1442). The analyzer raises BF001 when a
      // component imports reactive primitives without `'use client'`, but
      // the CLI used to drop these files at the skip-gate above, so the
      // diagnostic never reached the user — their component would be
      // compiled to plain HTML, ship zero client JS, and look broken in
      // the browser with no console output. Mirror just the import-side
      // check here so the same situation prints the analyzer's message.
      const missing = detectMissingUseClient(sourceContent)
      if (missing.length > 0) {
        console.error(`Errors compiling ${relative(config.projectDir, entryPath)}:`)
        console.error(
          `  BF001: 'use client' directive required — imports reactive primitive(s) from @barefootjs/client: ${missing.join(', ')}`,
        )
        errorCount++
        failedSources.add(entryPath)
        continue
      }
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

    ensureChildShapesRegistered()
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
      failedSources.add(entryPath)
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
      compiledClientJs: result.compiledClientJs,
    }
  }

  // 5. Prune outputs whose source no longer contributes to the current build.
  //    Source of truth is the durable emit ledger (`previousEmitEntries`),
  //    not `cache.entries`: the cache is wiped by `--force` and by any
  //    globalHash change (lockfile / config edits), and a cache-driven
  //    cleanup pass would then leave orphans behind. See piconic-ai/barefootjs#1455.
  //
  //    Compute orphans as the set difference of previously-emitted paths
  //    minus paths the current build is producing. Anything in that
  //    difference is owned by us, lives in `outDir`, and no longer has a
  //    current source — unlink it.
  const currentEmitSet = new Set<string>()
  for (const entry of Object.values(nextEntries)) {
    for (const output of entry.outputs) currentEmitSet.add(output)
  }
  // Failure preservation. A source that errored this run still owns its
  // previous outputs on disk — deleting them would turn a transient
  // compile error into a broken-build cascade (the dev's browser
  // suddenly 404s on the file it was reloading, the manifest still
  // references the cached entry's previous emit). The cached-entry
  // carry-forward above handles the case where the cache had a row for
  // the entry, but `--force` and globalHash flips reset the cache to
  // empty even when the previous build's outputs are still on disk.
  // Re-add those outputs to `currentEmitSet` so the orphan diff treats
  // them as still owned for this run.
  for (const sourceKey of failedSources) {
    const prior = previousEmitEntries[sourceKey]
    if (prior) {
      for (const output of prior) currentEmitSet.add(output)
    }
  }
  const orphanedOutputs = new Set<string>()
  for (const previousOutputs of Object.values(previousEmitEntries)) {
    for (const output of previousOutputs) {
      if (!currentEmitSet.has(output)) orphanedOutputs.add(output)
    }
  }
  // Containment guard: `.bfemit.json` / `.buildcache.json` are on-disk
  // inputs that the build re-reads next run, so a corrupted or tampered
  // file could contain absolute paths or `..` segments that resolve
  // outside `outDir`. Refuse to unlink anything that escapes — the
  // ledger only ever owns files the build itself emitted, and those are
  // always under `outDir`.
  //
  // Use `relative()` + `isAbsolute()` rather than a `startsWith(outDir +
  // '/')` substring check so this stays correct on Windows, where
  // `resolve()` returns paths separated by `\\` and the hardcoded `/`
  // would never match.
  const outDirAbs = resolve(config.outDir)
  for (const output of orphanedOutputs) {
    const abs = resolve(config.outDir, output)
    const rel = relative(outDirAbs, abs)
    // Reject the empty / `.` case explicitly: a tampered ledger entry
    // of `""` or `"."` resolves to `outDir` itself, which would attempt
    // `unlink(outDir)`. The catch below swallows the EISDIR/ENOENT,
    // but the cleanup pass should never even consider those inputs.
    const escapes =
      rel === '' || rel === '.' || rel.startsWith('..') || isAbsolute(rel)
    if (escapes) {
      console.warn(
        `Warning: refusing to delete out-of-tree path from emit ledger: ${output}`,
      )
      continue
    }
    try {
      await unlink(abs)
      anyOutputChanged = true
      console.log(`Deleted: ${output}`)
    } catch {
      // already gone
    }
  }

  // 6. Combine parent-child client JS
  //
  // Watch rebuilds load freshly-compiled files (still importing
  // `@barefootjs/client/runtime`) alongside cached siblings whose imports
  // were already rewritten to a relative `./barefoot.js`-shaped path on a
  // previous build. The combine step keys imports by source string, so
  // those two forms would emit two separate import lines and the later
  // resolveRelativeImports / dedup steps either drop one (wrong path
  // relative to the combined file's location) or leave duplicates that
  // crash with `SyntaxError`. Normalise everything back to the bare
  // module specifier here so combine merges them under a single key —
  // step 6c then rewrites that one import to the correct per-file path.
  //
  // Prefer the cached pre-resolve compiled content (compiledClientJs) over
  // the on-disk file: on incremental builds a cached child's file on disk
  // is the FINAL output from the previous build (post-resolveRelativeImports),
  // which already contains __bf_inline_N IIFEs. Combining that stale content
  // with a freshly-recompiled parent would introduce colliding identifiers
  // once step 6b runs. Using the original compiled content avoids the
  // problem at the source. See piconic-ai/barefootjs#1542.
  const compiledClientJsByKey = new Map<string, string>()
  for (const entry of Object.values(nextEntries)) {
    if (entry.manifestKey && entry.compiledClientJs) {
      compiledClientJsByKey.set(entry.manifestKey, entry.compiledClientJs)
    }
  }
  const RUNTIME_REL_PATH = /from\s+(['"])(?:\.{1,2}\/)+barefoot\.js\1/g
  const clientJsFiles = new Map<string, string>()
  for (const [name, entry] of Object.entries(manifest)) {
    if (!entry.clientJs) continue
    let raw = compiledClientJsByKey.get(name)
    if (!raw) {
      const filePath = resolve(config.outDir, entry.clientJs)
      try {
        raw = await readText(filePath)
      } catch {
        continue
      }
    }
    const canonical = raw.replace(RUNTIME_REL_PATH, `from '@barefootjs/client/runtime'`)
    clientJsFiles.set(name, canonical)
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

  // 6b. Resolve relative imports (idempotent — writeIfChanged keeps it quiet).
  //     Each manifest entry's source-file directory is threaded through so
  //     that a 'use client' component importing a sibling .ts helper (e.g.
  //     `import { useYjs } from './useYjs'` from `src/components/canvas/`)
  //     can locate the helper at its source path and inline it. Without
  //     this the resolver would only search the dist file's directory,
  //     find nothing, and silently strip the import line. See bf#1133.
  const sourceDirsByManifestKey: Record<string, string[]> = {}
  for (const [sourcePath, entry] of Object.entries(nextEntries)) {
    if (entry.manifestKey && !sourcePath.startsWith(BUNDLE_KEY_PREFIX)) {
      sourceDirsByManifestKey[entry.manifestKey] = [dirname(sourcePath)]
    }
  }
  const { errors: resolveErrors, stubDepsByManifestKey } = await resolveRelativeImports({
    distDir: config.outDir,
    manifest,
    sourceDirsByManifestKey,
  })
  // Surface stripped-import diagnostics (BF053) as build errors so they
  // turn into a non-zero exit at `commands/build.ts` instead of silently
  // shipping a bundle that will `ReferenceError` at runtime. See #1227.
  for (const err of resolveErrors) {
    console.error(formatError(err, undefined, { projectDir: config.projectDir }))
    errorCount++
  }

  // Attach stub-rewrite dependencies to manifest entries (and the cache
  // copy that survives across builds) so the per-page script loader can
  // follow them when deciding which `.client.js` files to ship — see
  // issue #1243. `resolveRelativeImports` returns each bundle's stub
  // targets as absolute source paths; convert them to manifest keys
  // here, where the path → key mapping is known via `nextEntries`.
  const entriesByManifestKey = new Map<string, CacheEntry>()
  const manifestKeyByEntryPath = new Map<string, string>()
  for (const [sourcePath, cacheEntry] of Object.entries(nextEntries)) {
    if (cacheEntry.manifestKey) {
      entriesByManifestKey.set(cacheEntry.manifestKey, cacheEntry)
      // `bundle:` entries are synthetic keys for `bundleEntries`
      // (separately-built JS, not project-discovered `.tsx`). A stub
      // target is always a `'use client'` `.tsx` file, so a bundle
      // entry can never be a stub destination — keep it out of the
      // path lookup so we don't accidentally map an unrelated
      // `bundle:foo` key onto a real source path.
      if (!sourcePath.startsWith(BUNDLE_KEY_PREFIX)) {
        manifestKeyByEntryPath.set(sourcePath, cacheEntry.manifestKey)
      }
    }
  }
  for (const [name, depPaths] of Object.entries(stubDepsByManifestKey)) {
    const depKeys: string[] = []
    for (const depPath of depPaths) {
      const depKey = manifestKeyByEntryPath.get(depPath)
      if (depKey) depKeys.push(depKey)
    }
    if (depKeys.length === 0) continue
    depKeys.sort()
    const entry = manifest[name]
    if (entry) entry.stubDeps = depKeys
    const cacheEntry = entriesByManifestKey.get(name)
    if (cacheEntry?.manifestEntry) cacheEntry.manifestEntry.stubDeps = depKeys
  }
  // Drop stale stubDeps from any manifest entry whose current bundle no
  // longer reaches a stub (e.g. the user deleted the imperative call).
  for (const [name, entry] of Object.entries(manifest)) {
    if (entry && !(name in stubDepsByManifestKey) && entry.stubDeps) {
      delete entry.stubDeps
      const cacheEntry = entriesByManifestKey.get(name)
      if (cacheEntry?.manifestEntry) delete cacheEntry.manifestEntry.stubDeps
    }
  }

  // 6d. Runtime bundle — collect the `@barefootjs/client*` exports actually
  //     used across every emitted client JS file (components, bundleEntries,
  //     rebundled externals chunks) and bundle `barefoot.js` down to just
  //     those names plus the always-kept public mount API
  //     (`ALWAYS_KEEP_RUNTIME_EXPORTS`). Must run BEFORE step 6c below: 6c
  //     rewrites `@barefootjs/client*` specifiers to a relative
  //     `./barefoot.js` path, and the collector's AST walk matches on the
  //     original bare specifier.
  //
  //     Scans `nextEntries` (every current-build source's recorded
  //     `outputs`) rather than `manifest`: in `clientOnly` (CSR) projects —
  //     the primary target of tree-shaking, since there's no SSR template to
  //     pair a component's client JS with — `compileEntry` never populates
  //     `manifestKey`/`manifestEntry` (see its `!config.clientOnly &&
  //     markedTemplates.length > 0` gate), so `manifest` only ever has the
  //     `__barefoot__` sentinel row. `outputs` is recorded unconditionally
  //     whenever a source produced client JS, cache-hit or freshly compiled,
  //     so filtering it to `.js` paths (marked templates use the adapter's
  //     own extension, never `.js`) finds every component's compiled output
  //     in both modes. `bundleEntries` outputs are included via this same
  //     path (`processBundleEntries` records them in `nextEntries` too); only
  //     `externals` chunks need adding separately, since those aren't
  //     source-driven cache entries.
  let runtimeKeepHash: string | undefined = cache.runtimeKeepHash
  if (runtimeMode === 'treeshake') {
    if (!domDistFile) {
      console.warn('Warning: @barefootjs/client dist not found. Skipping barefoot.js generation.')
      runtimeKeepHash = undefined
    } else {
      const scanTargets: string[] = [...externalOutfiles]
      for (const entry of Object.values(nextEntries)) {
        for (const rel of entry.outputs) {
          if (rel.endsWith('.js')) scanTargets.push(resolve(config.outDir, rel))
        }
      }
      const collections: RuntimeImportCollection[] = []
      for (const filePath of scanTargets) {
        try {
          collections.push(collectUsedRuntimeExports(await readText(filePath), relative(config.outDir, filePath)))
        } catch {
          // File may not exist (e.g. a manifest entry whose write failed
          // this run) — nothing to scan, not a tree-shake safety concern.
        }
      }
      const merged = mergeRuntimeImportCollections(collections)
      const runtimeOutPath = resolve(runtimeOutDir, 'barefoot.js')

      if (merged.unsafe) {
        // Fallback safety: an import shape the collector can't safely
        // narrow (namespace import, default import, or a dynamic
        // `import()`) was seen somewhere. Ship the full runtime rather than
        // risk stripping an export that's actually reachable through it.
        for (const reason of merged.reasons) {
          console.warn(`Warning: runtime tree-shake — falling back to full runtime copy (${reason})`)
        }
        let runtimeContent: string | Uint8Array
        if (config.minify) {
          runtimeContent = transpile(await readText(domDistFile), { loader: 'js', minify: true })
        } else {
          runtimeContent = await readBytes(domDistFile)
        }
        if (await writeIfChanged(runtimeOutPath, runtimeContent)) {
          anyOutputChanged = true
          console.log(`Generated: ${runtimeSubdir}/barefoot.js (full copy — see warning above)`)
        }
        runtimeKeepHash = undefined
      } else {
        const keepNames = new Set<string>([
          ...ALWAYS_KEEP_RUNTIME_EXPORTS,
          ...(config.runtimeKeep ?? []),
          ...merged.names,
        ])
        const distBytes = await readBytes(domDistFile)
        const nextKeepHash = hashContent(JSON.stringify({
          mode: runtimeMode,
          minify: config.minify,
          distHash: hashBytes(distBytes),
          keep: [...keepNames].sort(),
        }))

        if (nextKeepHash === cache.runtimeKeepHash && await fileExists(runtimeOutPath)) {
          // Nothing that would change barefoot.js's contents has changed —
          // skip re-invoking esbuild.
          runtimeKeepHash = nextKeepHash
        } else {
          try {
            const bundled = await buildRuntimeBundle({
              entrySource: domDistFile,
              workingDir: runtimeOutDir,
              keepNames,
              minify: config.minify,
            })
            if (await writeIfChanged(runtimeOutPath, bundled)) {
              anyOutputChanged = true
              console.log(`Generated: ${runtimeSubdir}/barefoot.js (tree-shaken: ${keepNames.size} exports kept)`)
            }
            runtimeKeepHash = nextKeepHash
          } catch (err) {
            console.warn(
              `Warning: runtime tree-shake bundling failed (${(err as Error).message}); falling back to full runtime copy.`
            )
            const runtimeContent: string | Uint8Array = config.minify
              ? transpile(new TextDecoder().decode(distBytes), { loader: 'js', minify: true })
              : distBytes
            if (await writeIfChanged(runtimeOutPath, runtimeContent)) {
              anyOutputChanged = true
              console.log(`Generated: ${runtimeSubdir}/barefoot.js (full copy — see warning above)`)
            }
            runtimeKeepHash = undefined
          }
        }
      }
    }
  }

  // 6c. Normalize @barefootjs/client* specifiers to the relative barefoot.js
  //     path so the per-source dedup below can collapse multiple specifiers
  //     pointing at the same runtime (watch-rebuild remnants, #1148-hoisted
  //     bare imports). Without it, duplicate named bindings throw
  //     `SyntaxError: Identifier 'X' has already been declared` at hydration.
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
        content = rewriteBarefootClientSpecifiers(content, rel)
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

  // 9. Persist cache and the emit ledger. The ledger is written every build,
  //    regardless of `--force` or globalHash invalidation, so the next build
  //    has an authoritative record of which output files belong to it.
  const nextCache: BuildCache = {
    globalHash,
    entries: nextEntries,
    runtimeKeepHash,
  }
  const nextLedger: EmitLedger = emptyLedger()
  for (const [key, entry] of Object.entries(nextEntries)) {
    if (entry.outputs.length > 0) {
      nextLedger.entries[key] = entry.outputs.slice()
    }
  }
  // Carry the previous ledger row forward for any source that errored
  // this run AND has no current nextEntries row (i.e. `--force` reset
  // the cache so `cached` was undefined when the failure handler ran).
  // Without this, the next build would lose the ownership claim and
  // those outputs would persist on disk forever, untracked. With it,
  // they stay tracked — so if the user later actually deletes the
  // source, the next clean build prunes them correctly.
  for (const sourceKey of failedSources) {
    if (nextLedger.entries[sourceKey]) continue
    const prior = previousEmitEntries[sourceKey]
    if (prior && prior.length > 0) {
      nextLedger.entries[sourceKey] = prior.slice()
    }
  }
  await Promise.all([
    saveCache(config.outDir, nextCache),
    saveEmitLedger(config.outDir, config.projectDir, nextLedger),
  ])

  // 10. On Cloudflare Workers, keep server/build-only outputs out of the
  //     deployed assets by maintaining a `.assetsignore` in outDir (#1651).
  //     Only when the project targets Workers — detected via a wrangler config.
  if (await isCloudflareWorkersProject(config.projectDir)) {
    const ignored = collectServerOnlyAssets({
      devSentinelSubdir: DEV_SENTINEL_SUBDIR,
      templatesSubdir,
      manifest,
      hasExternals: !!config.externals && Object.keys(config.externals).length > 0,
      clientOnly: config.clientOnly,
    })
    if (await writeAssetsIgnore(config.outDir, ignored)) {
      console.log(`Generated: ${ASSETS_IGNORE_FILENAME}`)
    }
  }

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
 * Extract bare (non-relative, non-absolute, non-URL) module specifiers from a
 * source file. Uses TypeScript's lightweight file preprocessor (the same
 * scanner the compiler uses for dependency discovery), so specifiers inside
 * comments and string literals are ignored and `import` / `export … from` /
 * dynamic `import()` / `require()` are all handled without bespoke regexes.
 */
export function extractBareImports(code: string): string[] {
  const { importedFiles } = ts.preProcessFile(code, true, true)
  const specifiers = new Set<string>()
  for (const { fileName } of importedFiles) {
    if (!fileName.startsWith('.') && !fileName.startsWith('/') && !fileName.includes('://')) {
      specifiers.add(fileName)
    }
  }
  return [...specifiers]
}

/**
 * Bare imports in `code` that the emitted importmap cannot resolve. A specifier
 * is resolvable when it matches an importmap key exactly, or a trailing-slash
 * key is a prefix of it. The keys are every configured external plus the
 * always-emitted `@barefootjs/client*` dedup keys (#1646).
 */
function unresolvedBareImports(code: string, externals: Record<string, ExternalSpec>): string[] {
  const keys = new Set<string>([...Object.keys(externals), ...BF_CLIENT_DEDUP_KEYS])
  const isResolved = (spec: string) =>
    keys.has(spec) || [...keys].some(k => k.endsWith('/') && spec.startsWith(k))
  return extractBareImports(code).filter(spec => !isResolved(spec))
}

/**
 * Packages to keep `external` when rebundling a chunk with esbuild: every other
 * configured external plus the always-importmap-resolved `@barefootjs/client*`
 * dedup keys. The three exact dedup keys cover the listed subpaths, and the
 * `@barefootjs/client/*` wildcard keeps any other `@barefootjs/client` subpath
 * a chunk might import external too (esbuild only matches `external` entries
 * exactly unless they contain `*`). The chunk's own package is bundled (that is
 * the point of rebundle), so it is excluded. Without this, esbuild inlines the
 * shared reactive runtime into the chunk and bindings silently stop updating
 * (#1646).
 */
function rebundleExternalsFor(pkgName: string, externals: Record<string, ExternalSpec>): string[] {
  return [...new Set<string>([
    ...Object.keys(externals).filter(k => k !== pkgName),
    ...BF_CLIENT_DEDUP_KEYS,
    '@barefootjs/client/*',
  ])]
}

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
 * Build a relative-import rewriter for a single source-file → emit-file
 * pair. The returned function takes a relative module specifier (as
 * written in the source) and returns the same specifier re-anchored
 * to the emit's on-disk dir.
 *
 * `bf build` mirrors `<componentDir>/<rel>/index.tsx` to
 * `<templatesOutDir>/<rel>/index.tsx`. Crucially, only files under a
 * componentDir get mirrored; everything else (`../../../types`,
 * `../shared/helpers`, …) stays at its source path. The user-authored
 * relative paths were correct from the SOURCE position, but at the
 * EMIT position they resolve at a different depth — so an unmodified
 * `'../../../types'` from `public/components/ui/button/index.tsx`
 * resolves to the non-existent `public/types/` and tsc raises TS2307
 * across the scaffold (#1453).
 *
 * For each relative specifier:
 *   1. Resolve against the SOURCE file's directory → `srcAbs`.
 *   2. If `srcAbs` is under any componentDir, the build emits a mirror
 *      at `<templatesOutDir>/<rel-under-componentDir>` — point the
 *      rewritten path at the mirror so sibling-component imports stay
 *      relative-equivalent. (For the Hono layout this leaves
 *      `'../slot'` unchanged because both ends of the import are
 *      mirrored at matching depth.)
 *   3. Otherwise the file lives only at `srcAbs` — re-relativise from
 *      the OUTPUT file's directory to that source path.
 *
 * Returned function is structural: operates on `ImportInfo.source`
 * strings handed to it by the compiler, not on the emitted text.
 * JSDoc `@example` blocks containing import-shaped code are unaffected.
 * Caller is responsible for guarding bare specifiers — the compiler
 * already does, but this helper assumes its input begins with `.`.
 */
export function buildRelativeImportRewriter(
  sourcePath: string,
  outputPath: string,
  componentDirs: readonly string[],
  templatesOutDir: string,
): (importPath: string) => string {
  const sourceDir = dirname(sourcePath)
  const outputDir = dirname(outputPath)
  const resolvedComponentDirs = componentDirs.map((d) => resolve(d))

  return (importPath: string): string => {
    const srcAbs = resolve(sourceDir, importPath)
    let targetAbs = srcAbs
    for (const componentDir of resolvedComponentDirs) {
      if (srcAbs === componentDir || srcAbs.startsWith(componentDir + '/')) {
        const relUnderComponentDir = srcAbs.slice(componentDir.length + 1)
        targetAbs = relUnderComponentDir
          ? resolve(templatesOutDir, relUnderComponentDir)
          : templatesOutDir
        break
      }
    }
    let rewritten = relative(outputDir, targetAbs)
    if (rewritten === '') rewritten = '.'
    if (!rewritten.startsWith('.')) rewritten = './' + rewritten
    return rewritten
  }
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
 * Line indices (0-based) of `content` that begin a *real* top-level
 * `import` statement, per the TypeScript parser. Used to keep the
 * line-based import passes from acting on `import …` text that only
 * appears inside a string / template literal value. See #1702.
 */
function topLevelImportLines(content: string): Set<number> {
  const lines = new Set<number>()
  const sourceFile = ts.createSourceFile(
    'merge.js',
    content,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.JS,
  )
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile))
      lines.add(line)
    }
  }
  return lines
}

/**
 * Rewrite `@barefootjs/client*` specifiers to the relative `barefoot.js`
 * path `rel`, touching only *real* `import` / `export … from` module
 * specifiers (and dynamic `import('…')` arguments). The predecessor ran a
 * global regex over the whole file, which also rewrote `@barefootjs/client`
 * text that merely lived inside a string / template literal value (e.g. an
 * inlined code-snippet module), corrupting the displayed text. See
 * piconic-ai/barefootjs#1702.
 */
export function rewriteBarefootClientSpecifiers(content: string, rel: string): string {
  if (!content.includes('@barefootjs/client')) return content

  const sourceFile = ts.createSourceFile(
    'client.js',
    content,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.JS,
  )
  const isBarefootClient = (s: string) =>
    s === '@barefootjs/client' || s.startsWith('@barefootjs/client/')

  // Character spans of the specifier string literals to replace.
  const spans: Array<[number, number]> = []

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const ms = node.moduleSpecifier
      if (ms && ts.isStringLiteral(ms) && isBarefootClient(ms.text)) {
        spans.push([ms.getStart(sourceFile), ms.getEnd()])
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0]
      if (arg && ts.isStringLiteral(arg) && isBarefootClient(arg.text)) {
        spans.push([arg.getStart(sourceFile), arg.getEnd()])
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  if (spans.length === 0) return content

  // Apply replacements back-to-front so earlier offsets stay valid.
  spans.sort((a, b) => b[0] - a[0])
  let out = content
  for (const [start, end] of spans) {
    out = out.slice(0, start) + `'${rel}'` + out.slice(end)
  }
  return out
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

  // Cheap pre-scan: are there even two import-shaped lines sharing a source?
  // Step 6c runs this over every emitted client JS file, so short-circuit
  // (and skip the TS parse below) for the common case where nothing can
  // possibly merge.
  {
    const seen = new Set<string>()
    let possibleDuplicate = false
    for (const line of lines) {
      const m = line.match(namedImportRe)
      if (!m) continue
      if (seen.has(m[3])) { possibleDuplicate = true; break }
      seen.add(m[3])
    }
    if (!possibleDuplicate) return content
  }

  // Restrict merging to lines that are *real* top-level import statements.
  // An `import { … } from '…'` line living inside a string / template
  // literal value (e.g. an inlined code-snippet module) matches the regex
  // too, and merging across such lines would silently rewrite the string's
  // contents. See piconic-ai/barefootjs#1702.
  const realImportLines = topLevelImportLines(content)

  lines.forEach((line, idx) => {
    if (!realImportLines.has(idx)) return
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

// The `ExternalsManifest` shape (the `barefoot-externals.json` contract) now
// lives in `@barefootjs/jsx` so adapters and the CLI share one definition.
export type { ExternalsManifest } from '@barefootjs/jsx'

/**
 * Process the `externals` config: copy vendor chunks to outDir, build the
 * importmap JSON, and write `barefoot-externals.json`.
 * Returns whether any output file changed, the full list of external package
 * names, and the local chunk file paths written (for the runtime tree-shake
 * collector at step 6d — a vendor package that itself imports
 * `@barefootjs/client*` keeps that import as a literal specifier in its
 * emitted chunk, since `rebundleExternalsFor`/the plain-copy path both leave
 * `@barefootjs/client*` unbundled).
 */
export async function processExternals(
  config: BuildConfig,
  runtimeSubdir: string,
  runtimeOutDir: string,
): Promise<{ changed: boolean; allExternals: string[]; outfiles: string[] }> {
  if (!config.externals || Object.keys(config.externals).length === 0) {
    return { changed: false, allExternals: [], outfiles: [] }
  }

  const basePath = config.externalsBasePath ?? `/${runtimeSubdir}/`
  const base = basePath.endsWith('/') ? basePath : basePath + '/'

  const imports: Record<string, string> = {}
  const preloads: string[] = []
  const outfiles: string[] = []
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

      const srcFile = entry.path
      const filename = vendorChunkFilename(pkgName)
      const destPath = resolve(runtimeOutDir, filename)
      outfiles.push(destPath)

      if (wantRebundle) {
        await esbuildBuild({
          entryPoints: [srcFile],
          outfile: destPath,
          format: 'esm',
          bundle: true,
          minify: config.minify ?? false,
          external: rebundleExternalsFor(pkgName, config.externals),
        })
        anyChanged = true
        console.log(`Generated (bundled): ${runtimeSubdir}/${filename}`)
      } else {
        const bytes = await readBytes(srcFile)
        const text = new TextDecoder().decode(bytes)

        // Warn only about bare imports the importmap can't resolve. The resolved
        // file came from an import/main fallback (no umd/unpkg/jsdelivr), but a
        // chunk whose only externals are the always-importmap-resolved
        // @barefootjs/client* dedup keys is browser-ready in a BarefootJS app —
        // a warning here is a false positive (#1646).
        if (!entry.isBrowserReady) {
          const unresolved = unresolvedBareImports(text, config.externals)
          if (unresolved.length > 0) {
            console.warn(
              `Warning: externals — "${pkgName}" resolved via import/main entry (no umd/unpkg/jsdelivr found) ` +
              `and imports packages not in the importmap: ${unresolved.join(', ')}. ` +
              `These are not browser-ready. Set rebundle: true to re-bundle it into a self-contained ESM file.`
            )
          }
        }

        let content: string | Uint8Array = bytes
        if (config.minify) {
          content = transpile(text, { loader: 'js', minify: true })
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

  // Template-string adapters (Go html/template, Mojolicious EP) have no
  // component layer like Hono's `BfImportMap`, so emit a ready-to-include
  // importmap snippet they can `{{ template }}` / `%= include` into <head>
  // (#1644). Component adapters inject the importmap at render time instead.
  if (config.adapter.importMapInjection === 'html-snippet') {
    const snippetPath = resolve(config.outDir, 'barefoot-importmap.html')
    if (await writeIfChanged(snippetPath, renderImportMapHtml(manifest))) {
      anyChanged = true
      console.log('Generated: barefoot-importmap.html')
    }
  }

  return { changed: anyChanged, allExternals, outfiles }
}

/**
 * Bundle entries listed in `config.bundleEntries` directly with esbuild.
 * Each entry is compiled as an ESM bundle with all externals from
 * `config.externals` (plus any per-entry overrides) excluded from the bundle.
 * `@barefootjs/client*` is always implicitly external (see #927).
 *
 * Results are cached by source+deps hash. Dependencies are harvested from
 * esbuild's metafile on first build (project-local files only — node_modules
 * and externals are excluded). On subsequent runs, the entry is rebuilt only
 * if the source or any dep hash has changed, or the output file is missing.
 *
 * `outfiles` in the return value lists every entry's output path (cache-hit
 * or freshly built) so the runtime tree-shake collector at step 6d can scan
 * them too — `@barefootjs/client*` is always kept external here (see below),
 * so a bundle entry like `client/router-entry.ts` importing `setupStreaming`
 * from `@barefootjs/client/runtime` keeps that import verbatim in its output.
 */
export async function processBundleEntries(
  config: BuildConfig,
  clientJsOutDir: string,
  clientJsSubdir: string,
  allExternals: string[],
  cache: BuildCache,
  nextEntries: Record<string, CacheEntry>,
  force: boolean,
): Promise<{ changed: boolean; outfiles: string[] }> {
  if (!config.bundleEntries || config.bundleEntries.length === 0) return { changed: false, outfiles: [] }

  let anyChanged = false
  const outfiles: string[] = []
  for (const entry of config.bundleEntries) {
    // `@barefootjs/client*` is always external for bundled entries: in a
    // BarefootJS app it resolves through the page's import map to the same
    // `barefoot.js` the compiled islands import, so inlining it here would
    // fork the reactive runtime (duplicate signals — #927). These keys are
    // implicit so configs don't have to repeat them per entry; `allExternals`
    // already carries them when `externals` is configured, and the Set dedups.
    const entryExternals = [
      ...new Set([...BF_CLIENT_DEDUP_KEYS, ...allExternals, ...(entry.externals ?? [])]),
    ]
    const outfilePath = resolve(clientJsOutDir, entry.outfile)
    outfiles.push(outfilePath)
    const absEntry = resolve(entry.entry)
    const cacheKey = `${BUNDLE_KEY_PREFIX}${absEntry}`

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
  return { changed: anyChanged, outfiles }
}

// ── Cross-file child-shape pre-pass ──────────────────────────────────────

/**
 * Register every discovered component's cross-component shape on the adapter
 * before any entry compiles (#2131). Adapters that pre-compute child props at
 * the call site (the Go template adapter) route an attribute that is NOT a
 * declared child param into the child's rest bag (`Props map[string]any`) —
 * but only when the child's shape was registered first. The adapter-tests
 * harness always did this (`registerChildShape` in test-render.ts); the CLI
 * never did, so `bf build` emitted rest-spread attrs as named struct fields
 * (`Placeholder:` on `InputInput`) and the generated components.go failed
 * `go build` with `unknown field ...`.
 *
 * Metadata-only: `analyzeComponent` + `buildMetadata` per exported component,
 * no IR/codegen. Adapters without the hook (Hono, Mojo, ...) cost one method
 * probe. Failures are non-fatal — a file that can't be analyzed contributes
 * no shape and the affected parent keeps the pre-registration behaviour; the
 * real compile of that file still reports its errors through `compileEntry`.
 */
function registerAdapterChildShapes(
  adapter: TemplateAdapter,
  allFiles: string[],
  sourceContents: Map<string, string>,
  program: ts.Program | undefined,
): void {
  const hook = (adapter as { registerChildComponentShape?: (ir: { metadata: IRMetadata }) => void })
    .registerChildComponentShape
  if (typeof hook !== 'function') return
  for (const filePath of allFiles) {
    const source = sourceContents.get(filePath)
    if (!source) continue
    try {
      for (const componentName of listComponentFunctions(source, filePath)) {
        const ctx = analyzeComponent(source, filePath, componentName, program)
        if (!ctx.jsxReturn) continue
        hook.call(adapter, { metadata: buildMetadata(ctx) })
      }
    } catch {
      // Fail open (see docstring).
    }
  }
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
      manifestEntry?: { markedTemplate: string; clientJs?: string; stubDeps?: string[]; ssrDefaults?: Record<string, unknown> }
      wroteAny: boolean
      types?: string
      typesKey?: string
      compiledClientJs?: string
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

  // Relative imports authored from `<componentDir>/<rel>/index.tsx` need
  // to keep resolving to the same files after the template is mirrored
  // to `<templatesOutDir>/<rel>/index.tsx`. The output path is
  // computable here from the source-path layout — the marked template's
  // basename is taken verbatim from the source, and outDir mirroring is
  // a build-pipeline invariant. See #1453 for the failure mode.
  const presumedOutputPath = resolve(
    templatesOutDir,
    baseFileName.replace(/\.tsx?$/, config.adapter.extension),
  )
  const rewriteRelativeImport = buildRelativeImportRewriter(
    entryPath,
    presumedOutputPath,
    config.componentDirs,
    templatesOutDir,
  )

  const result = compileJSX(
    sourceContent,
    entryPath,
    {
      adapter: config.adapter,
      program: sharedProgram,
      // Match the on-disk client bundle filename so adapters that
      // bake the URL at codegen time (e.g. go-template's
      // `Scripts.Register`) point at the file we actually emit.
      scriptBaseName: baseNameNoExt,
      // The CLI compiles every .tsx under the configured source dirs
      // in one pass and registers all generated templates on the same
      // template instance at render time, so the cross-template
      // lookups BF103 warns about resolve correctly. Tell the adapter
      // it can suppress that diagnostic for CLI-managed builds.
      siblingTemplatesRegistered: true,
      localImportPrefixes: config.localImportPrefixes,
      rewriteRelativeImport,
    },
  )

  const errors = result.errors.filter(e => e.severity === 'error')
  const warnings = result.errors.filter(e => e.severity === 'warning')

  // Use `formatError` so each diagnostic carries its BF code, source
  // location, code frame, and (when present) `= help` suggestion —
  // the exact shape `docs/core/advanced/error-codes.md` and the
  // per-code prose in `docs/core/reactivity/props-reactivity.md`
  // promise the user. The bare `console.error(error.message)` shape
  // this replaced dropped the code + loc + frame + suggestion, so
  // documented codes like BF023 / BF030 / BF043 effectively did not
  // exist from the CLI surface.
  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(formatError(warning, sourceContent, { projectDir: config.projectDir }))
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(formatError(error, sourceContent, { projectDir: config.projectDir }))
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
      // Relative-import re-anchoring (#1453) happens upstream inside
      // compileJSX via `rewriteRelativeImport` — operates on structured
      // `ImportInfo.source` strings, so JSDoc / template-literal text is
      // untouched.
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
  let manifestEntry: { markedTemplate: string; clientJs?: string; ssrDefaults?: Record<string, unknown> } | undefined
  if (!config.clientOnly && markedTemplates.length > 0) {
    const primaryTpl =
      markedTemplates.find(t => effectiveOutName(t.path, baseNameNoExt).startsWith(baseNameNoExt + '.'))
      ?? markedTemplates[0]
    manifestKey = baseNameNoExt
    // Pair the SSR-defaults JSON to the primary template by basename.
    // The jsx package emits one ssr-defaults file per generated template
    // (multi-component-per-file adapters emit per-component pairs); pick
    // whichever sits next to the primary template.
    const primaryBase = primaryTpl.path.replace(/\.[^.]+$/, '').replace(/\.html$/, '')
    const ssrDefaultsFile =
      result.files.find(
        f => f.type === 'ssrDefaults' && f.path === primaryBase + '.ssr-defaults.json',
      ) ?? result.files.find(f => f.type === 'ssrDefaults')
    let ssrDefaults: Record<string, unknown> | undefined
    if (ssrDefaultsFile) {
      try {
        ssrDefaults = JSON.parse(ssrDefaultsFile.content) as Record<string, unknown>
      } catch {
        ssrDefaults = undefined
      }
    }
    manifestEntry = {
      markedTemplate: `${templatesSubdir}/${effectiveOutName(primaryTpl.path, baseNameNoExt)}`,
      clientJs: hasClientJs ? `${clientJsSubdir}/${clientJsFilename}` : undefined,
      ...(ssrDefaults ? { ssrDefaults } : {}),
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
    compiledClientJs: clientJsContent || undefined,
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
 * Written at `<outDir>/.dev/build-id` whenever output actually changed on
 * disk — so a touch-save that produces no diff does not trigger a reload.
 *
 * Errors elsewhere in the build do not block the sentinel: errored entries
 * preserve their prior cache row (so their on-disk output stays consistent),
 * and other entries that compiled cleanly still write their fresh outputs.
 * Suppressing the reload whenever *any* file errored would mean a single
 * persistently-broken component in the project (e.g. one that the active
 * adapter cannot lower yet) silently disables auto-reload for the entire
 * app — the user edits a working file, sees nothing happen in the browser,
 * and has no obvious cause. Firing on `changed` lets the browser pick up
 * every successful incremental edit while the compile errors stay visible
 * in the watch terminal.
 */
async function writeBuildId(outDir: string, result: BuildResult): Promise<void> {
  if (!result.changed) return
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

  // Fingerprint every component source file. Used after each rebuild to
  // detect (a) edits that raced the readText snapshot taken by `build()`,
  // and (b) edits whose inotify event was dropped by the recursive
  // `fs.watch` iterator on Linux. Either way, the next rebuild's hash
  // check would otherwise treat the now-stale cache as fresh and skip
  // recompilation. By snapshotting hashes here and comparing on a
  // post-build pass, we self-heal both scenarios without requiring a
  // user keypress to nudge the watcher back to life.
  //
  // mtime cache co-keyed with the hash cache: on the steady-state polling
  // path (no edits), `snapshotHashes` only needs to `stat` each file. It
  // re-reads + re-hashes only when the mtime advances, which keeps the
  // baseline I/O cost of the 2s poll loop bounded to one stat per file
  // instead of one full read per file — meaningful on larger projects
  // and on slower filesystems where reads dominate.
  const lastSeenHashes = new Map<string, string>()
  const lastSeenMtimes = new Map<string, number>()
  const snapshotHashes = async (): Promise<Map<string, string>> => {
    const snap = new Map<string, string>()
    const entries: string[] = []
    for (const dir of config.componentDirs) {
      entries.push(...await discoverComponentFiles(dir))
    }
    await Promise.all(entries.map(async (entry) => {
      try {
        const s = await stat(entry)
        const mtimeMs = s.mtimeMs
        const cachedMtime = lastSeenMtimes.get(entry)
        const cachedHash = lastSeenHashes.get(entry)
        // mtime unchanged AND we already have a hash for this file →
        // skip the read; reuse last-known hash. This is the fast path
        // the poll loop hits when nothing has been edited.
        if (cachedMtime === mtimeMs && cachedHash !== undefined) {
          snap.set(entry, cachedHash)
          return
        }
        const hash = hashContent(await readText(entry))
        lastSeenMtimes.set(entry, mtimeMs)
        snap.set(entry, hash)
      } catch {
        // File deleted between enumeration and read — ignore; the
        // next rebuild will pick up the deletion via cache invalidation.
      }
    }))
    return snap
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

    // Post-build revalidation. Re-hash every source and reschedule if any
    // file changed since the build snapshot — this is what recovers from
    // the "edit raced the build's readText" failure mode where the user
    // saved twice in quick succession and the second save landed mid-flush.
    const after = await snapshotHashes()
    let staleAfterBuild = false
    for (const [file, hash] of after) {
      if (lastSeenHashes.get(file) !== hash) {
        lastSeenHashes.set(file, hash)
        staleAfterBuild = true
      }
    }
    if (staleAfterBuild && !pending) {
      // Don't go quiet here — a second rebuild that the user didn't trigger
      // via fs.watch can otherwise look like a flake. The trailing tick
      // catches up to whatever the disk actually shows.
      schedule()
    }
  }

  // Seed the fingerprint map with the post-initial-build state so the
  // first user edit registers as "changed".
  for (const [file, hash] of await snapshotHashes()) lastSeenHashes.set(file, hash)

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

  // Belt-and-suspenders poll. Linux's recursive `fs.watch` iterator has
  // a known fragility where the AsyncIterable can stop yielding events
  // after the first batch in some workloads — leaving the watch process
  // alive but functionally dead. A hash-diff poll catches missed edits
  // via the same `snapshotHashes` mechanism used by the post-build
  // revalidation.
  //
  // Steady-state cost: `snapshotHashes` re-stats every file but only
  // re-hashes when its mtime advances, so an idle project pays one stat
  // per file per tick — sub-millisecond on typical corpora. Adaptive
  // backoff: 2s while there's recent activity, doubling up to 30s after
  // ten consecutive idle ticks, snapping back to 2s as soon as anything
  // changes. The window stays responsive during edit bursts while
  // avoiding steady I/O on long-idle sessions.
  const pollMinMs = 2000
  const pollMaxMs = 30000
  const idleTicksUntilBackoff = 10
  let pollIntervalMs = pollMinMs
  let idleTicks = 0
  const pollLoop = async () => {
    while (signal?.aborted !== true) {
      await new Promise((r) => setTimeout(r, pollIntervalMs))
      const snap = await snapshotHashes()
      let changed = false
      for (const [file, hash] of snap) {
        if (lastSeenHashes.get(file) !== hash) {
          lastSeenHashes.set(file, hash)
          changed = true
        }
      }
      // Detect deletions too, so cache invalidation can fire on rm.
      for (const file of lastSeenHashes.keys()) {
        if (!snap.has(file)) {
          lastSeenHashes.delete(file)
          lastSeenMtimes.delete(file)
          changed = true
        }
      }
      if (changed) {
        // Reset backoff: the project just went non-idle. Schedule a
        // rebuild if one isn't already queued by the inotify path.
        pollIntervalMs = pollMinMs
        idleTicks = 0
        if (!pending) schedule()
      } else {
        idleTicks++
        if (idleTicks >= idleTicksUntilBackoff && pollIntervalMs < pollMaxMs) {
          pollIntervalMs = Math.min(pollIntervalMs * 2, pollMaxMs)
        }
      }
    }
  }

  await Promise.all([
    ...componentRoots.map((r) => watchRoot(r, true)),
    watchRoot(configRoot, false),
    pollLoop(),
  ])
}

