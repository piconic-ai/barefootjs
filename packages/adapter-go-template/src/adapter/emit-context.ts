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

import type { ParsedExpr } from '@barefootjs/jsx'

import type { CompileState } from './lib/compile-state.ts'

export interface GoEmitContext {
  /** Per-compile mutable state (signals, consts, type tables, errors, …). */
  readonly state: CompileState

  /**
   * Lower a JS expression to its Go-template form (the core recursive entry).
   * `preParsed` reuses an already-built tree instead of re-parsing `jsExpr`.
   */
  convertExpressionToGo(
    jsExpr: string,
    out?: { parsed?: ParsedExpr },
    preParsed?: ParsedExpr,
  ): string

  /**
   * Lower a JS condition to a Go-template bool + any hoisted preamble.
   * `preParsed` reuses an already-built tree instead of re-parsing `jsCondition`.
   */
  convertConditionToGo(
    jsCondition: string,
    preParsed?: ParsedExpr,
  ): { condition: string; preamble: string }

  /**
   * Extract the prop name from a `props.X ?? …` initial value — or, given
   * `preParsed` in a destructured component, an `x ?? …` identifier form —
   * or null. Callers validate the name against `propsParams`.
   */
  extractPropNameFromInitialValue(initialValue: string, preParsed?: ParsedExpr): string | null

  /**
   * Parse a signal-time initial value `props.X ?? <literal>` (or the
   * destructured `x ?? <literal>` form when `preParsed` is given) into the
   * source prop name and the Go-formatted fallback, or null when it isn't
   * that shape. Callers validate the name against `propsParams`.
   */
  extractPropFallback(
    initialValue: string,
    preParsed?: ParsedExpr,
  ): { propName: string; goFallback: string } | null

  /**
   * #2683: match the collision-derivation shape `(props.X ?? <lit>) <op>
   * <int>` against an already-resolved `ParsedExpr` — the ONE non-idempotent
   * form this adapter faithfully lowers when a signal's Go field name
   * collides with its own prop's field. Composes
   * {@link extractPropFallback}'s structural presence-check recognition
   * (applied to the embedded `??` subtree) with the same non-negative-
   * integer arithmetic wrap the memo-computation emitter already supports
   * for a bare `props.X <op> N`. Returns null for any other shape.
   */
  extractCollisionDerivation(
    parsed: ParsedExpr | undefined,
  ): { propName: string; goFallback: string; operator: string; operand: string } | null

  /**
   * Inline a module string const by name as a Go double-quoted literal
   * (`"<escaped>"`), or null when the name is not such a const (loop vars and
   * outer-loop params are excluded).
   */
  resolveModuleStringConst(name: string): string | null

  /**
   * Inline a module numeric const by name as its Go literal text (e.g.
   * `8`, `-3.5`), or null when the name is not such a const (loop vars and
   * outer-loop params are excluded, same as `resolveModuleStringConst`).
   */
  resolveModuleNumericConst(name: string): string | null

  /**
   * Inline a module boolean const by name as its Go literal text
   * (`true`/`false`), or null when the name is not such a const (same
   * exclusions as `resolveModuleNumericConst`).
   */
  resolveModuleBooleanConst(name: string): string | null
}
