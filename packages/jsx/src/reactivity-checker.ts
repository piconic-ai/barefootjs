/**
 * Type-based reactivity detection using TypeScript TypeChecker.
 *
 * Detects reactive expressions by checking for the Reactive<T> brand type
 * from @barefootjs/dom. Any expression involving a value typed as Reactive<T>
 * is recognized as reactive.
 */

import ts from 'typescript'

const REACTIVE_BRAND = '__reactive'

/**
 * Check if a TypeScript type has the Reactive<T> brand.
 * The brand is a phantom property `[__reactive]: true` added via intersection type.
 */
export function isReactiveType(type: ts.Type): boolean {
  return type.getProperty(REACTIVE_BRAND) !== undefined
}

/**
 * Check if an AST node or any sub-expression contains a reactive type.
 * Walks the AST recursively, checking each identifier and property access
 * against the TypeChecker to find Reactive<T>-branded types.
 */
export function containsReactiveExpression(node: ts.Node, checker: ts.TypeChecker): boolean {
  // Property access chains (e.g., username.error): check the whole expression,
  // then recurse only into the object part (not the name) to avoid redundant checks
  if (ts.isPropertyAccessExpression(node)) {
    try {
      const type = checker.getTypeAtLocation(node)
      if (isReactiveType(type)) return true
    } catch {
      // Type resolution can fail for some nodes; continue walking
    }
    return containsReactiveExpression(node.expression, checker)
  }

  // Check identifiers directly
  if (ts.isIdentifier(node)) {
    try {
      const type = checker.getTypeAtLocation(node)
      if (isReactiveType(type)) return true
    } catch {
      // continue
    }
    return false
  }

  // Check call expressions — the callee might be Reactive<() => T>
  if (ts.isCallExpression(node)) {
    try {
      const calleeType = checker.getTypeAtLocation(node.expression)
      if (isReactiveType(calleeType)) return true
    } catch {
      // continue
    }
  }

  // Recurse into children
  return ts.forEachChild(node, child => containsReactiveExpression(child, checker)) ?? false
}
