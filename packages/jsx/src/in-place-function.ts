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

/** Whether a class expression is constructed where it stands: `new (class { … })()`. */
function isConstructedInPlace(cls: ts.Node): boolean {
  let node = cls
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent
  return ts.isNewExpression(node.parent) && node.parent.expression === node
}

/**
 * The scope whose DEFERRED part `child` is, given its `parent`: a
 * function-like's parameters and body, or an instance field's initializer.
 * `null` for every part that is evaluated where the function or class is
 * created, in the surrounding scope:
 *
 *   - a method's, accessor's or field's computed name (`{ [k]() {} }`,
 *     `class { [k] = 1 }`), and a decorator;
 *   - a `static` field's initializer and a `static { … }` block, which run
 *     when the class is created;
 *   - a class's `extends` expression (no member of the class holds it).
 */
function deferredScopeOf(child: ts.Node, parent: ts.Node): ts.Node | null {
  if (ts.isPropertyDeclaration(parent)) {
    const isStatic = parent.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) ?? false
    return parent.initializer === child && !isStatic ? parent : null
  }
  if (!ts.isFunctionLike(parent)) return null
  const name = (parent as { name?: ts.Node }).name
  return name === child || ts.isDecorator(child) ? null : parent
}

/**
 * Whether a deferred scope (`deferredScopeOf`) inside a statement is only
 * run later: a function literal the statement does not call where it
 * stands, or the constructor and instance fields of a class it does not
 * construct where it stands.
 */
function defersPastStatement(scope: ts.Node): boolean {
  if (ts.isPropertyDeclaration(scope) || ts.isConstructorDeclaration(scope)) return !isConstructedInPlace(scope.parent)
  return !isInvokedInPlace(scope)
}

/**
 * Whether `node`, inside `root`, is evaluated when `root` is: it sits in no
 * deferred scope that `defers` says is only run later. `root` itself may be
 * a function (a memo's computation), which is then the thing evaluated.
 *
 * `defers` defaults to a statement's rule (`defersPastStatement`): a function
 * literal is deferred unless the statement runs it in place.
 */
export function runsInPlace(node: ts.Node, root: ts.Node, defers: (scope: ts.Node) => boolean = defersPastStatement): boolean {
  for (let n: ts.Node = node; n !== root && n.parent; n = n.parent) {
    const parent = n.parent
    if (parent === root) continue
    const scope = deferredScopeOf(n, parent)
    if (scope && defers(scope)) return false
  }
  return true
}
