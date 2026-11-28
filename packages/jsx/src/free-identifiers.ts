/**
 * Free identifiers of an AST node: the names it reads from an enclosing scope.
 * Shared by the analyzer (Phase 1) and the source-facts recorder
 * (`source-facts.ts`).
 */

import ts from 'typescript'

/** A node that binds its parameters for its own extent (arrow, `function`, method, accessor, constructor). */
function isParameterScope(n: ts.Node): n is ts.SignatureDeclaration & { parameters: ts.NodeArray<ts.ParameterDeclaration> } {
  return ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)
    || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n)
    || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)
}

/** `name` is the declared name of a class/object member (`{ label() {} }`), not a read of a binding. */
function isPropertyNameOfMember(parent: ts.Node, name: ts.Identifier): boolean {
  return (ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)
    || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent))
    && parent.name === name
}

/**
 * `id` is a name an expression declares or uses as a key, not a read of a
 * binding: a member name (`a.id`), an object key, a parameter or variable
 * declaration name, a member declaration name or a destructuring key.
 */
function isDeclaredOrKeyName(id: ts.Identifier): boolean {
  const parent = id.parent
  if (!parent) return false
  if (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)
    || ts.isParameter(parent) || ts.isVariableDeclaration(parent)) return parent.name === id
  if (ts.isBindingElement(parent)) return parent.propertyName === id
  if (ts.isFunctionDeclaration(parent)) return parent.name === id
  return isPropertyNameOfMember(parent, id)
}

/**
 * Extract free identifier references from an AST node by walking the tree.
 * Skips property keys, member access properties, bound parameter names,
 * and identifiers nested inside TypeScript type nodes (`as { … }` cast
 * type, type parameter constraints, return type annotations). Type-only
 * identifiers never reference runtime bindings — including them in the
 * free-id set surfaces them as init-locals downstream and demotes the
 * referenced const to `external-name`, which cascades into spurious
 * BF061 diagnostics and `(undefined …)` template fallbacks (#1404).
 */
export function extractFreeIdentifiersFromNode(node: ts.Node, skipsFunction?: (fn: ts.Node) => boolean): Set<string> {
  const ids = new Set<string>()
  const boundNames = new Set<string>()

  function addBindingNames(name: ts.BindingName, out: string[]): void {
    if (ts.isIdentifier(name)) out.push(name.text)
    else if (ts.isObjectBindingPattern(name)) name.elements.forEach(e => addBindingNames(e.name, out))
    else if (ts.isArrayBindingPattern(name)) name.elements.forEach(e => { if (!ts.isOmittedExpression(e)) addBindingNames(e.name, out) })
  }

  function visit(n: ts.Node): void {
    // Type-only nodes (`as { compact?: boolean }`, `: Props`, …) carry
    // identifiers that exist solely in the type checker — they aren't
    // emitted, so they can't be runtime references. Stop the descent
    // here.
    if (ts.isTypeNode(n)) return
    if (ts.isIdentifier(n)) {
      if (isDeclaredOrKeyName(n)) return
      if (boundNames.has(n.text)) return
      ids.add(n.text)
      return
    }
    if (isParameterScope(n)) {
      if (n === node || !skipsFunction?.(n)) visitParameterScope(n)
      return
    }
    ts.forEachChild(n, visit)
  }

  function visitParameterScope(n: ts.SignatureDeclaration & { parameters: ts.NodeArray<ts.ParameterDeclaration> }): void {
    // Bind the parameters (and a function expression's own name) for the
    // function's extent. A name an outer scope already bound stays bound
    // after this function ends, so only the names added here are removed.
    const names: string[] = []
    for (const p of n.parameters) addBindingNames(p.name, names)
    if (ts.isFunctionExpression(n) && n.name) names.push(n.name.text)
    // A computed member name (`{ [key](key) {} }`) is evaluated in the
    // enclosing scope, so visit it before the parameters are bound.
    const computedName = ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)
      ? (ts.isComputedPropertyName(n.name) ? n.name : undefined)
      : undefined
    if (computedName) visit(computedName)
    const added = names.filter(name => !boundNames.has(name))
    for (const name of added) boundNames.add(name)
    ts.forEachChild(n, child => { if (child !== computedName) visit(child) })
    for (const name of added) boundNames.delete(name)
  }

  visit(node)
  return ids
}

/**
 * The free identifiers evaluating the function `fn` reads: those of
 * {@link extractFreeIdentifiersFromNode}, less those read only inside a
 * nested function `fn` creates and never calls. Such a function is one
 * bound to a name (`const f = () => …`, `function f() {}`) that nothing else
 * in `fn` mentions, or one `fn` returns. Any other nested function (called
 * in place, handed to a call, stored in a literal, bound to a name that is
 * read) counts as evaluated.
 */
export function extractEvaluatedFreeIdentifiers(fn: ts.Node): Set<string> {
  const mentioned = mentionCounts(fn)
  return extractFreeIdentifiersFromNode(fn, inner => staysUncalled(inner, mentioned))
}

function staysUncalled(fn: ts.Node, mentioned: ReadonlyMap<string, number>): boolean {
  let at: ts.Node = fn
  while (at.parent && ts.isParenthesizedExpression(at.parent)) at = at.parent
  const parent = at.parent
  if (!parent) return false
  if (ts.isReturnStatement(parent)) return true
  const name = ts.isFunctionDeclaration(fn) ? fn.name
    : ts.isVariableDeclaration(parent) && parent.initializer === at && ts.isIdentifier(parent.name) ? parent.name
    : undefined
  // Its own declaration is the one mention.
  return name !== undefined && (mentioned.get(name.text) ?? 0) <= 1
}

/** How many times each identifier occurs under `root`, declarations included. */
function mentionCounts(root: ts.Node): Map<string, number> {
  const counts = new Map<string, number>()
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) counts.set(n.text, (counts.get(n.text) ?? 0) + 1)
    ts.forEachChild(n, visit)
  }
  visit(root)
  return counts
}
