// Resolve and inline relative imports in compiled client JS files.

import { dirname, resolve } from 'node:path'
import ts from 'typescript'
import { RELATIVE_IMPORT_RE } from './patterns'
import { fileExists, readText, transpile, writeText } from './runtime'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parsed shape of the `import` statement that triggered an inline.
 *
 *   - `named`     — `import { a, b as c } from './x'` (record local→imported)
 *   - `namespace` — `import * as ns from './x'`
 *   - `default`   — `import D from './x'` or `import D, { ... } from './x'`
 *   - `bare`      — `import './x'` (side-effect; no bound names)
 */
interface ImportShape {
  /** Local names the parent uses, mapped to the imported names. */
  named: Array<{ local: string; imported: string }>
  /** Local namespace binding, if any (`* as ns`). */
  namespace?: string
  /** Local default binding, if any. */
  default?: string
}

/**
 * Parse an `import ... from '...'` statement into its bound-name shape via
 * the TypeScript compiler API. Returns `null` if the statement is a
 * side-effect-only import (`import './x'`) or the input is not a single
 * import declaration.
 *
 * Handles every shape the regex predecessor missed: multi-line clauses,
 * trailing commas, comments inside the clause, and `import type`.
 */
function parseImportShape(stmt: string): ImportShape | null {
  const sourceFile = ts.createSourceFile(
    'import.ts',
    stmt,
    ts.ScriptTarget.Latest,
    /*setParents*/ false,
    ts.ScriptKind.TS,
  )
  const decl = sourceFile.statements.find(ts.isImportDeclaration)
  if (!decl || !decl.importClause) return null // side-effect import: `import './x'`

  const clause = decl.importClause
  const shape: ImportShape = { named: [] }

  if (clause.name) {
    // `import D from '...'` or `import D, { ... } from '...'`
    shape.default = clause.name.text
  }

  const bindings = clause.namedBindings
  if (bindings) {
    if (ts.isNamespaceImport(bindings)) {
      // `import * as ns from '...'`
      shape.namespace = bindings.name.text
    } else {
      // `import { a, b as c } from '...'`
      for (const el of bindings.elements) {
        const imported = (el.propertyName ?? el.name).text
        const local = el.name.text
        shape.named.push({ imported, local })
      }
    }
  }

  return shape
}

/**
 * Collect the set of top-level value-exported names from an inlined
 * module's original TS source. Used to populate the IIFE return for
 * namespace imports (`import * as ns from './x'`), where the parent may
 * reference any exported name via `ns.foo`.
 *
 * Walks the AST so we naturally handle:
 *   - `export const|let|var name` (including object/array destructuring)
 *   - `export function name`, `export async function name`
 *   - `export class name`
 *   - `export { a, b as c }` (uses the exported alias, i.e. `c`)
 *   - multi-line `export { … }` blocks, trailing commas, comments
 *
 * Skipped intentionally:
 *   - `export type` / `export interface` / `export type { … }` — type-only,
 *     erased at runtime, must not be in the IIFE return
 *   - `export default` — out of scope per #1141
 *   - re-exports (`export { x } from './y'`) — not emitted by transpile here
 */
function collectExportedNames(source: string): string[] {
  const names = new Set<string>()
  const sourceFile = ts.createSourceFile(
    'mod.ts',
    source,
    ts.ScriptTarget.Latest,
    /*setParents*/ false,
    ts.ScriptKind.TS,
  )

  function hasExport(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false
    const mods = ts.getModifiers(node)
    return mods?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
  }

  function collectFromBindingName(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) {
      names.add(name.text)
      return
    }
    // ObjectBindingPattern / ArrayBindingPattern — recurse into elements.
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) collectFromBindingName(el.name)
    }
  }

  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt) && hasExport(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        collectFromBindingName(d.name)
      }
    } else if (ts.isFunctionDeclaration(stmt) && hasExport(stmt) && stmt.name) {
      names.add(stmt.name.text)
    } else if (ts.isClassDeclaration(stmt) && hasExport(stmt) && stmt.name) {
      names.add(stmt.name.text)
    } else if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      // `export { a, b as c }` — type-only specifiers (and the whole
      // `export type { … }` form) are erased; skip them.
      if (stmt.isTypeOnly) continue
      for (const el of stmt.exportClause.elements) {
        if (el.isTypeOnly) continue
        names.add(el.name.text)
      }
    }
    // TypeAliasDeclaration / InterfaceDeclaration: type-only, ignored.
    // ExportAssignment (`export default`): out of scope per #1141.
  }

  return [...names]
}

