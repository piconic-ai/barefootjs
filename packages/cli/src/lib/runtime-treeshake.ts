// Per-project tree-shaking of the client runtime bundle (`barefoot.js`).
//
// `bf build` compiles every component's client JS against the full
// `@barefootjs/client/runtime` surface, but a given project only ever calls
// a fraction of it. This module collects the *named* runtime imports that
// actually appear across a project's emitted client JS (components,
// `bundleEntries`, rebundled `externals` chunks) so `build.ts` can bundle a
// `barefoot.js` containing only those exports (plus an always-kept public
// mount API — see `ALWAYS_KEEP_RUNTIME_EXPORTS`) instead of shipping the
// entire runtime verbatim.
//
// Per CLAUDE.md: never parse imports with regex. This walks the TypeScript
// AST over top-level statements, the same pattern `shapeFromDecl` in
// `resolve-imports.ts` uses — so multi-line import clauses, `import type`,
// and specifiers that merely appear inside a comment or string literal are
// all handled correctly instead of false-matching.
//
// Bundling itself uses `esbuild` (already a runtime dependency of this
// package, and already used elsewhere in `build.ts` for `bundleEntries` /
// rebundled `externals`), not `Bun.build` — `packages/cli/src/lib/runtime.ts`
// exists specifically so the published CLI runs unchanged under a plain
// Node runtime (see its docstring), and `Bun.build` is Bun-only.

import ts from 'typescript'
import { unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build as esbuildBuild } from 'esbuild'
import { writeText } from './runtime'

/** True for `@barefootjs/client`, `@barefootjs/client/runtime`, `@barefootjs/client/reactive`, and any other `@barefootjs/client/*` subpath. */
export function isBarefootClientSpecifier(spec: string): boolean {
  return spec === '@barefootjs/client' || spec.startsWith('@barefootjs/client/')
}

export interface RuntimeImportCollection {
  /** Original (imported, not local-alias) export names referenced via a named import. */
  names: Set<string>
  /**
   * True when an import shape was seen that this collector cannot safely
   * narrow — a namespace import (`import * as ns from '@barefootjs/client'`),
   * a default import, or a dynamic `import('@barefootjs/client...')` call.
   * Any of these can reach an arbitrary subset of the runtime through a
   * binding this walk can't enumerate, so the caller should fall back to
   * shipping the full runtime rather than risk stripping something used.
   */
  unsafe: boolean
  /** Human-readable reasons `unsafe` was set (one per occurrence), for logging. */
  reasons: string[]
}

function emptyCollection(): RuntimeImportCollection {
  return { names: new Set(), unsafe: false, reasons: [] }
}

/**
 * Walk one emitted client JS (or bundled entry) file's AST and collect the
 * named `@barefootjs/client*` imports it references.
 *
 * `sourceLabel` is used only for diagnostics (parse-failure / unsafe-import
 * messages), not for resolution.
 */
