/**
 * The contract extracted emit modules depend on instead of the concrete
 * `GoTemplateAdapter`.
 *
 * The Go adapter's lowering is deeply mutually recursive (expression lowering ↔
 * condition lowering ↔ rendering), so a cluster pulled into its own module
 * still needs to call back into the shared per-compile state and the recursive
 * entry points. `GoEmitContext` is that seam: extracted free functions take a
 * `GoEmitContext` as their first argument, and the adapter — which owns the
 * state and implements the entry points — passes `this`. Modules depend on this
 * narrow interface, not the 8k-line class, so the dependency is explicit and
 * the modules are unit-testable against a stub.
 *
 * Keep this surface minimal: add a member only when an extracted module
 * genuinely needs it, so the seam documents the real cross-module coupling
 * rather than re-exposing the whole adapter.
 */

import type ts from 'typescript'

import type { ParsedExpr } from '@barefootjs/jsx'

import type { CompileState } from './lib/compile-state.ts'

export interface GoEmitContext {
  /** Per-compile mutable state (signals, consts, type tables, errors, …). */
  readonly state: CompileState

  /** Parse a JS expression source string into a TS expression node, or null. */
  parseLiteralExpression(value: string): ts.Expression | null

  /** Lower a JS expression to its Go-template form (the core recursive entry). */
  convertExpressionToGo(jsExpr: string, out?: { parsed?: ParsedExpr }): string

  /** Lower a JS condition to a Go-template bool + any hoisted preamble. */
  convertConditionToGo(jsCondition: string): { condition: string; preamble: string }
}