/**
 * Strip top-level `import` declarations and `export` modifiers/keywords
 * from a module body so it's valid as the inside of an IIFE.
 *
 * Implementation: parse the body with the TypeScript compiler API, collect
 * the byte-spans to delete (whole `ImportDeclaration` / re-export
 * `ExportDeclaration` nodes; the `export` modifier on value decls; the
 * `export {…}` block), then splice them out of the original text in
 * descending order. The body stays byte-identical outside the deleted
 * spans — friendlier for sourcemaps and avoids reformat regressions a
 * printer-based approach would introduce.
 *
 * Crucially, this leaves string-literal occurrences of `import` / `export`
 * untouched (they're not statement keywords in the AST).
 *
 * Bare-package imports (`import { marked } from 'marked'`) are still
 * removed from the body — `import` statements are only legal at module
 * top level, so they cannot survive inside the IIFE — but their original
 * source text is also captured in `hoistedImports` so the caller can
 * lift them to the parent bundle's top level. Relative imports (`./`,
 * `../`) are dropped without hoisting because the recursive inliner has
 * already replaced them with IIFE wraps upstream. piconic-ai/barefootjs#1148.
 */
function stripImportsAndExports(body: string): { body: string; hoistedImports: string[] } {
  const sourceFile = ts.createSourceFile(
    'body.ts',
    body,
    ts.ScriptTarget.Latest,
    /*setParents*/ false,
    ts.ScriptKind.TS,
  )

  // Collect [start, end) spans to delete from the original text.
  const spans: Array<[number, number]> = []
  const hoistedImports: string[] = []

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      // Drop the whole `import …` statement from the body. If it's a
      // bare-package or absolute import, also capture its text so the
      // caller can hoist it to the parent's top level.
      const start = stmt.getStart(sourceFile)
      const end = stmt.getEnd()
      const specifier = stmt.moduleSpecifier
      if (ts.isStringLiteral(specifier)) {
        const path = specifier.text
        const isRelative = path.startsWith('./') || path.startsWith('../')
        if (!isRelative) {
          hoistedImports.push(body.slice(start, end))
        }
      }
      spans.push([start, end])
      continue
    }

    if (ts.isExportDeclaration(stmt)) {
      // Drop the whole `export { … }` (with or without `from '…'`).
      // Re-exports won't appear here in practice (transpile flattens them),
      // but if they do we still want them gone.
      spans.push([stmt.getStart(sourceFile), stmt.getEnd()])
      continue
    }

    if (ts.isExportAssignment(stmt)) {
      // `export default <expr>` / `export = <expr>`. Per the IIFE strategy,
      // the body's default export becomes a bare expression statement.
      // Delete only the leading `export default` / `export =` keywords so
      // the expression remains as a (dead) statement inside the IIFE.
      const exportKw = stmt.getChildren(sourceFile).find(c => c.kind === ts.SyntaxKind.ExportKeyword)
      const defaultKw = stmt.getChildren(sourceFile).find(c => c.kind === ts.SyntaxKind.DefaultKeyword)
      const equalsKw = stmt.getChildren(sourceFile).find(c => c.kind === ts.SyntaxKind.EqualsToken)
      const start = exportKw?.getStart(sourceFile) ?? stmt.getStart(sourceFile)
      const end = (defaultKw ?? equalsKw)?.getEnd() ?? exportKw?.getEnd() ?? stmt.getStart(sourceFile)
      if (end > start) spans.push([start, end])
      continue
    }

    // Other top-level decls: strip just the `export` modifier if present.
    if (ts.canHaveModifiers(stmt)) {
      const mods = ts.getModifiers(stmt)
      if (!mods) continue
      for (const mod of mods) {
        if (mod.kind === ts.SyntaxKind.ExportKeyword) {
          // Delete `export` plus the trailing whitespace up to the next
          // token, so `export const x` becomes `const x` (not ` const x`).
          const start = mod.getStart(sourceFile)
          let end = mod.getEnd()
          while (end < body.length && /\s/.test(body[end])) end++
          spans.push([start, end])
        }
      }
    }
  }

  if (spans.length === 0) return { body: body.trim(), hoistedImports }

  // Apply spans in descending order so earlier offsets stay valid.
  spans.sort((a, b) => b[0] - a[0])
  let out = body
  for (const [start, end] of spans) {
    out = out.slice(0, start) + out.slice(end)
  }
  return { body: out.trim(), hoistedImports }
}