export function collectUsedRuntimeExports(code: string, sourceLabel = '<input>'): RuntimeImportCollection {
  const result = emptyCollection()

  // Nothing to walk if the specifier text doesn't even appear — cheap
  // short-circuit for the common case (most files) before paying for a
  // full AST parse. Mirrors the pre-scan in `mergeDuplicateNamedImports`.
  if (!code.includes('@barefootjs/client')) return result

  let sourceFile: ts.SourceFile
  try {
    sourceFile = ts.createSourceFile(sourceLabel, code, ts.ScriptTarget.Latest, /*setParentNodes*/ false, ts.ScriptKind.JS)
  } catch (err) {
    result.unsafe = true
    result.reasons.push(`failed to parse ${sourceLabel}: ${(err as Error).message}`)
    return result
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier
      if (ts.isStringLiteral(spec) && isBarefootClientSpecifier(spec.text)) {
        const clause = node.importClause
        if (!clause) {
          // Side-effect import (`import '@barefootjs/client/runtime'`) — no
          // bindings to collect, and not a safety concern.
        } else if (clause.isTypeOnly) {
          // `import type { ... } from '@barefootjs/client'` — erased at
          // runtime, contributes nothing to the used set.
        } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) {
            if (el.isTypeOnly) continue
            const imported = (el.propertyName ?? el.name).text
            result.names.add(imported)
          }
          // A named-import clause can *also* carry a default binding
          // (`import D, { a } from '...'`) — check that too.
          if (clause.name) {
            result.unsafe = true
            result.reasons.push(`default import of "${spec.text}" in ${sourceLabel}`)
          }
        } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          result.unsafe = true
          result.reasons.push(`namespace import (* as ${clause.namedBindings.name.text}) of "${spec.text}" in ${sourceLabel}`)
        } else if (clause.name) {
          result.unsafe = true
          result.reasons.push(`default import of "${spec.text}" in ${sourceLabel}`)
        }
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0]
      if (arg && ts.isStringLiteral(arg) && isBarefootClientSpecifier(arg.text)) {
        result.unsafe = true
        result.reasons.push(`dynamic import("${arg.text}") in ${sourceLabel}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return result
}

/** Union multiple per-file collections into one. */
export function mergeRuntimeImportCollections(collections: Iterable<RuntimeImportCollection>): RuntimeImportCollection {
  const merged = emptyCollection()
  for (const c of collections) {
    for (const n of c.names) merged.names.add(n)
    if (c.unsafe) {
      merged.unsafe = true
      merged.reasons.push(...c.reasons)
    }
  }
  return merged
}

/**
 * Public mount API that hand-written page scripts use directly (resolved at
 * the browser through the importmap, so invisible to this collector — it
 * only sees *compiled* client JS). Always kept regardless of what the scan
 * finds. Derived from the runtime entries real pages in this repo import
 * directly: `render`/`hydrate`/`flushHydration`/`rehydrateAll`/
 * `rehydrateScope`/`disposeScope` (CSR + SSR page bootstraps),
 * `setupStreaming` (every `client/router-entry.ts` across `integrations/*`),
 * and `createSearchParams` (router v0.5 request-scoped env signal, created
 * from page-level router wiring rather than a compiled component).
 */
export const ALWAYS_KEEP_RUNTIME_EXPORTS: readonly string[] = [
  'render',
  'hydrate',
  'flushHydration',
  'rehydrateAll',
  'rehydrateScope',
  'disposeScope',
  'setupStreaming',
  'createSearchParams',
]

export interface BuildRuntimeBundleOptions {
  /** Absolute path to the prebuilt runtime dist file to re-export from. */
  entrySource: string
  /** Directory the temp entry file is written into (also esbuild's working dir). */
  workingDir: string
  /** Names to re-export from `entrySource`. */
  keepNames: Iterable<string>
  minify: boolean
}

/**
 * Bundle a `barefoot.js` containing only `keepNames` (plus whatever they
 * transitively pull in) from `entrySource`, using esbuild's own
 * dead-code elimination. Returns the bundled source text; does not write it
 * anywhere — the caller decides the output path and whether to
 * `writeIfChanged`.
 */
export async function buildRuntimeBundle(opts: BuildRuntimeBundleOptions): Promise<string> {
  const { entrySource, workingDir, keepNames, minify } = opts
  const sorted = [...new Set(keepNames)].sort()
  if (sorted.length === 0) {
    throw new Error('buildRuntimeBundle: keepNames is empty')
  }
  const entryContents = `export { ${sorted.join(', ')} } from ${JSON.stringify(entrySource)}\n`
  const entryPath = resolve(workingDir, `.bf-runtime-entry-${process.pid}-${Date.now()}.mjs`)
  await writeText(entryPath, entryContents)
  try {
    const result = await esbuildBuild({
      entryPoints: [entryPath],
      format: 'esm',
      bundle: true,
      // Unlike `transpile()`'s policy for per-component client JS
      // (packages/cli/src/lib/runtime.ts — identifiers preserved there so
      // e.g. `hydrate('ComponentName', ...)` call-site names and combine.ts's
      // cross-file lookups stay intact), `barefoot.js` is a self-contained
      // leaf artifact loaded only via the importmap: nothing parses its
      // source for internal identifier names, and esbuild always keeps
      // *exported* binding names stable regardless of `minifyIdentifiers`
      // (verified: a re-export entry's `export { keepMe } from '...'` still
      // exports as `keepMe` even when the internal implementation is renamed).
      // So full minification is safe here and meaningfully smaller.
      minify,
      treeShaking: true,
      platform: 'browser',
      write: false,
    })
    const out = result.outputFiles?.[0]
    if (!out) {
      throw new Error('esbuild produced no output for the runtime bundle')
    }
    return out.text
  } finally {
    try {
      await unlink(entryPath)
    } catch {
      // best-effort cleanup; a leftover temp file next to barefoot.js is
      // harmless and gets overwritten/ignored on the next build
    }
  }
}
