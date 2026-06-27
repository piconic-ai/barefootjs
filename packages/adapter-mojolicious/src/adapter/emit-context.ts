/**
 * The contract the extracted expression-emitter modules depend on instead of
 * the concrete `MojoAdapter`.
 *
 * The Mojo adapter's top-level expression lowering is mutually recursive with
 * the adapter's own const/record resolution and its filter-predicate emitter,
 * so the extracted `MojoTopLevelEmitter` still needs to call back into shared
 * per-compile state and recursive entry points. `MojoEmitContext` is that
 * seam: the emitter takes a `MojoEmitContext` (the adapter passes `this`),
 * depending on this narrow interface rather than the full ~3k-line class, so
 * the coupling is explicit and the emitter is unit-testable against a stub.
 *
 * Keep this surface minimal: add a member only when an extracted module
 * genuinely needs it, so the seam documents the real cross-module coupling
 * rather than re-exposing the whole adapter.
 */

import type { ParsedExpr } from '@barefootjs/jsx'

export interface MojoEmitContext {
  /**
   * (#1922) Local binding names the request-scoped `searchParams()` env signal
   * is imported under. Non-empty enables the env-signal method-call lowering.
   */
  readonly _searchParamsLocals: Set<string>

  /**
   * Inline a module-scope pure string-literal const by name as the resolved
   * literal value, or null when the name is not such a const.
   */
  resolveModuleStringConst(name: string): string | null

  /** Resolve a literal const (`const totalPages = 5`) to its Perl value, or null. */
  resolveLiteralConst(name: string): string | null

  /**
   * Resolve a static property access on a module object-literal const
   * (`variantClasses.ghost`) to its Perl value at compile time, or null.
   */
  resolveStaticRecordLiteral(objectName: string, key: string): string | null

  /** Whether a getter/prop name resolves to a string-typed SSR value. */
  _isStringValueName(name: string): boolean

  /** Record a BF101 unsupported-expression diagnostic. */
  _recordExprBF101(message: string, reason?: string): void

  /** Lower a filter/predicate body to its Perl form, bound to `param`. */
  _renderPerlFilterExprPublic(expr: ParsedExpr, param: string): string
}