/**
 * Wrap an inlined module's body in an IIFE that re-exports only the names
 * the parent bundle actually references, then destructure those at the
 * splice site. This isolates module-private decls (e.g. two siblings each
 * with their own `const BAR_STYLE`) so they cannot collide in the parent's
 * top-level scope.
 *
 *   const { foo, bar } = (() => {
 *     /* inlined body, with `export` keywords stripped *\/
 *     return { foo, bar }
 *   })()
 *
 * For `import * as ns from './x'`, the IIFE returns every top-level
 * exported name. For side-effect-only `import './x'`, the IIFE has no
 * destructure on the outside and no return, but the body still runs.
 *
 * Default exports are out of scope: `stripImportsAndExports` reduces
 * `export default <expr>` to a bare expression, which is fine inside the
 * IIFE.
 *
 * `originalSource` is the pre-transpile TS source of the inlined module,
 * used by `collectExportedNames` so type-only exports are correctly
 * excluded from the namespace IIFE return.
 */
function wrapInIIFE(body: string, shape: ImportShape | null, originalSource: string): { wrapped: string; hoistedImports: string[] } {
  const { body: stripped, hoistedImports } = stripImportsAndExports(body)

  if (!shape) {
    // Side-effect import: no bound names. Still scope-isolate.
    return { wrapped: `;(() => {\n${stripped}\n})();`, hoistedImports }
  }

  const returnEntries: string[] = []
  const destructureEntries: string[] = []

  if (shape.namespace) {
    // Build a single `const ns = (() => { ...; return { a, b, ... } })()`.
    // Parse the original TS source so type-only exports are excluded.
    const exported = collectExportedNames(originalSource)
    const ret = exported.length ? `{ ${exported.join(', ')} }` : '{}'
    return { wrapped: `const ${shape.namespace} = (() => {\n${stripped}\nreturn ${ret};\n})();`, hoistedImports }
  }

  for (const { local, imported } of shape.named) {
    returnEntries.push(imported)
    destructureEntries.push(local === imported ? local : `${imported}: ${local}`)
  }
  if (shape.default) {
    // `import D from './x'` — surface the default binding via the IIFE.
    // `stripImportsAndExports` reduces `export default <expr>` to a bare
    // expression statement, which is then dead. Out of scope for this fix;
    // covered by the issue's "leave defaults out of scope" note.
  }

  if (returnEntries.length === 0) {
    // No bound names we know how to surface. Still IIFE-scope the body.
    return { wrapped: `;(() => {\n${stripped}\n})();`, hoistedImports }
  }

  return {
    wrapped: `const { ${destructureEntries.join(', ')} } = (() => {\n${stripped}\nreturn { ${returnEntries.join(', ')} };\n})();`,
    hoistedImports,
  }
}

