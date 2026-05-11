// Resolve and inline relative imports in compiled client JS files.

import { dirname, resolve } from 'node:path'
import ts from 'typescript'
import { createError, ErrorCodes, type CompilerError } from '@barefootjs/jsx'
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
 */
function recordStrippedImport(
  fullMatch: string,
  importPath: string,
  loggingPath: string,
  kind: StripKind,
  stripped: StrippedImport[],
): void {
  const shape = parseImportShape(fullMatch)
  if (!shape) return // side-effect import (`import './x'`) — no bound names.
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
 */
async function walkAndCollect(
  content: string,
  searchDirs: string[],
  modules: Map<string, InlinedModule>,
  visiting: Set<string>,
  loggingPath: string,
  stripped: StrippedImport[],
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
      recordStrippedImport(fullMatch, importPath, loggingPath, 'missing', stripped)
      continue
    }

    if (result.path.endsWith('.tsx')) {
      // A sibling `.tsx` reaching this path is, in practice, a `'use client'`
      // component: it has its own compiled `.client.js` and is not callable
      // as a plain function from a client bundle. Drop the import line and
      // record the bindings so a later post-assembly scan can flag any
      // call sites that survived the strip. piconic-ai/barefootjs#1227.
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      console.log(`Stripped client component import: ${importPath} from ${loggingPath}`)
      recordStrippedImport(fullMatch, importPath, loggingPath, 'tsx', stripped)
      continue
    }

    const shape = parseImportShape(fullMatch)
    let mod = modules.get(result.path)
    if (!mod) {
      // Cycle guard: a `.ts` module that ends up in its own descendants
      // already broke TS itself. We can't safely topo-sort circular IIFEs.
      if (visiting.has(result.path)) {
        console.warn(`Skipping circular relative import: ${importPath} from ${loggingPath}`)
        content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
        recordStrippedImport(fullMatch, importPath, loggingPath, 'circular', stripped)
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
      content = content.replace(fullMatch, binding)
    } else {
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
    }
  }

  return content
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
): Promise<string> {
  const modules = new Map<string, InlinedModule>()
  const visiting = new Set<string>()
  const stripped: StrippedImport[] = []
  let parentContent = await walkAndCollect(content, searchDirs, modules, visiting, loggingPath, stripped)

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
): Promise<{ errors: CompilerError[] }> {
  const { distDir, manifest, sourceDirs = [], sourceDirsByManifestKey = {} } = options
  const errors: CompilerError[] = []

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
    let next = await inlineRelativeImports(
      content,
      [dirname(filePath), ...perEntryDirs, ...sourceDirs],
      entry.clientJs,
      hoistedAcc,
      errors,
    )

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

  return { errors }
}
