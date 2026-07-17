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
import { basename, dirname } from 'node:path'
import { build as esbuildBuild } from 'esbuild'

/** True for `@barefootjs/client`, `@barefootjs/client/runtime`, `@barefootjs/client/reactive`, and any other `@barefootjs/client/*` subpath. */
export function isBarefootClientSpecifier(spec: string): boolean {
  return spec === '@barefootjs/client' || spec.startsWith('@barefootjs/client/')
}

/**
 * Relative specifier pointing at an emitted `barefoot.js` runtime bundle —
 * the shape `rewriteBarefootClientSpecifiers` (build.ts step 6c) rewrites
 * every `@barefootjs/client*` import to in the FINAL on-disk client JS. That
 * step computes the path with `relative(dirname(clientFile), runtimeFile)`,
 * so it is a relative path (always leading `./` or `../`) whose LAST segment
 * is `barefoot.js` but which may carry intermediate directory segments when
 * `outputLayout.runtime` differs from `outputLayout.clientJs` (e.g.
 * `../runtime/barefoot.js`, `./components/runtime/barefoot.js`) — not only
 * the pure `../…/barefoot.js` case of the default layout. Matching the whole
 * family is safe: a false positive here only over-keeps a name (or trips the
 * full-runtime fallback when the name isn't a real export), never drops one.
 */
const EMITTED_RUNTIME_REL = /^\.\.?\/(?:[^'"\n]*\/)?barefoot\.js$/

/**
 * True for either representation of the client runtime that appears in
 * *emitted* client JS: the bare `@barefootjs/client*` specifier (fresh
 * compiler output, before step 6c rewrites it) OR the relative
 * `../barefoot.js` path (the final on-disk form after 6c).
 *
 * The collector must recognize both because it scans the on-disk output
 * files: a CACHED component's file was already rewritten to the relative
 * form on a PRIOR build, so a warm-cache rebuild that only matched the bare
 * specifier would see zero runtime imports for it and silently drop exports
 * only cached components use (e.g. `__bfSlot`), breaking hydration. See
 * piconic-ai/barefootjs#2309.
 */
export function isEmittedRuntimeSpecifier(spec: string): boolean {
  return isBarefootClientSpecifier(spec) || EMITTED_RUNTIME_REL.test(spec)
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
 * named runtime imports it references — matching both the bare
 * `@barefootjs/client*` specifier (fresh compiler output) and the relative
 * `../barefoot.js` path a cached file was rewritten to on a prior build (see
 * `isEmittedRuntimeSpecifier`).
 *
 * `sourceLabel` is used only for diagnostics (parse-failure / unsafe-import
 * messages), not for resolution.
 */
export function collectUsedRuntimeExports(code: string, sourceLabel = '<input>'): RuntimeImportCollection {
  const result = emptyCollection()

  // Nothing to walk if neither the bare `@barefootjs/client` specifier nor
  // the emitted relative `barefoot.js` runtime path even appears — cheap
  // short-circuit for the common case (most files) before paying for a
  // full AST parse. Mirrors the pre-scan in `mergeDuplicateNamedImports`.
  // Both substrings are checked because a cached component's on-disk file
  // imports the runtime via `../barefoot.js`, not the bare specifier (#2309).
  if (!code.includes('@barefootjs/client') && !code.includes('barefoot.js')) return result

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
      if (ts.isStringLiteral(spec) && isEmittedRuntimeSpecifier(spec.text)) {
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
      if (arg && ts.isStringLiteral(arg) && isEmittedRuntimeSpecifier(arg.text)) {
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
 *
 * The re-export entry is fed to esbuild via `stdin` with `resolveDir` set to
 * the dist file's directory and a plain `./<basename>` specifier — no temp
 * file, and no absolute path embedded in a module specifier (a Windows
 * absolute path inside `from "..."` is not portable across resolvers).
 */
export async function buildRuntimeBundle(opts: BuildRuntimeBundleOptions): Promise<string> {
  const { entrySource, keepNames, minify } = opts
  const sorted = [...new Set(keepNames)].sort()
  if (sorted.length === 0) {
    throw new Error('buildRuntimeBundle: keepNames is empty')
  }
  const entryContents = `export { ${sorted.join(', ')} } from ${JSON.stringify(`./${basename(entrySource)}`)}\n`
  const result = await esbuildBuild({
    stdin: {
      contents: entryContents,
      resolveDir: dirname(entrySource),
      sourcefile: 'bf-runtime-entry.mjs',
      loader: 'js',
    },
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
}
