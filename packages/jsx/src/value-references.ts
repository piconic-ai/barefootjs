/**
 * Single door for "is this identifier a VALUE reference in emitted JS".
 *
 * Replaces `\bname\b` text scans at the import-emission sites (#2432): a
 * regex scan can't tell a genuine value reference (`paperColor({ ... })`)
 * from an object key or string literal that merely spells an imported
 * name (`{ Theme: 'テーマ' }`). That false match used to make
 * `collectExternalImports` re-emit a per-specifier type-only import
 * (`import { paperColor, type Theme } from '../lib/theme'`) as a VALUE
 * import, which the CLI's relative-import inliner then placed in the IIFE's
 * `return { … }` with no binding — `ReferenceError: Theme is not defined`
 * at load, killing the whole page's client JS.
 *
 * `packages/cli`'s `detectStrippedReferences` (in the since-deleted
 * `resolve-imports.ts`) used to share this classifier for its own
 * dangling-reference scan; `collectExternalImports` is the remaining
 * caller.
 */

import ts from 'typescript'

/**
 * Identifier-position classifier: returns `true` when `id` is being USED
 * as a value, `false` when it's a declaration name, property key, member-
 * access name, or other non-reference slot.
 *
 * A ShorthandPropertyAssignment (`{ Theme }`) intentionally counts as a
 * reference — it reads the binding, it doesn't just spell its name.
 *
 * CONTRACT: this classifies identifier positions in **JavaScript** source.
 * The current caller parses with `ts.ScriptKind.JS` —
 * `collectValueReferencedNames` below.
 * TypeScript-only positions are deliberately NOT handled: an
 * identifier in a type position (`const x: Foo = …`, a
 * `TypeReferenceNode`) is still reported as a value reference, and so are
 * `interface` / `type` / `enum` declaration names. Do not point this at
 * TypeScript source — it would over-report there.
 *
 * Caveat: this is a syntactic test, not a scope analysis. If a local
 * function parameter happens to share a name with an imported binding,
 * references inside that function's body will count as references to
 * the import (false positive). For the import-emission caller
 * (`makeValueUsageTest` in `ir-to-client-js/imports.ts`), over-counting is
 * the safe direction — an extra import whose binding exists is harmless.
 * It is NOT safe for the BF053 caller (`detectStrippedReferences`): there,
 * an over-reported reference to a stripped binding is a false build
 * error on legal code. That asymmetry is why every exclusion branch below
 * matters — each one is a case that would otherwise misfire BF053.
 */
export function isValueReferenceIdentifier(id: ts.Identifier): boolean {
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
  // Class field name (`class C { helper = 1 }`, including `static helper
  // = 1`): the name is a member key, not a read. The `parent.name === id`
  // guard is what preserves the computed case — in `class C { [helper] =
  // 1 }` the name is a ComputedPropertyName, not `id` itself, so `helper`
  // (inside the brackets) still falls through and counts as a reference.
  if (ts.isPropertyDeclaration(parent) && parent.name === id) return false
  // `new.target` / `import.meta`: `target`/`meta` sits in keyword
  // position, not a binding.
  if (ts.isMetaProperty(parent) && parent.name === id) return false
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
 * Parse `code` and collect the text of every identifier that is a VALUE
 * reference per `isValueReferenceIdentifier`.
 *
 * Returns `null` when the text did not parse cleanly. `null` means
 * "cannot answer" — callers MUST fall back to their previous (regex-scan)
 * behaviour rather than treating it as an empty set. Narrowing on a
 * partial parse would DROP a needed import, which is the failure
 * direction we must never take (a phantom missing-import build failure
 * is recoverable; a silently dead client bundle is not).
 */
export function collectValueReferencedNames(code: string): Set<string> | null {
  let sourceFile: ts.SourceFile
  try {
    sourceFile = ts.createSourceFile(
      'generated.js',
      code,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ true,
      ts.ScriptKind.JS,
    )
  } catch {
    return null
  }

  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics
  if (diagnostics && diagnostics.length > 0) return null

  const names = new Set<string>()
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && isValueReferenceIdentifier(node)) {
      names.add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return names
}

/**
 * The nodes that open a binding scope in emitted JS: the module, every
 * function-like node and class static block (its parameters and hoisted
 * `var` / function names),
 * blocks, `for` heads, `case` blocks and `catch` clauses (`let` / `const` /
 * class names), and class expressions (their own name).
 */
function isScopeNode(node: ts.Node): boolean {
  return (
    isVarScopeNode(node) ||
    ts.isBlock(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCaseBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isClassExpression(node)
  )
}

/**
 * The nodes a `var` (and a parameter) binds into: the module, every
 * function-like node, and a class static block, whose `var`s stay inside
 * it (#3537 review).
 */
function isVarScopeNode(node: ts.Node): boolean {
  return ts.isSourceFile(node) || ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node)
}

function nearestScope(from: ts.Node, functionScoped: boolean): ts.Node {
  let node: ts.Node | undefined = from
  while (node) {
    if (functionScoped ? isVarScopeNode(node) : isScopeNode(node)) return node
    node = node.parent
  }
  return from.getSourceFile()
}

function bindingNames(name: ts.BindingName, out: string[]): string[] {
  if (ts.isIdentifier(name)) {
    out.push(name.text)
  } else {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) bindingNames(element.name, out)
    }
  }
  return out
}

