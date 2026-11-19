/**
 * Whether a function literal runs where it stands.
 *
 * A write or a read inside a function literal happens when the function is
 * called, not where it is written: an event listener, a timer callback, a
 * handler stored in an object. Two shapes do run in place, as part of the
 * statement or initializer that contains them: an IIFE, and the callback of
 * an array iteration method, which calls it before returning.
 *
 * Needs a tree built with parent pointers (`setParentNodes`).
 */

import ts from 'typescript'
import { CALLBACK_METHODS } from './expression-parser.ts'

/**
 * Does this node open a new function scope?
 *
 * The single answer to the one question every declaration collector in
 * the analyzer asks: bindings declared inside a function belong to that
 * function, never to the scope being collected. `visitComponentBody` has
 * always stopped here; `visit` did not, so the inner `const`/`function`
 * declarations of a module-level `const f = (…) => { … }` were collected
 * as module-level declarations of the FILE — hoisted into the init body
 * and into the marked template, where their references to the helper's
 * own parameters are unbound (#2986). A class static block is its own scope
 * too: `class { static { var $ } }` declares `$` in the block, not in the
 * component body.
 */
export function isFunctionScope(node: ts.Node): boolean {
  return ts.isClassStaticBlockDeclaration(node)
    || ts.isArrowFunction(node)
    || ts.isFunctionExpression(node)
    || ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node)
}

/**
 * Whether a function literal outside markup is called where it stands: the
 * callee of a call (an IIFE, `(() => …)()`), or the callback of an array
 * iteration method, which calls it before returning (`xs.map(cb)`, the
 * higher-order methods of `CALLBACK_METHODS`, plus `forEach`). Any other
 * function there is deferred.
 */
export function isInvokedInPlace(fn: ts.Node): boolean {
  let node = fn
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent
  const call = node.parent
  if (!ts.isCallExpression(call)) return false
  if (call.expression === node) return true
  return call.arguments[0] === node && isArrayIterationCallee(call.expression)
}

/** `<receiver>.<method>` where `method` is an array iteration method that calls its callback in place. */
function isArrayIterationCallee(callee: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(callee)) return false
  const method = callee.name.text
  return CALLBACK_METHODS.has(method) || method === 'forEach'
}

/**
 * Whether `node`, inside `root`, is evaluated when `root` is: no function
 * literal between them other than ones that run in place. `root` itself may
 * be a function (a memo's computation), which is then the thing evaluated.
 */
export function runsInPlace(node: ts.Node, root: ts.Node): boolean {
  for (let n: ts.Node = node; n !== root && n.parent; n = n.parent) {
    const parent = n.parent
    if (parent !== root && isFunctionScope(parent) && !isInvokedInPlace(parent)) return false
  }
  return true
}
