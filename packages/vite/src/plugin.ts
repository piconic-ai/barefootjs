/**
 * `@barefootjs/vite` — takes over the client-asset half of `bf build`.
 * Vite/Rollup owns bundling, hashing, chunking, tree-shaking and
 * minification; BarefootJS keeps only the JSX → (template, client JS)
 * compile. See `spike-findings.md` (R1-R3) for the mechanics this plugin
 * is built on, and the design doc for the two-engine architecture:
 *
 *   1. graph pass (`transform`) — Rollup visits `.tsx` modules it can
 *      reach from `build.rollupOptions.input`; this plugin compiles each
 *      one and hands back plain client JS for Rollup to bundle, hash,
 *      tree-shake, chunk, and minify like any other module.
 *   2. eager pass (`writeBundle`) — walks every `.tsx` under `components`
 *      directly, NOT via the module graph. Server-only components (no
 *      `'use client'`) never appear in the graph at all (nothing imports
 *      them as a script, so Rollup never visits them) but still need a
 *      template — this pass is the only place that happens. Runs in
 *      `writeBundle` specifically because the Vite manifest is only final
 *      once Rollup has finished hashing output filenames.
 *
 * Both passes share one `CompileCache` (§4) so a given file's content is
 * compiled at most twice: once canonically (`scriptAssets: []`, cached,
 * shared by both passes — this is the ONLY compile a server-only file, or
 * any file whose real `scriptAssets` also turns out to be `[]`, ever
 * needs) and, only for a `'use client'` file whose manifest entry resolves
 * to a non-empty URL list, one further compile with the real
 * `scriptAssets` to bake the correct URL into the template. That second
 * compile is unavoidable within `compileJSX`'s current API shape: a
 * component's template and its client JS are produced by ONE call, but
 * only the template depends on `scriptAssets` (client JS comes from an
 * entirely separate codegen path `adapter.generate()` never touches) — and
 * `scriptAssets` can't be known until Rollup has already hashed the
 * bundle, which requires `transform` to have already run. So `transform`
 * unavoidably compiles once per file before the real URL exists, and
 * `writeBundle` MUST recompile once more, only for the strict subset of
 * files whose true `scriptAssets` differs from the cached `[]` canonical
 * form, to get a template with the correct URL baked in.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import {
  compileJSX,
  formatError,
  type CompileResult,
} from '@barefootjs/jsx'
import type { BarefootViteOptions } from './types.ts'
import { CompileCache } from './compile-cache.ts'
import { discoverComponents, type DiscoveredComponent } from './discover.ts'
import { resolveClientJsSpecifier } from './resolve-client-js.ts'
import { buildRelativeImportRewriter, toPosixRelative } from './paths.ts'
import { loadManifest, resolveScriptAssets } from './manifest.ts'
import { planEmits, writeEmits } from './emit.ts'

const PLUGIN_NAME = 'barefoot'

function reportErrors(result: CompileResult, source: string, projectDir: string): void {
  const errors = result.errors.filter(e => e.severity === 'error')
  const warnings = result.errors.filter(e => e.severity === 'warning')
  for (const warning of warnings) {
    console.warn(formatError(warning, source, { projectDir }))
  }
  if (errors.length > 0) {
    const messages = errors.map(e => formatError(e, source, { projectDir })).join('\n\n')
    throw new Error(`[${PLUGIN_NAME}] compile failed:\n\n${messages}`)
  }
}

export function barefoot(options: BarefootViteOptions): Plugin {
  const cache = new CompileCache()

  // Populated (redundantly but cheaply — a directory walk, no compiling)
  // once in `config` with a best-effort root, so `rollupOptions.input` can
  // be set; then again in `configResolved` with Vite's authoritative
  // `root`, which is what `resolveId` / `transform` / `writeBundle` use.
  let componentDirs: string[] = []
  let templatesDir = ''
  let resolvedConfig: ResolvedConfig | undefined

  // Re-anchors a relative import written in `absPath` so it still resolves
  // once the template is emitted under `templatesDir`. Pure function of
  // (absPath, componentDirs, templatesDir) — safe to compute for every
  // compile, including the canonical `transform`-time one where it's
  // unused (client JS generation never reads `rewriteRelativeImport`).
  function rewriterFor(absPath: string): (importPath: string) => string {
    const outputPathGuess = resolve(templatesDir, toPosixRelative(resolvedConfig!.root, absPath))
    return buildRelativeImportRewriter(absPath, outputPathGuess, componentDirs, templatesDir)
  }

  function compileCanonical(absPath: string, content: string): CompileResult {
    return cache.getOrCompile(absPath, content, () =>
      compileJSX(content, absPath, {
        adapter: options.adapter,
        sourceMaps: true,
        // The canonical, cacheable compile always uses an empty
        // scriptAssets ("no scripts") — the one input every discovered
        // file (server-only or client) shares regardless of its eventual
        // manifest entry. Everything except the template's script
        // registration is identical no matter what `scriptAssets` is, so
        // this single compile is reused as-is for every server-only
        // component and any client component that turns out to need no
        // scripts. See this module's docstring.
        scriptAssets: [],
        rewriteRelativeImport: rewriterFor(absPath),
      }),
    )
  }

  function isUnderComponentDir(absPath: string): boolean {
    return componentDirs.some(dir => absPath === dir || absPath.startsWith(`${dir}/`))
  }

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',

    async config(userConfig) {
      // Best-effort root for the eager discovery this hook needs to set
      // `rollupOptions.input` — Vite hasn't resolved the real root yet at
      // this point in its own lifecycle (that only exists once
      // `configResolved` fires), so this assumes the common case of
      // running Vite from the project root with no `root` override. If
      // that assumption doesn't hold for a given project, `configResolved`
      // still recomputes everything `resolveId`/`transform`/`writeBundle`
      // actually use against Vite's real resolved root — only the
      // convenience `rollupOptions.input` keys this hook picks could be
      // off, not correctness.
      const guessedRoot = userConfig.root ? resolve(process.cwd(), userConfig.root) : process.cwd()
      const dirs = options.components.map(d => resolve(guessedRoot, d))
      const found = await discoverComponents(dirs, absPath => readFile(absPath, 'utf8'))

      const input: Record<string, string> = {}
      for (const c of found) {
        if (!c.isClient) continue
        input[toPosixRelative(guessedRoot, c.absPath)] = c.absPath
      }

      return {
        appType: 'custom',
        build: {
          manifest: true,
          rollupOptions: { input },
        },
      }
    },

    configResolved(config) {
      resolvedConfig = config
      componentDirs = options.components.map(d => resolve(config.root, d))
      templatesDir = resolve(config.root, options.templates)
    },

    resolveId(source, importer) {
      return resolveClientJsSpecifier(source, importer)
    },

    transform(code, id) {
      if (!id.endsWith('.tsx')) return null
      if (!isUnderComponentDir(id)) return null

      const result = compileCanonical(id, code)
      reportErrors(result, code, resolvedConfig?.root ?? process.cwd())

      const clientJs = result.files.find(f => f.type === 'clientJs')
      if (!clientJs) return null

      const map = result.files.find(f => f.type === 'sourceMap' && f.path === `${clientJs.path}.map`)
      return {
        code: clientJs.content,
        map: map ? JSON.parse(map.content) : null,
      }
    },

    async writeBundle() {
      const config = resolvedConfig
      if (!config) return

      // Authoritative discovery — Vite's real root, not `config`'s guess.
      const discovered: DiscoveredComponent[] = await discoverComponents(
        componentDirs,
        absPath => readFile(absPath, 'utf8'),
      )

      const outDir = resolve(config.root, config.build.outDir)
      const manifest = await loadManifest(outDir, config.build.manifest)

      for (const component of discovered) {
        const content = await readFile(component.absPath, 'utf8')
        const canonical = compileCanonical(component.absPath, content)
        reportErrors(canonical, content, config.root)

        let result = canonical
        if (component.isClient) {
          const manifestKey = toPosixRelative(config.root, component.absPath)
          const scriptAssets = resolveScriptAssets(manifest, manifestKey, config.base)
          if (scriptAssets.length > 0) {
            result = compileJSX(content, component.absPath, {
              adapter: options.adapter,
              sourceMaps: true,
              scriptAssets,
              rewriteRelativeImport: rewriterFor(component.absPath),
            })
            reportErrors(result, content, config.root)
          }
        }

        const targets = planEmits(result, component.absPath, componentDirs, options.adapter)
        await writeEmits(templatesDir, targets)
      }
    },
  }
}
