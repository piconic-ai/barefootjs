/**
 * The contract extracted emit modules depend on instead of the concrete
 * `GoTemplateAdapter`.
 *
 * The Go adapter's lowering is deeply mutually recursive (expression ↔
 * condition ↔ rendering), so a module pulled out still needs to call back into
 * the shared per-compile state and the recursive entry points. `GoEmitContext`
 * is that seam: extracted free functions take it as their first argument, and
 * the adapter — which owns the state and implements the entry points — passes
 * `this`. Modules depend on this narrow interface, so they stay unit-testable
 * against a stub.
 *
 * Keep this surface minimal: add a member only when an extracted module
 * genuinely needs it, so the seam documents the real cross-module coupling.
 */

import type ts from 'typescript'

import type { ParsedExpr } from '@barefootjs/jsx'

import type { CompileState } from './lib/compile-state.ts'

export interface GoEmitContext {
  /** Per-compile mutable state (signals, consts, type tables, errors, …). */
  readonly state: CompileState

  /** Parse a JS expression source string into a TS expression node, or null. */
  parseLiteralExpression(value: string): ts.Expression | null

  /**
   * Lower a JS expression to its Go-template form (the core recursive entry).
   * `preParsed` reuses an already-built tree instead of re-parsing `jsExpr`.
   */
  convertExpressionToGo(
    jsExpr: string,
    out?: { parsed?: ParsedExpr },
    preParsed?: ParsedExpr,
  ): string

  /** Lower a JS condition to a Go-template bool + any hoisted preamble. */
  convertConditionToGo(jsCondition: string): { condition: string; preamble: string }

  /** Extract the prop name from a `props.X ?? …` initial value, or null. */
  extractPropNameFromInitialValue(initialValue: string): string | null

  /**
   * Parse a signal-time initial value `props.X ?? <literal>` into the source
   * prop name and the Go-formatted fallback, or null when it isn't that shape.
   */
  extractPropFallback(initialValue: string): { propName: string; goFallback: string } | null

  /**
   * Inline a module string const by name as a Go double-quoted literal
   * (`"<escaped>"`), or null when the name is not such a const (loop vars and
   * outer-loop params are excluded).
   */
  resolveModuleStringConst(name: string): string | null
}
