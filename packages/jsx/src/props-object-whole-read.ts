/**
 * Whether a component observes its props object as a whole: any read of the
 * props parameter other than a member read with a known key (`props.x`,
 * `props['x']`). A whole read — `{...props}` on an element or a component,
 * `Object.keys(props)`, `props[key]`, passing `props` to a function,
 * `const { a, ...rest } = props` — can see a key the props type does not
 * declare, so a caller's undeclared prop is not dead there.
 *
 * Syntactic, over the component's TS AST: a nested function, catch clause or
 * block that rebinds the name shadows it, and a type position is not a read.
 * A shadow this misses only makes the answer `true` more often.
 */

import ts from 'typescript'

export function observesWholePropsObject(
  fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  name: string,
): boolean {
  if (!fn.body) return false
  let found = false
  const visit = (node: ts.Node): void => {
    if (found || ts.isTypeNode(node) || rebinds(node, name)) return
    if (ts.isIdentifier(node) && node.text === name && isWholeRead(node)) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(fn.body)
  return found
}

/** A member read with a key known at compile time (`props.x`, `props['x']`). */
function isKnownKeyMemberRead(id: ts.Identifier): boolean {
  const parent = id.parent
  if (ts.isPropertyAccessExpression(parent)) return parent.expression === id
  if (ts.isElementAccessExpression(parent) && parent.expression === id) {
    return ts.isStringLiteralLike(parent.argumentExpression) || ts.isNumericLiteral(parent.argumentExpression)
  }
  return false
}

/** An identifier in a name position (a property name, a declaration, a JSX attribute name), not a read. */
function isNamePosition(id: ts.Identifier): boolean {
  const parent = id.parent
  if (ts.isPropertyAccessExpression(parent)) return parent.name === id
  if (ts.isPropertyAssignment(parent) || ts.isJsxAttribute(parent)) return parent.name === id
  if (ts.isBindingElement(parent)) return parent.name === id || parent.propertyName === id
  if (ts.isVariableDeclaration(parent) || ts.isParameter(parent)) return parent.name === id
  if (ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent)) return parent.name === id
  return false
}

function isWholeRead(id: ts.Identifier): boolean {
  if (isNamePosition(id)) return false
  if (isKnownKeyMemberRead(id)) return false
  return !isRestFreeDestructure(id)
}

/** `const { a, b } = props`: reads only the named keys. */
function isRestFreeDestructure(id: ts.Identifier): boolean {
  const parent = id.parent
  if (!ts.isVariableDeclaration(parent) || parent.initializer !== id) return false
  const pattern = parent.name
  return ts.isObjectBindingPattern(pattern) &&
    pattern.elements.every(el => !el.dotDotDotToken && (!el.propertyName || !ts.isComputedPropertyName(el.propertyName)))
}

/** Whether `node` opens a scope that binds `name` again. */
function rebinds(node: ts.Node, name: string): boolean {
  if (ts.isFunctionLike(node)) return node.parameters.some(p => bindsName(p.name, name))
  if (ts.isCatchClause(node)) return !!node.variableDeclaration && bindsName(node.variableDeclaration.name, name)
  if (ts.isBlock(node)) return node.statements.some(s => declaresInBlock(s, name))
  return false
}

function declaresInBlock(stmt: ts.Statement, name: string): boolean {
  if (ts.isVariableStatement(stmt)) return stmt.declarationList.declarations.some(d => bindsName(d.name, name))
  if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) return stmt.name?.text === name
  return false
}

function bindsName(binding: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(binding)) return binding.text === name
  return binding.elements.some(el => !ts.isOmittedExpression(el) && bindsName(el.name, name))
}
