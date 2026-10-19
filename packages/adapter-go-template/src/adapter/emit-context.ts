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

import type { ParsedExpr, TypeInfo, JsSourceText } from '@barefootjs/jsx'

import type { CompileState } from './lib/compile-state.ts'
import type { PropFallbackVar } from './lib/types.ts'

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
   * A signal's SSR value when it is seeded by a computed prop expression
   * (#3519): evaluated by the runtime evaluator and converted to the
   * signal's own field type, or null for any other seed. Every reader of a
   * signal's seed (its field, a child prop it is forwarded to, a memo
   * lowering that reads it) asks this first, so they agree.
   */
  computedSignalSeed(
    signal: { getter: string; type: TypeInfo; initialValue: JsSourceText; parsed?: ParsedExpr },
    propsParams: readonly { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  ): string | null

  /**
   * Parse a signal-time initial value `props.X ?? <literal>` (or the
   * destructured `x ?? <literal>` form when `preParsed` is given) into the
   * source prop name and the Go-formatted fallback, or null when it isn't
   * that shape. Callers validate the name against `propsParams`.
   */
  extractPropFallback(
    initialValue: JsSourceText,
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
   * Resolve a bare identifier naming a plain module-level const (`const
   * TRACK = 8`, `const OPEN = true`, `const INITIAL: Row[] = [...]`) to its
   * Go literal, dispatched structurally off the const's `ConstantInfo.parsed`
   * — or null when the name is not such a const (loop vars and outer-loop
   * params are excluded, same as `resolveModuleStringConst`). `target.kind
   * === 'go-source'` may bake a composite (array/object) literal against
   * `target.bakeType`; `target.kind === 'template-action'` only resolves a
   * scalar, since a `{{...}}` splice has no valid Go template spelling for a
   * composite literal.
   */
  resolveModuleConstAsGo(
    name: string,
    target: { kind: 'template-action' } | { kind: 'go-source'; bakeType: TypeInfo },
  ): string | null
}