export interface ResolveRelativeImportsOptions {
  /** Absolute path to the dist directory (base for manifest paths) */
  distDir: string
  /** Build manifest: componentName -> { clientJs?, markedTemplate } */
  manifest: Record<string, { clientJs?: string; markedTemplate: string }>
  /** Source directories to search for modules (checked after the client JS file's own directory) */
  sourceDirs?: string[]
  /**
   * Per-entry source directories, keyed by manifest key. Searched after the
   * client JS file's own directory but before the global `sourceDirs`.
   *
   * The compiler emits relative imports against the source layout (e.g. a
   * `'use client'` component at `src/components/canvas/DeskCanvas.tsx`
   * importing `./useYjs` resolves to `src/components/canvas/useYjs.ts`).
   * The dist file lives at a different path with no sibling helper, so
   * without this map the resolver would silently strip the import. See
   * piconic-ai/barefootjs#1133.
   */
  sourceDirsByManifestKey?: Record<string, string[]>
}

/**
 * Result of resolving a relative import against the on-disk dist
 * layout. Each variant has a clear handling rule in
 * `inlineRelativeImports`:
 *
 *   - `external` — file exists at runtime as a separately-served
 *     artifact (e.g. `./barefoot.js` is the runtime bundle). Inlining
 *     would duplicate code; stripping the import would break runtime
 *     references. Leave the line alone.
 *   - `inline`   — `.ts` source found; transpile and splice in.
 *     `.tsx` is treated as a server component (already rendered at
 *     SSR time) and the import line is stripped instead.
 *   - `missing`  — nothing matched. Strip the import line.
 */
type ResolveResult =
  | { kind: 'external' }
  | { kind: 'inline'; path: string }
  | { kind: 'missing' }

async function resolveSourceFile(importPath: string, searchDirs: string[]): Promise<ResolveResult> {
  for (const dir of searchDirs) {
    const basePath = resolve(dir, importPath)
    // If the import path already points to an existing runtime artifact
    // (e.g. `./barefoot.js`), keep the import as-is. Without this,
    // watch's cached re-builds would silently strip the runtime import
    // line from every component's client JS, and the browser would
    // then fail with `ReferenceError: hydrate is not defined`.
    if (/\.(?:js|mjs|cjs)$/.test(importPath) && await fileExists(basePath)) {
      return { kind: 'external' }
    }
    for (const ext of ['.ts', '.tsx', '.js']) {
      if (await fileExists(basePath + ext)) return { kind: 'inline', path: basePath + ext }
    }
    // Directory-import fallback: standard Node resolution. `./foo` resolves to
    // `./foo/index.{ts,tsx,js}` when no flat-extension match exists. #1151.
    for (const ext of ['.ts', '.tsx', '.js']) {
      const indexPath = resolve(basePath, 'index' + ext)
      if (await fileExists(indexPath)) return { kind: 'inline', path: indexPath }
    }
  }
  return { kind: 'missing' }
}

/**
 * Process a single file's relative imports, mutating `content` in place.
 * Recurses into transitively-imported `.ts` modules so that, e.g.,
 * `client.tsx → nav-data.ts → component-registry.ts` all end up inlined
 * in the right declaration order.
 *
 * `hoistedAcc` is a mutable accumulator shared with all recursive calls:
 * bare-package imports stripped from any inlined module body bubble up
 * here so the outer entry point can prepend them, deduped, to the parent
 * bundle's top level. piconic-ai/barefootjs#1148.
 */
