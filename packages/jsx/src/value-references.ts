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