/** The scope each declaration in `sourceFile` binds its names into. */
function collectScopeBindings(sourceFile: ts.SourceFile): Map<ts.Node, Set<string>> {
  const bindings = new Map<ts.Node, Set<string>>()
  const bind = (scope: ts.Node, names: readonly string[]): void => {
    let set = bindings.get(scope)
    if (!set) bindings.set(scope, (set = new Set()))
    for (const name of names) set.add(name)
  }
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)) {
      const list = node.parent
      const isVar = ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.BlockScoped) === 0
      bind(nearestScope(list, isVar), bindingNames(node.name, []))
    } else if (ts.isParameter(node)) {
      bind(node.parent, bindingNames(node.name, []))
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      bind(nearestScope(node.parent, false), [node.name.text])
    } else if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) {
      bind(node, [node.name.text])
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      bind(node, bindingNames(node.variableDeclaration.name, []))
      node.block.statements.forEach(visit)
      return
    } else if (ts.isImportClause(node) && node.name) {
      bind(sourceFile, [node.name.text])
    } else if (ts.isNamespaceImport(node) || ts.isImportSpecifier(node)) {
      bind(sourceFile, [node.name.text])
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return bindings
}

/** What {@link analyzeEmittedReferences} reports about one emitted module. */
export interface EmittedReferences {
  /** Value references that no enclosing scope binds: imports or globals. */
  free: Set<string>
  /** Names called directly (`name(…)`), bound or not. */
  called: Set<string>
}

/**
 * Parse emitted client JS and report its unbound value references and its
 * directly called names.
 *
 * Unlike {@link collectValueReferencedNames}, `free` resolves scopes, so a
 * name the module declares itself (a module-level helper emitted as
 * `var insert = …`, a parameter, a block-scoped `const`) is not reported
 * where that declaration is visible (#3537). Hoisting is modelled per
 * scope, not per position: a binding counts for its whole scope.
 *
 * Returns `null` when the text did not parse cleanly, with the same
 * "cannot answer" contract as {@link collectValueReferencedNames}.
 */
export function analyzeEmittedReferences(code: string): EmittedReferences | null {
  let sourceFile: ts.SourceFile
  try {
    sourceFile = ts.createSourceFile('generated.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  } catch {
    return null
  }
  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics
  if (diagnostics && diagnostics.length > 0) return null

  const bindings = collectScopeBindings(sourceFile)
  const isBound = (id: ts.Identifier): boolean => {
    for (let node: ts.Node | undefined = id.parent; node; node = node.parent) {
      if (bindings.get(node)?.has(id.text)) return true
    }
    return false
  }
  const free = new Set<string>()
  const called = new Set<string>()
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && isValueReferenceIdentifier(node) && !isBound(node)) free.add(node.text)
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) called.add(node.expression.text)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { free, called }
}