async function inlineRelativeImports(
  content: string,
  searchDirs: string[],
  inlinedPaths: Set<string>,
  loggingPath: string,
  hoistedAcc: string[],
): Promise<string> {
  const re = new RegExp(RELATIVE_IMPORT_RE.source, RELATIVE_IMPORT_RE.flags)
  const matches = [...content.matchAll(re)]
  if (matches.length === 0) return content

  for (const match of matches) {
    const importPath = match[1]
    const fullMatch = match[0]
    const result = await resolveSourceFile(importPath, searchDirs)

    if (result.kind === 'external') {
      // Existing runtime artifact (e.g. ./barefoot.js); keep import as-is.
      continue
    }

    if (result.kind === 'missing') {
      // Surface unresolved imports — silent strips made #1151 hard to spot.
      console.warn(`Stripped unresolved import: ${importPath} from ${loggingPath}`)
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      continue
    }

    if (inlinedPaths.has(result.path)) {
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      continue
    }

    if (result.path.endsWith('.tsx')) {
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      console.log(`Stripped server component import: ${importPath} from ${loggingPath}`)
      continue
    }

    inlinedPaths.add(result.path)
    const sourceContent = await readText(result.path)
    let jsCode = transpile(sourceContent, { loader: 'ts' })

    // Recursively resolve relative imports inside the inlined module before
    // stripping its import lines. Resolution is anchored to the source file's
    // own directory so transitive paths (e.g. './component-registry') resolve
    // correctly regardless of where the parent client JS lives.
    //
    // The inner inline replaces each transitive import with an IIFE-wrapped
    // splice (see wrapInIIFE), so the inner module's private decls stay
    // hidden from the outer module's scope. The outer wrapInIIFE call below
    // then hides the OUTER module's privates from the parent. Composition:
    // privates only ever leak one frame outward, never to top level.
    jsCode = await inlineRelativeImports(
      jsCode,
      [dirname(result.path), ...searchDirs.slice(1)],
      inlinedPaths,
      loggingPath,
      hoistedAcc,
    )

    // Wrap the inlined body in an IIFE that re-exports only the names the
    // parent imported (see wrapInIIFE for shape rules). This scopes
    // module-private decls so two siblings declaring the same identifier
    // (e.g. `const BAR_STYLE`) don't collide in the parent's top-level
    // scope. piconic-ai/barefootjs#1141.
    const shape = parseImportShape(fullMatch)
    const { wrapped, hoistedImports } = wrapInIIFE(jsCode, shape, sourceContent)
    for (const h of hoistedImports) hoistedAcc.push(h)

    content = content.replace(fullMatch, wrapped)
    console.log(`Inlined: ${importPath} into ${loggingPath}`)
  }

  return content
}

/**
 * Resolve relative imports in compiled client JS files.
 *
 * For each client JS file in the manifest:
 * - `.ts` imports: transpile and inline the code (recursively for transitive `.ts` deps)
 * - `.tsx` imports: strip (server component, already rendered at SSR time)
 * - Not found / already inlined: strip
 */
export async function resolveRelativeImports(options: ResolveRelativeImportsOptions): Promise<void> {
  const { distDir, manifest, sourceDirs = [], sourceDirsByManifestKey = {} } = options

  for (const [name, entry] of Object.entries(manifest)) {
    if (!entry.clientJs) continue
    const filePath = resolve(distDir, entry.clientJs)
    let content: string
    try {
      content = await readText(filePath)
    } catch {
      continue
    }

    const perEntryDirs = sourceDirsByManifestKey[name] ?? []
    const inlinedPaths = new Set<string>()
    const hoistedAcc: string[] = []
    let next = await inlineRelativeImports(
      content,
      [dirname(filePath), ...perEntryDirs, ...sourceDirs],
      inlinedPaths,
      entry.clientJs,
      hoistedAcc,
    )

    // Prepend bare-package imports that bubbled up from inlined modules,
    // deduped by exact statement text after whitespace normalization.
    // ES modules hoist all `import` statements anyway, so placement is
    // observationally identical. piconic-ai/barefootjs#1148.
    if (hoistedAcc.length > 0) {
      const seen = new Set<string>()
      const unique: string[] = []
      for (const stmt of hoistedAcc) {
        const key = stmt.replace(/\s+/g, ' ').trim()
        if (seen.has(key)) continue
        seen.add(key)
        unique.push(stmt)
      }
      next = unique.join('\n') + '\n' + next
    }

    if (next !== content) {
      await writeText(filePath, next)
    }
  }
}
