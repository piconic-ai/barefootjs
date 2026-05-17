// Resolve and inline relative imports in compiled client JS files.

import { dirname, resolve } from 'node:path'
import ts from 'typescript'
import { createError, ErrorCodes, type CompilerError } from '@barefootjs/jsx'
import { fileExists, readText, transpile, writeText } from './runtime'

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
 * Extract the bound-name shape directly from a TypeScript
 * `ImportDeclaration` node. Returns `null` for side-effect imports
 * (`import './x'`), which carry no bindings.
 *
 * Operating on the AST node — instead of re-parsing the matched text —
 * is what lets the walker handle every statement shape the predecessor
 * regex used to miss: multi-line clauses, trailing commas, line comments
 * inside the clause, and `import type` (still erased, but recognised).
 */
function shapeFromDecl(decl: ts.ImportDeclaration): ImportShape | null {
  const clause = decl.importClause
  if (!clause) return null // side-effect import: `import './x'`

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
 * Detect whether a `.tsx` source file declares the `'use client'` directive
 * as its first executable statement (per the JSX analyzer, which is the
 * canonical check). Used to gate stub emission: only `'use client'`
 * components have a runtime registry entry that the stub's
 * `createComponent(...)` delegation can reach. A `.tsx` source without the
 * directive is a plain server-side module (e.g. `blog-data.tsx` exporting
 * data + utility functions), and stubbing its named imports as component
 * factories breaks any consumer that actually reads the value — calling
 * `getPost(slug)` returns a `createComponent('getPost', slug, undefined)`
 * descriptor instead of a `BlogPost`, then `post.title` is undefined and
 * the rendered DOM ends up empty/corrupt. piconic-ai/barefootjs#1258.
 */
function hasUseClientDirective(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    'check.tsx',
    source,
    ts.ScriptTarget.Latest,
    /*setParents*/ false,
    ts.ScriptKind.TSX,
  )
  for (const stmt of sourceFile.statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) {
      return false
    }
    if (stmt.expression.text === 'use client') return true
  }
  return false
}

/**
 * Collect every top-level value-binding name introduced by a declaration
 * (`function`, `const`/`let`/`var`, `class`) in a JS/TS module body.
 *
 * The stub-emission path uses this to detect when a sibling `'use client'`
 * `.tsx`'s named binding is already provided by an earlier inlined module
 * inside the assembled bundle (e.g. esbuild bundled the target's compiled
 * `.js` whole), so re-declaring it as `const X = …` would produce a
 * SyntaxError on parse and take the whole hydration script down with it.
 * piconic-ai/barefootjs#1258.
 *
 * `import` declarations are intentionally excluded: the import we're about
 * to process is itself an import declaration that would otherwise count
 * itself as an existing binding and short-circuit the stub. Whether other
 * pending imports collide with the stub is moot — they'll be stripped or
 * stubbed in their own pass through `walkAndCollect` and any same-name
 * collision becomes a real top-level declaration only via inlining.
 *
 * Type-only declarations (`type`, `interface`) are ignored because
 * they're erased at runtime and can't collide with a value stub.
 */
function collectTopLevelBindings(source: string): Set<string> {
  const names = new Set<string>()
  const sourceFile = ts.createSourceFile(
    'bundle.ts',
    source,
    ts.ScriptTarget.Latest,
    /*setParents*/ false,
    ts.ScriptKind.TS,
  )

  function collectFromBindingName(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) {
      names.add(name.text)
      return
    }
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) collectFromBindingName(el.name)
    }
  }

  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        collectFromBindingName(d.name)
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text)
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text)
    }
  }

  return names
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
 * Build the destructure clause that binds an `import` statement's locals
 * to a per-module top-level binding (`__bf_inline_N`). Unlike the legacy
 * inline-IIFE form, this assumes the IIFE itself is emitted ONCE at the
 * parent bundle's top level (see #1153) and the consumer just pulls the
 * names it needs out of the resulting object.
 */
function buildConsumerBinding(shape: ImportShape | null, topLevelId: string): string {
  if (!shape) {
    // Side-effect import: nothing to bind, but the IIFE body still ran at
    // top level when `topLevelId` was declared.
    return ''
  }
  if (shape.namespace) {
    return `const ${shape.namespace} = ${topLevelId};`
  }
  if (shape.named.length === 0) {
    return ''
  }
  const entries = shape.named.map(({ local, imported }) =>
    local === imported ? local : `${imported}: ${local}`,
  )
  return `const { ${entries.join(', ')} } = ${topLevelId};`
}

