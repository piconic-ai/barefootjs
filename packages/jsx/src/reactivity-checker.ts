/**
 * Type-based reactivity detection using TypeScript TypeChecker.
 *
 * Detects reactive expressions by checking for the Reactive<T> brand type
 * from @barefootjs/client. Any expression involving a value typed as Reactive<T>
 * is recognized as reactive.
 *
 * This module is the pluggable boundary between the compiler and its type
 * resolution backend. Call sites consume `ReactivityAnalyzer`; swapping the
 * implementation (e.g., migrating from tsc to tsgo) does not ripple outward.
 */

import ts from 'typescript'
import { incrementCounter } from './instrumentation.ts'

const REACTIVE_BRAND = '__reactive'

/**
 * Instrumented wrapper around checker.getTypeAtLocation so we can count
 * query frequency when the bench harness enables instrumentation.
 */
function queryType(checker: ts.TypeChecker, node: ts.Node): ts.Type {
  incrementCounter('typeCheckerQueries')
  return checker.getTypeAtLocation(node)
}

/**
 * Check if a TypeScript type has the Reactive<T> brand.
 * The brand is a phantom property `[__reactive]: true` added via intersection type.
 */
export function isReactiveType(type: ts.Type): boolean {
  return type.getProperty(REACTIVE_BRAND) !== undefined
}

/**
 * Why a node was determined to carry reactivity (or not).
 *
 * Preserved as a structured chain so agent-facing tooling (`bf debug trace`,
 * compiler diagnostics) can explain which sub-expression holds the Reactive<T>
 * brand without re-running the analysis.
 */
export type ReactivityReason =
  | {
      kind: 'brand'
      /** Which AST shape matched the brand. */
      via: 'property-access' | 'identifier' | 'callee'
      /** Source text of the node that carries the brand. */
      nodeText: string
    }
  | {
      kind: 'child'
      /** Which sub-position of the parent contributed the reactive child. */
      via: 'property-access-object' | 'sub-expression'
      /** Source text of the reactive child. */
      childText: string
      /** Reason the child itself was reactive. */
      childReason: ReactivityReason
    }
  | { kind: 'not-reactive' }

export interface ReactivityAnalysis {
  isReactive: boolean
  reason: ReactivityReason
}

/**
 * Pluggable backend for reactivity detection.
 *
 * The default implementation (`brandTypeReactivityAnalyzer`) resolves types via
 * TypeScript's TypeChecker. Alternative backends (tsgo programmatic API, custom
 * symbol tracking, etc.) can satisfy this interface without compiler changes.
 */
export interface ReactivityAnalyzer {
  analyze(node: ts.Node, checker: ts.TypeChecker): ReactivityAnalysis
}

const NOT_REACTIVE: ReactivityAnalysis = { isReactive: false, reason: { kind: 'not-reactive' } }

function safeGetText(node: ts.Node): string {
  try {
    return node.getText()
  } catch {
    return ''
  }
}

