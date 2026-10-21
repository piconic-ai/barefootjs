/**
 * Whether an identifier is WRITTEN by the expression that contains it.
 *
 * Every substitution the compiler performs over a parsed expression (a
 * destructured prop's live read `_p.x ?? d`, a constant's inlined value, a
 * signal's initial value in the client template) replaces a READ of a
 * binding with an expression that produces its value. A write position
 * cannot take that replacement: `++nextId` becomes `++(0)` and `start += 1`
 * becomes `(_p.start ?? 0) += 1`, both a SyntaxError that breaks the whole
 * client module. The substitution walks ask this predicate first and leave
 * a written identifier alone; the caller then decides what a write to the
 * binding means in its scope (a local in the init body, a template slot
 * left to init).
 *
 * Needs a tree built with parent pointers (`setParentNodes`).
 */

import ts from 'typescript'

/** `=`, and every compound assignment (`+=`, `??=`, `<<=`, …). */
function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

/** Wrappers that keep their operand an assignment target: `(x) = 1`, `x! = 1`, `(x as T) = 1`. */
function isTransparentWrapper(n: ts.Node): boolean {
  return (
    ts.isParenthesizedExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isTypeAssertionExpression(n) ||
    ts.isSatisfiesExpression(n)
  )
}

/**
 * The node one level up a destructuring-assignment pattern from `node`, or
 * null when `parent` is not a pattern piece that keeps `node` a target: an
 * array element or spread (`[x, ...rest] = …`), an object shorthand or
 * property value (`({ x, k: y } = …)`), or an object spread.
 */
function patternContainer(node: ts.Node, parent: ts.Node): ts.Node | null {
  if (ts.isArrayLiteralExpression(parent) || ts.isObjectLiteralExpression(parent)) return parent
  if (ts.isSpreadElement(parent) || ts.isSpreadAssignment(parent)) return parent
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) return parent
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) return parent
  return null
}

/**
 * True when `id` is the target of an assignment (`x = …`, `x += …`), an
 * update (`++x`, `x--`), a destructuring assignment (`[x, y] = …`,
 * `({ x } = …)`, `[x = 1] = …`) or a `for (x of …)` / `for (x in …)` head.
 * A member write (`x.a = 1`, `x[i]++`) writes the object, not the binding,
 * so `x` there is a read.
 */
export function isAssignmentTargetIdentifier(id: ts.Identifier): boolean {
  let node: ts.Node = id
  let parent: ts.Node | undefined = id.parent
  while (parent) {
    if (isTransparentWrapper(parent)) {
      node = parent
      parent = parent.parent
      continue
    }
    if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) {
      return parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken
    }
    if (ts.isBinaryExpression(parent)) {
      return parent.left === node && isAssignmentOperator(parent.operatorToken.kind)
    }
    if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === node) return true
    const container = patternContainer(node, parent)
    if (!container) return false
    node = container
    parent = container.parent
  }
  return false
}