/**
 * Build the top-level IIFE wrap for an inlined module. The IIFE returns
 * the union of every name any consumer (parent or transitive) needs from
 * the module: explicit named imports plus, if any consumer used `* as ns`,
 * every top-level value-exported name. Module-private decls stay scoped
 * inside the IIFE arrow body — they cannot collide with parent or
 * sibling-IIFE decls.
 *
 *   const __bf_inline_N = (() => {
 *     /* body, with `export` modifiers stripped and relative imports replaced
 *        by destructures pulling from other __bf_inline_M variables *\/
 *     return { foo, bar, ...allExportsIfNamespace }
 *   })()
 *
 * `originalSource` is the pre-transpile TS source, used by
 * `collectExportedNames` to enumerate all value exports for the namespace
 * case (so type-only exports stay excluded).
 */
function buildTopLevelIIFE(
  topLevelId: string,
  body: string,
  shapesNeeded: ImportShape[],
  originalSource: string,
): { wrapped: string; hoistedImports: string[] } {
  const { body: stripped, hoistedImports } = stripImportsAndExports(body)

  // Union of names any consumer needs from this module. If any consumer
  // wants the namespace shape, we have to surface every value export.
  const wantsNamespace = shapesNeeded.some(s => !!s.namespace)
  const namesNeeded = new Set<string>()
  if (wantsNamespace) {
    for (const n of collectExportedNames(originalSource)) namesNeeded.add(n)
  }
  for (const shape of shapesNeeded) {
    for (const { imported } of shape.named) namesNeeded.add(imported)
  }

  if (namesNeeded.size === 0) {
    // No bound names to surface (side-effect-only consumer). Run the body
    // for its effects and bind the top-level id to an empty object so any
    // dedup destructure later still parses.
    return {
      wrapped: `const ${topLevelId} = (() => {\n${stripped}\nreturn {};\n})();`,
      hoistedImports,
    }
  }

  const ret = `{ ${[...namesNeeded].join(', ')} }`
  return {
    wrapped: `const ${topLevelId} = (() => {\n${stripped}\nreturn ${ret};\n})();`,
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
 *     `.tsx` is treated as a separately-compiled `'use client'`
 *     component (it has its own `.client.js`) and the import line is
 *     stripped instead — the binding can't be a plain function call in
 *     the consumer bundle. Any residual reference is caught by
 *     `detectStrippedReferences` after IIFE assembly.
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
 * One inlined module collected during the graph walk. Becomes one
 * top-level IIFE in the emitted bundle.
 */
interface InlinedModule {
  path: string                  // resolved absolute source path
  topLevelId: string            // `__bf_inline_N` — stable per-module identifier
  transpiledBody: string        // transpile output, before its own imports are processed
  originalSource: string        // pre-transpile TS source (for namespace export collection)
  searchDirs: string[]          // search dirs anchored at this module's directory
  consumerShapes: ImportShape[] // every consumer's import shape (parent + transitive)
  imports: Set<string>          // resolved paths of `.ts` modules this module imports
}

/**
 * Why an import line was dropped during the graph walk. Drives the
 * diagnostic wording when a dangling reference is later discovered —
 * each reason has a different remediation, so a single generic message
 * would mislead the developer.
 */
type StripKind =
  | 'tsx'      // sibling .tsx, separately-compiled 'use client' component
  | 'missing'  // import path could not be resolved on disk
  | 'circular' // circular relative dependency; the IIFE topo-sort can't safely emit it

/**
 * One stripped import recorded during the graph walk. Surfaces in the final
 * post-assembly bundle scan: if any of the local binding names below still
 * appears as a value reference, that is a build-time error (BF053). See
 * `detectStrippedReferences` and piconic-ai/barefootjs#1227.
 */
interface StrippedImport {
  /** Reason the import was dropped — controls the diagnostic message. */
  kind: StripKind
  /** The original import specifier, e.g. `./DraftTitleEditor`. */
  importPath: string
  /** Every local name the parent bound (named, namespace, default). */
  bindings: string[]
  /** The bundle path passed in for logging — used for the error location. */
  loggingPath: string
}

/**
 * Record an `import` statement that was just stripped (because the target
 * was a sibling `.tsx`, an unresolved path, or a circular relative dep) so
 * a later pass can verify none of its locals are still referenced.
 *
 * `shape` comes from `shapeFromDecl(decl)` — `null` for side-effect
 * imports (`import './x'`), which have nothing to dangle.
 */
function recordStrippedImport(
  shape: ImportShape | null,
  importPath: string,
  loggingPath: string,
  kind: StripKind,
  stripped: StrippedImport[],
): void {
  if (!shape) return
  const bindings: string[] = []
  for (const { local } of shape.named) bindings.push(local)
  if (shape.namespace) bindings.push(shape.namespace)
  if (shape.default) bindings.push(shape.default)
  if (bindings.length === 0) return
  stripped.push({ kind, importPath, bindings, loggingPath })
}

/**
 * Build the per-kind diagnostic body for a dangling stripped reference.
 * Each strip reason has its own remediation; a one-size message would
 * mislead developers (a missing-path strip is NOT a 'use client'
 * boundary problem).
 */
function buildDanglingReferenceMessage(
  binding: string,
  s: StrippedImport,
): { message: string; suggestion: string } {
  const head =
    `Import \`${binding}\` from '${s.importPath}' was stripped from the client bundle ` +
    `\`${s.loggingPath}\`, but \`${binding}\` is still referenced in the assembled JS.`
  const shadowNote =
    `(If \`${binding}\` is a local shadow rather than the stripped import, please file an issue.)`
  switch (s.kind) {
    case 'tsx':
      return {
        message:
          `${head} Client components ('use client' .tsx) are not callable as plain functions ` +
          `from imperative .ts modules — render them as JSX from a 'use client' parent ` +
          `instead. ${shadowNote}`,
        suggestion:
          `Move the call site into a 'use client' .tsx parent and render \`${binding}\` ` +
          `as JSX, or restructure so the imperative .ts module no longer needs to call ` +
          `\`${binding}\` directly.`,
      }
    case 'missing':
      return {
        message:
          `${head} The import path could not be resolved on disk. ${shadowNote}`,
        suggestion:
          `Check the path '${s.importPath}' — either fix the typo, restore the deleted ` +
          `file, or remove the dead import.`,
      }
    case 'circular':
      return {
        message:
          `${head} The import was dropped because the IIFE topological sort cannot safely ` +
          `emit a circular relative dependency. ${shadowNote}`,
        suggestion:
          `Break the cycle: extract the shared bindings into a third module that both ` +
          `sides can depend on without re-entry.`,
      }
  }
}

/**
 * Identifier-position classifier: returns `true` when `id` is being USED
 * as a value (and could therefore be the dangling reference to a stripped
 * import), `false` when it's a declaration name, property key, member-
 * access name, or other non-reference slot.
 *
 * Caveat: this is a syntactic test, not a scope analysis. If a local
 * function parameter happens to share a name with a stripped import,
 * references inside that function's body will count as references to
 * the stripped import (false positive). Acceptable per #1227: a loud
 * build error is a strict improvement over a silent runtime
 * ReferenceError, and shadowing genuine import binding names is rare in
 * practice.
 */
function isValueReference(id: ts.Identifier): boolean {
  const parent = id.parent
  if (!parent) return false
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return false
  if (ts.isPropertyAssignment(parent) && parent.name === id) return false
  if (
    (ts.isMethodDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === id
  ) {
    return false
  }
  if (ts.isVariableDeclaration(parent) && parent.name === id) return false
  if (ts.isFunctionDeclaration(parent) && parent.name === id) return false
  if (ts.isFunctionExpression(parent) && parent.name === id) return false
  if (ts.isClassDeclaration(parent) && parent.name === id) return false
  if (ts.isClassExpression(parent) && parent.name === id) return false
  if (ts.isParameter(parent) && parent.name === id) return false
  if (ts.isBindingElement(parent) && (parent.name === id || parent.propertyName === id)) return false
  if (ts.isLabeledStatement(parent) && parent.label === id) return false
  if (ts.isBreakOrContinueStatement(parent) && parent.label === id) return false
  // ImportSpecifier (`{ X }` or `{ X as Y }`) and ExportSpecifier have
  // only `name`/`propertyName` as Identifier children — written as an
  // explicit slot check for stylistic consistency with the other
  // branches above.
  if (ts.isImportSpecifier(parent) && (parent.name === id || parent.propertyName === id)) return false
  if (ts.isExportSpecifier(parent) && (parent.name === id || parent.propertyName === id)) return false
  if (ts.isImportClause(parent) && parent.name === id) return false
  if (ts.isNamespaceImport(parent) && parent.name === id) return false
  if (ts.isQualifiedName(parent) && parent.right === id) return false
  return true
}

/**
 * Scan the assembled bundle source for value references to any binding
 * name we removed during the walk. Returns one CompilerError per
 * (stripped import × dangling binding) pair. Uses the TypeScript parser
 * so member-access property names, declaration names, etc. are
 * correctly excluded.
 *
 * Closes piconic-ai/barefootjs#1227: the previous strip flow logged at
 * info level and continued, so a `.ts` helper inlined into a client
 * bundle that called into a sibling `'use client'` component left a
 * dangling identifier and a `ReferenceError` only visible at runtime.
 */
function detectStrippedReferences(
  bundleSource: string,
  stripped: StrippedImport[],
): CompilerError[] {
  if (stripped.length === 0) return []
  // The bundle is already transpiled JS at this point — parse as JS so
  // residual TS-only syntax isn't mistakenly required.
  let sf: ts.SourceFile
  try {
    sf = ts.createSourceFile(
      'bundle.js',
      bundleSource,
      ts.ScriptTarget.Latest,
      /*setParents*/ true,
      ts.ScriptKind.JS,
    )
  } catch {
    // If the bundle can't be parsed for any reason, fall back silently:
    // the strip itself is the bug we care about; a parse failure here is
    // a separate problem that will surface elsewhere.
    return []
  }
  // For each value-referenced identifier name, capture the FIRST node we
  // see — that's the call/use site we'll point the developer at. Walking
  // top-down gives source-order positions naturally.
  const firstReference = new Map<string, ts.Identifier>()
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && isValueReference(node)) {
      if (!firstReference.has(node.text)) firstReference.set(node.text, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  const errors: CompilerError[] = []
  for (const s of stripped) {
    for (const b of s.bindings) {
      const refNode = firstReference.get(b)
      if (!refNode) continue
      // 1-indexed line, 0-indexed column — matches `SourceLocation` per
      // packages/jsx/src/types.ts.
      const start = sf.getLineAndCharacterOfPosition(refNode.getStart(sf))
      const end = sf.getLineAndCharacterOfPosition(refNode.getEnd())
      const { message, suggestion } = buildDanglingReferenceMessage(b, s)
      errors.push(
        createError(
          ErrorCodes.STRIPPED_CLIENT_IMPORT_REFERENCED,
          {
            file: s.loggingPath,
            start: { line: start.line + 1, column: start.character },
            end: { line: end.line + 1, column: end.character },
          },
          {
            message,
            suggestion: { message: suggestion },
          },
        ),
      )
    }
  }
  return errors
}

/**
 * Walk relative imports in `content` and collect every transitively-reachable
 * `.ts` module. Replaces each direct relative import line in `content` with
 * a destructure pulling from a per-module top-level identifier — the IIFE
 * itself is emitted ONCE at the parent bundle's top level after the walk
 * finishes, regardless of how deep the original import was. piconic-ai/barefootjs#1153.
 *
 * Stripping vs. emitting the destructure: a side-effect-only import
 * (`import './x'`) leaves the body in place via the top-level IIFE but emits
 * no consumer-side binding. Named/namespace imports emit a destructure that
 * resolves at the consumer's site (parent body or another module's IIFE
 * arrow body) via closure to the top-level binding.
 *
 * `hoistedAcc` is a mutable accumulator shared with every recursive call:
 * bare-package imports stripped from any inlined module body bubble up
 * here so the outer entry point can prepend them, deduped, to the parent
 * bundle's top level. piconic-ai/barefootjs#1148.
 *
 * `stripped` is the other mutable accumulator: any import line dropped
 * because the target is a sibling `.tsx`, missing, or a circular `.ts`
 * dep is recorded here so `inlineRelativeImports` can verify, after IIFE
 * assembly, that none of the dropped bindings are still referenced in
 * the final bundle. piconic-ai/barefootjs#1227.
 *
 * `stubDeps` is a mutable accumulator for the absolute paths of every
 * `'use client'` sibling that this bundle reaches via a stub rewrite
 * (the `createComponent(name, ...)` shim emitted in place of the
 * stripped import). The build pipeline maps these paths to manifest
 * keys and surfaces them on the manifest entry so the page-level
 * script loader can follow stub references when deciding which
 * `.client.js` files to ship — without this the runtime fails with
 * "Template not found" on pages that only reach a child component
 * through an imperative stub call. See #1243.
 */
async function walkAndCollect(
  content: string,
  searchDirs: string[],
  modules: Map<string, InlinedModule>,
  visiting: Set<string>,
  loggingPath: string,
  stripped: StrippedImport[],
  stubDeps: Set<string>,
): Promise<string> {
  // Parse the body with the TypeScript compiler API and walk every
  // top-level `ImportDeclaration`. Working off the AST — rather than
  // regex-matching the source text — handles every statement shape the
  // predecessor missed (multi-line clauses, line comments inside the
  // clause, `import type`, alternate quote styles) and gives us authoritative
  // byte spans for the splice, so a duplicate of the import text appearing
  // inside a string literal can never be hit by accident.
  // piconic-ai/barefootjs#1242.
  //
  // `ScriptKind.JS` matches the actual input: this walker only sees
  // post-transpile bundles (esbuild output for the client entry; the
  // `transpile()` result for inlined `.ts` modules). Mirrors
  // `detectStrippedReferences` below.
  const sourceFile = ts.createSourceFile(
    'walk.js',
    content,
    ts.ScriptTarget.Latest,
    /*setParents*/ false,
    ts.ScriptKind.JS,
  )

  /** One relative import statement found in the body, with its byte span. */
  interface ImportSite {
    decl: ts.ImportDeclaration
    /** Statement start (after leading trivia, matching the pre-AST regex). */
    start: number
    /** Statement end including one trailing newline if present — the
     *  splice should consume that newline so the body doesn't keep a blank
     *  line where the import used to be (matches the legacy `\\n?` behavior). */
    endWithNewline: number
    /** Statement end without consuming the trailing newline — used when
     *  the replacement is non-empty and should occupy the import's line
     *  (matching legacy `content.replace(fullMatch, binding)` semantics). */
    endNoNewline: number
    specifier: string
  }

  const sites: ImportSite[] = []
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const spec = stmt.moduleSpecifier.text
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue
    const start = stmt.getStart(sourceFile)
    const endNoNewline = stmt.getEnd()
    // Consume one trailing line terminator so the body doesn't keep a
    // blank line where the import used to be. Handles LF, CRLF, and a
    // lone CR — `ts.getEnd()` does not include trailing trivia, so
    // whatever follows the last token is still in `content` at this
    // offset.
    let endWithNewline = endNoNewline
    if (endWithNewline < content.length && content[endWithNewline] === '\r') {
      endWithNewline += 1
    }
    if (endWithNewline < content.length && content[endWithNewline] === '\n') {
      endWithNewline += 1
    }
    sites.push({ decl: stmt, start, endWithNewline, endNoNewline, specifier: spec })
  }

  if (sites.length === 0) return content

  // Snapshot top-level bindings ONCE before any splice. Used by the
  // `'use client'` `.tsx` named-import branch to skip stubs whose `local`
  // name esbuild has already declared elsewhere in the bundle (#1258).
  // Taking the snapshot before mutation is safe because TS forbids
  // two imports binding the same local name in a single module, so no
  // two sites in this walk can mint the same stub name.
  const existingTopLevel = collectTopLevelBindings(content)

  interface Replacement {
    start: number
    end: number
    text: string
  }
  const replacements: Replacement[] = []

  for (const site of sites) {
    const importPath = site.specifier
    const result = await resolveSourceFile(importPath, searchDirs)

    if (result.kind === 'external') {
      // Existing runtime artifact (e.g. ./barefoot.js); keep import as-is.
      continue
    }

    const shape = shapeFromDecl(site.decl)

    if (result.kind === 'missing') {
      // Surface unresolved imports — silent strips made #1151 hard to spot.
      console.warn(`Stripped unresolved import: ${importPath} from ${loggingPath}`)
      replacements.push({ start: site.start, end: site.endWithNewline, text: '' })
      recordStrippedImport(shape, importPath, loggingPath, 'missing', stripped)
      continue
    }

    if (result.path.endsWith('.tsx')) {
      // A sibling `.tsx` that declares `'use client'` is a separately-compiled
      // component. Its own compiled `.client.js` exports a JSX-shim function
      // (`function X(props, key) { return createComponent('X', props, key) }`)
      // that delegates to the runtime registry. The shim isn't reachable
      // from another bundle as a plain import, so we replace the parent's
      // import with local stubs that perform the same `createComponent`
      // delegation in scope. That keeps every reference shape working — JSX
      // (`<X />`, where the JSX compiler also rewrites to `createComponent`
      // and never reads the local binding), passing the value through a
      // Record (`<Flow nodeTypes={{ kind: X }}>`), or any of the other
      // non-JSX usages piconic-ai/barefootjs#1238 made supported at the
      // runtime side. Closes piconic-ai/barefootjs#1240.
      //
      // A `.tsx` without the directive is a plain server-side module that
      // happens to use JSX syntax (e.g. `blog-data.tsx` exporting BLOG_POSTS
      // + getPost helpers, or any non-stateful render helper that bundles
      // for SSR only). Those have no runtime registry entry, so a
      // `createComponent(...)` stub returns a wrong-shaped descriptor and
      // breaks every consumer that actually reads the value. Fall back to
      // the pre-#1240 strip path for non-`'use client'` `.tsx` siblings —
      // the SSR template imports them at the server-rendered layer where
      // they resolve normally; the client bundle just doesn't get them.
      // piconic-ai/barefootjs#1258.
      //
      // Default and namespace imports of a `'use client'` `.tsx` are NOT
      // stubbed — the registered runtime name for those isn't trivially
      // recoverable from the import statement alone (default exports
      // compile without a stable JSX-registration name; namespace imports
      // would need every export of the target file enumerated against the
      // registry). They fall back to the pre-existing strip + BF053 path so
      // any actual usage still surfaces a build error rather than a silent
      // ReferenceError. The named-import path covers the practical case
      // (`nodeTypes={{ kind: Component }}`) that drove both #1236 and #1240.
      const targetSource = await readText(result.path)
      const isUseClientTarget = hasUseClientDirective(targetSource)
      const namedBindings = shape?.named ?? []
      const fallbackBindings: string[] = []
      if (shape?.namespace) fallbackBindings.push(shape.namespace)
      if (shape?.default) fallbackBindings.push(shape.default)

      if (isUseClientTarget && namedBindings.length > 0) {
        // Skip stubs for names esbuild has already inlined as real top-level
        // bindings (typically the target's whole compiled JS got bundled in
        // upstream, so `function X(_p, __bfKey) { return createComponent(…) }`
        // is already present). Re-declaring those as `const X = …` produces
        // a SyntaxError on parse and silently kills every hydration in the
        // bundle. piconic-ai/barefootjs#1258.
        const stubsToEmit = namedBindings.filter(({ local }) => !existingTopLevel.has(local))
        const stubBody = stubsToEmit
          .map(({ local, imported }) => `const ${local} = (props, key) => createComponent(${JSON.stringify(imported)}, props, key);`)
          .join('\n')
        const replacement = stubBody.length > 0 ? `${stubBody}\n` : ''
        replacements.push({ start: site.start, end: site.endWithNewline, text: replacement })
        // Record the stub target's absolute path so the page-level script
        // loader can include the target component's `.client.js` on any
        // page whose bundle reaches it through this stub call (issue
        // #1243). Only record when something was actually stubbed —
        // when every named binding is already in `existingTopLevel`
        // (esbuild inlined the whole target into this bundle), no stub
        // is emitted and the page already has the inlined registration,
        // so the target's standalone `.client.js` is unnecessary.
        //
        // Partial-inline edge case: if esbuild inlined SOME bindings
        // (e.g. `Foo`) but NOT others (`Bar`), `Bar` still triggers a
        // stub and we ship the target's `.client.js`. Loading it
        // re-registers `Foo` alongside the parent's already-inlined
        // `Foo` — `hydrate()` is a plain `Map.set` in all three
        // runtime registries (`hydrate.ts`, `registry.ts`,
        // `template.ts`), so the second call silently overwrites
        // with the same def. Same code in both copies, so the
        // overwrite is observationally a no-op.
        //
        // The path → manifest-key conversion happens in `build.ts`
        // where the manifest layout is known.
        if (stubsToEmit.length > 0) stubDeps.add(result.path)
        // The stub references the runtime `createComponent` symbol. Every
        // JSX-emitted client bundle already imports it as part of the
        // umbrella `barefoot.js` runtime (any `<X />` use compiles to a
        // `createComponent(...)` call), so the binding is in scope at the
        // top of the parent file. We deliberately do NOT hoist a separate
        // `import { createComponent } from '@barefootjs/client/runtime'`
        // here: the page's importmap only exposes the umbrella `barefoot.js`
        // module, so the bare runtime path would 404 in the browser.
        // Bundles that genuinely don't have `createComponent` in scope are
        // not realistic for this strip path (you only reach it from a
        // `'use client'` parent, which always emits JSX → always imports
        // `createComponent`), and a "createComponent is not defined" error
        // there would point at the stub line anyway.
        if (fallbackBindings.length === 0) {
          // Every named binding is either already in scope or now stubbed —
          // nothing to strip, no dangling references possible.
          continue
        }
        // Default + namespace siblings still need to be stripped; keep them
        // recorded so BF053 fires only for those specific names.
        stripped.push({ kind: 'tsx', importPath, bindings: fallbackBindings, loggingPath })
        continue
      }

      // No named bindings (only default / namespace, or unparseable / side-
      // effect-only). Preserve the pre-#1240 behaviour: drop the import and
      // let BF053 fire on dangling references.
      replacements.push({ start: site.start, end: site.endWithNewline, text: '' })
      console.log(`Stripped client component import: ${importPath} from ${loggingPath}`)
      recordStrippedImport(shape, importPath, loggingPath, 'tsx', stripped)
      continue
    }

    let mod = modules.get(result.path)
    if (!mod) {
      // Cycle guard: a `.ts` module that ends up in its own descendants
      // already broke TS itself. We can't safely topo-sort circular IIFEs.
      if (visiting.has(result.path)) {
        console.warn(`Skipping circular relative import: ${importPath} from ${loggingPath}`)
        replacements.push({ start: site.start, end: site.endWithNewline, text: '' })
        recordStrippedImport(shape, importPath, loggingPath, 'circular', stripped)
        continue
      }
      visiting.add(result.path)
      const sourceContent = await readText(result.path)
      const jsCode = transpile(sourceContent, { loader: 'ts' })
      mod = {
        path: result.path,
        topLevelId: `__bf_inline_${modules.size}`,
        transpiledBody: jsCode,
        originalSource: sourceContent,
        searchDirs: [dirname(result.path), ...searchDirs.slice(1)],
        consumerShapes: [],
        imports: new Set(),
      }
      modules.set(result.path, mod)
      // Recurse so transitive consumers are recorded against the inner
      // modules' shapesNeeded BEFORE we build IIFE returns.
      const replacedBody = await walkAndCollect(
        mod.transpiledBody,
        mod.searchDirs,
        modules,
        visiting,
        loggingPath,
        stripped,
        stubDeps,
      )
      mod.transpiledBody = replacedBody
      visiting.delete(result.path)
      console.log(`Inlined: ${importPath} into ${loggingPath}`)
    }

    if (shape) mod.consumerShapes.push(shape)
    else mod.consumerShapes.push({ named: [] }) // side-effect import counts too

    // Replace the consumer's import line with a destructure pulling from
    // the per-module top-level identifier. Side-effect imports just drop
    // the line — the IIFE has already executed at top level.
    const binding = buildConsumerBinding(shape, mod.topLevelId)
    if (binding) {
      // Non-empty binding takes the import's place; keep the trailing
      // newline so the destructure sits on its own line, matching the
      // pre-refactor `content.replace(fullMatch, binding)` semantics.
      replacements.push({ start: site.start, end: site.endNoNewline, text: binding })
    } else {
      replacements.push({ start: site.start, end: site.endWithNewline, text: '' })
    }
  }

  if (replacements.length === 0) return content

  // Splice in descending byte order so earlier offsets stay valid.
  replacements.sort((a, b) => b.start - a.start)
  let out = content
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end)
  }
  return out
}

/**
 * Topological order over the collected import graph. A module that imports
 * another must appear AFTER its dependency in the emitted top-level IIFE
 * stream so the dependency's `__bf_inline_N` binding exists when the
 * dependent's IIFE arrow body evaluates. Post-order DFS, deduped by path.
 */
function topoSort(modules: Map<string, InlinedModule>): InlinedModule[] {
  const visited = new Set<string>()
  const order: InlinedModule[] = []
  function visit(path: string): void {
    if (visited.has(path)) return
    visited.add(path)
    const mod = modules.get(path)
    if (!mod) return
    for (const dep of mod.imports) visit(dep)
    order.push(mod)
  }
  for (const path of modules.keys()) visit(path)
  return order
}

/**
 * Process a single file's relative imports. Two-pass:
 *   1. `walkAndCollect` walks the entire transitive graph, collecting one
 *      `InlinedModule` per unique path and rewriting consumer-side import
 *      lines (parent's AND transitive's) to destructures pulling from a
 *      per-module top-level identifier.
 *   2. After the walk, build each module's IIFE wrap (one per unique path,
 *      in topological order) and prepend them to the parent content. Each
 *      IIFE's return surfaces the union of every name any consumer needs.
 *
 * This guarantees every inlined `.ts` module appears as exactly one
 * top-level IIFE in the parent bundle, regardless of which sibling first
 * imported it. piconic-ai/barefootjs#1153.
 */
async function inlineRelativeImports(
  content: string,
  searchDirs: string[],
  loggingPath: string,
  hoistedAcc: string[],
  errorAcc: CompilerError[],
  stubDeps: Set<string>,
): Promise<string> {
  const modules = new Map<string, InlinedModule>()
  const visiting = new Set<string>()
  const stripped: StrippedImport[] = []
  let parentContent = await walkAndCollect(content, searchDirs, modules, visiting, loggingPath, stripped, stubDeps)

  if (modules.size === 0) {
    // No IIFEs to prepend — the parent content already reflects every
    // strip. Run the dangling-reference scan on it directly.
    for (const err of detectStrippedReferences(parentContent, stripped)) errorAcc.push(err)
    return parentContent
  }

  // Now resolve each module's transitive import edges — the body has
  // already been rewritten with destructures, so the only paths left to
  // sort by are the modules that the body's destructures reference. We
  // walked recursively, so every `walkAndCollect` call inside a module's
  // body has populated `modules` with that module's deps. We tag those
  // edges by re-walking the body for `__bf_inline_N` references? No —
  // simpler: a module's `imports` set is the set of paths it directly
  // references. Track that during the walk via `consumerShapes` in
  // reverse — every consumer that pushed a shape onto module M's list
  // had its own path; we just didn't record the edge there. Instead,
  // populate `imports` from the destructure references textually: each
  // `__bf_inline_N` token in the body identifies a dependency.
  for (const mod of modules.values()) {
    const tokenRe = /__bf_inline_(\d+)\b/g
    for (const m of mod.transpiledBody.matchAll(tokenRe)) {
      const id = `__bf_inline_${m[1]}`
      for (const other of modules.values()) {
        if (other.topLevelId === id && other.path !== mod.path) {
          mod.imports.add(other.path)
        }
      }
    }
  }

  const ordered = topoSort(modules)
  const iifes: string[] = []
  for (const mod of ordered) {
    const { wrapped, hoistedImports } = buildTopLevelIIFE(
      mod.topLevelId,
      mod.transpiledBody,
      mod.consumerShapes,
      mod.originalSource,
    )
    iifes.push(wrapped)
    for (const h of hoistedImports) hoistedAcc.push(h)
  }

  const finalContent = iifes.join('\n') + '\n' + parentContent
  // Run the dangling-reference scan AFTER IIFE assembly so any binding
  // that escaped a strip (whether at the parent level or inside an
  // inlined module's body) gets caught — that body now lives inside an
  // IIFE arrow in `finalContent`.
  for (const err of detectStrippedReferences(finalContent, stripped)) errorAcc.push(err)
  return finalContent
}

/**
 * Resolve relative imports in compiled client JS files.
 *
 * For each client JS file in the manifest:
 * - `.ts` imports: transpile and inline the code (recursively for transitive `.ts` deps)
 * - `.tsx` imports: strip (separately-compiled `'use client'` component)
 * - Not found / circular: strip
 *
 * Returns the set of diagnostics emitted during resolution. The only
 * error currently produced here is `BF053` — a stripped import whose
 * binding is still referenced in the assembled bundle. See
 * `detectStrippedReferences` and piconic-ai/barefootjs#1227.
 */
export async function resolveRelativeImports(
  options: ResolveRelativeImportsOptions,
): Promise<{ errors: CompilerError[]; stubDepsByManifestKey: Record<string, string[]> }> {
  const { distDir, manifest, sourceDirs = [], sourceDirsByManifestKey = {} } = options
  const errors: CompilerError[] = []
  const stubDepsByManifestKey: Record<string, string[]> = {}

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
    const hoistedAcc: string[] = []
    const stubDeps = new Set<string>()
    let next = await inlineRelativeImports(
      content,
      [dirname(filePath), ...perEntryDirs, ...sourceDirs],
      entry.clientJs,
      hoistedAcc,
      errors,
      stubDeps,
    )
    if (stubDeps.size > 0) {
      stubDepsByManifestKey[name] = Array.from(stubDeps).sort()
    }

    // Note: `inlineRelativeImports` runs `detectStrippedReferences` BEFORE
    // the hoisted bare-package imports below are prepended. A stripped
    // relative-import binding name colliding with a hoisted bare-package
    // binding name is not possible inside a single source file (TS
    // forbids same-name imports), so detection sees the complete set of
    // identifiers it needs to classify references against. See #1227.
    //
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

  return { errors, stubDepsByManifestKey }
}