function analyze(node: ts.Node, checker: ts.TypeChecker): ReactivityAnalysis {
  // Property access chains (e.g., username.error): check the whole expression first,
  // then recurse only into the object part (not the name) to avoid redundant checks.
  if (ts.isPropertyAccessExpression(node)) {
    try {
      const type = queryType(checker, node)
      if (isReactiveType(type)) {
        return {
          isReactive: true,
          reason: { kind: 'brand', via: 'property-access', nodeText: safeGetText(node) },
        }
      }
    } catch {
      // Type resolution can fail for some nodes; continue walking the object part.
    }
    const sub = analyze(node.expression, checker)
    if (sub.isReactive) {
      return {
        isReactive: true,
        reason: {
          kind: 'child',
          via: 'property-access-object',
          childText: safeGetText(node.expression),
          childReason: sub.reason,
        },
      }
    }
    return NOT_REACTIVE
  }

  // Identifiers: brand is attached directly to the identifier's type.
  if (ts.isIdentifier(node)) {
    try {
      const type = queryType(checker, node)
      if (isReactiveType(type)) {
        return {
          isReactive: true,
          reason: { kind: 'brand', via: 'identifier', nodeText: safeGetText(node) },
        }
      }
    } catch {
      // continue
    }
    return NOT_REACTIVE
  }

  // Call expressions: the callee might be Reactive<() => T>.
  if (ts.isCallExpression(node)) {
    try {
      const calleeType = queryType(checker, node.expression)
      if (isReactiveType(calleeType)) {
        return {
          isReactive: true,
          reason: { kind: 'brand', via: 'callee', nodeText: safeGetText(node) },
        }
      }
    } catch {
      // fall through to child recursion so reactive arguments are still found
    }
  }

  // Recurse into children: if any sub-expression is reactive, this node is
  // reactive by composition. Stop at the first reactive child.
  let foundChild: ReactivityAnalysis | undefined
  let foundChildText = ''
  ts.forEachChild(node, child => {
    if (foundChild?.isReactive) return
    const result = analyze(child, checker)
    if (result.isReactive) {
      foundChild = result
      foundChildText = safeGetText(child)
    }
  })
  if (foundChild?.isReactive) {
    return {
      isReactive: true,
      reason: {
        kind: 'child',
        via: 'sub-expression',
        childText: foundChildText,
        childReason: foundChild.reason,
      },
    }
  }
  return NOT_REACTIVE
}

export const brandTypeReactivityAnalyzer: ReactivityAnalyzer = { analyze }

/**
 * Rich analysis: returns both the boolean and the reasoning chain.
 *
 * Used by debug/agent-facing tooling (`bf debug trace`, error diagnostics)
 * that needs to explain *why* a node was classified as reactive.
 */
export function analyzeReactivity(node: ts.Node, checker: ts.TypeChecker): ReactivityAnalysis {
  return brandTypeReactivityAnalyzer.analyze(node, checker)
}

/**
 * Boolean-only reactivity check. Retained for existing call sites that do not
 * need the reasoning chain.
 */
export function containsReactiveExpression(node: ts.Node, checker: ts.TypeChecker): boolean {
  incrementCounter('reactivityChecks')
  return brandTypeReactivityAnalyzer.analyze(node, checker).isReactive
}

/** Subtree JSX check — same predicate as analyzer-context.ts's getJS() guard. */
function nodeContainsJsx(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true
  return ts.forEachChild(node, nodeContainsJsx) ?? false
}

/**
 * Every node that itself carries the `Reactive<T>` brand within `node`,
 * without stopping at the first match (unlike `analyze`, which only needs
 * one hit to answer "is this reactive"). A caller that needs to read the
 * *text* of the reactive part(s) — e.g. to tell a brand-package wrapper
 * apart from a plain native signal/memo call (#2867) — must not stringify
 * `node` itself: for a `.map()` callback or a ternary with JSX arms, `node`
 * is JSX-bearing, and the write-side trust boundary (`getJS()`,
 * `analyzer-context.ts`) rejects producing text for a JSX-bearing node.
 * Each returned node is JSX-free: property access and identifier leaves
 * cannot contain JSX by construction; a call leaf is the whole call
 * (preserving the `name(...)` shape native-signal/memo regex patterns
 * match against) unless its arguments happen to contain JSX, in which case
 * only the callee is returned instead.
 */
export function collectReactiveBrandLeaves(node: ts.Node, checker: ts.TypeChecker): ts.Node[] {
  const leaves: ts.Node[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n)) {
      try {
        if (isReactiveType(queryType(checker, n))) {
          leaves.push(n)
          return
        }
      } catch {
        // fall through to walking the object part
      }
      visit(n.expression)
      return
    }
    if (ts.isIdentifier(n)) {
      try {
        if (isReactiveType(queryType(checker, n))) leaves.push(n)
      } catch {
        // not reactive
      }
      return
    }
    if (ts.isCallExpression(n)) {
      try {
        if (isReactiveType(queryType(checker, n.expression))) {
          leaves.push(nodeContainsJsx(n) ? n.expression : n)
          return
        }
      } catch {
        // fall through to walking children
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return leaves
}
