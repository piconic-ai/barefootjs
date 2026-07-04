/**
 * The contract the extracted expression-emitter modules depend on instead of
 * the concrete `TwigAdapter`.
 *
 * Ported from `packages/adapter-jinja/src/adapter/emit-context.ts`. The Twig
 * adapter's top-level expression lowering is mutually recursive with the
 * adapter's own const/record resolution and its filter-predicate emitter, so
 * the extracted `TwigTopLevelEmitter` still needs to call back into shared
 * per-compile state and recursive entry points. `TwigEmitContext` is that
 * seam: the emitter takes a `TwigEmitContext` built by the adapter's private
 * `emitCtx` getter (the adapter does NOT `implements` this interface, so the
 * wrapped members stay private and off its exported public type). The
 * emitter depends on this narrow interface rather than the full class, so
 * the coupling is explicit and it's unit-testable against a stub.
 *
 * Keep this surface minimal: add a member only when an extracted module
 * genuinely needs it, so the seam documents the real cross-module coupling
 * rather than re-exposing the whole adapter.
 */

import type { ParsedExpr, CompilerError, IRMetadata } from '@barefootjs/jsx'

export interface TwigEmitContext {
  /**
   * (#1922) Local binding names the request-scoped `searchParams()` env signal
   * is imported under. Non-empty enables the env-signal method-call lowering.
   */
  readonly _searchParamsLocals: Set<string>

  /**
   * Inline a module-scope pure string-literal const by name as the resolved
   * literal value, or null when the name is not such a const.
   */
  _resolveModuleStringConst(name: string): string | null

  /** Resolve a literal const (`const totalPages = 5`) to its Twig value, or null. */
  _resolveLiteralConst(name: string): string | null

  /**
   * Resolve a static property access on a module object-literal const
   * (`variantClasses.ghost`) to its Twig value at compile time, or null.
   */
  _resolveStaticRecordLiteral(objectName: string, key: string): string | null

  /** Record a BF101 unsupported-expression diagnostic. */
  _recordExprBF101(message: string, reason?: string): void

  /** Lower a filter/predicate body to its Twig form, bound to `param`. */
  _renderTwigFilterExprPublic(expr: ParsedExpr, param: string): string
}

/**
 * The contract the extracted object-literal / conditional-spread lowering
 * (`spread/spread-codegen.ts`) depends on. Declared separately from
 * `TwigEmitContext` so each extracted module's real coupling is documented
 * precisely. Mirror of the Jinja adapter's `JinjaSpreadContext`.
 */
export interface TwigSpreadContext {
  /** Component name, for diagnostic source locations. */
  readonly componentName: string

  /** Per-compile diagnostic list the spread lowering appends to. */
  readonly errors: CompilerError[]

  /** Local-constant metadata, for resolving `Record[key]` spread values. */
  readonly localConstants: IRMetadata['localConstants']

  /** Prop params, for classifying a bare-identifier index as a prop. */
  readonly propsParams: { name: string }[]

  /**
   * Lower a JS expression to its Twig form (the core recursive entry).
   *
   * When the IR already carries a structured `ParsedExpr` tree, pass it as
   * `preParsed` so the converter threads it straight through instead of
   * re-parsing `expr`. With `preParsed` set, `expr` is unused for parsing
   * (the converter derives any diagnostic text from the tree), so callers
   * may pass `''`.
   */
  convertExpressionToTwig(expr: string, preParsed?: ParsedExpr): string

  /**
   * Lower a JS expression to a Twig CONDITION (routes through `bf.truthy`
   * unless the expression is structurally already boolean-shaped — see
   * `boolean-result.ts`). Used for the conditional-spread ternary's test,
   * which is a condition position, not a value position. Same `preParsed`
   * contract as `convertExpressionToTwig`.
   */
  convertConditionToTwig(expr: string, preParsed?: ParsedExpr): string
}

/**
 * The contract the extracted in-template memo / context seeding
 * (`memo/seed.ts`) depends on. The seed lowering recurses into the core
 * expression lowering to compute a derived signal/memo value or a context
 * default; that recursive entry is its only adapter coupling.
 */
export interface TwigMemoContext {
  /**
   * Lower a JS expression to its Twig form (the core recursive entry). See
   * `TwigSpreadContext.convertExpressionToTwig` for the `preParsed` contract.
   */
  convertExpressionToTwig(expr: string, preParsed?: ParsedExpr): string

  /**
   * Per-compile diagnostic list `convertExpressionToTwig` appends to on an
   * unsupported shape (`_recordExprBF101`). `memo/seed.ts`'s
   * `generateDerivedMemoSeed` is a SPECULATIVE "try this in-template
   * recomputation, else fall back to the static ssrDefault seed" attempt per
   * plan step — unlike every other `convertExpressionToTwig` call site, a
   * failure here must NOT become a hard compile error, so it snapshots this
   * array's length before calling in and truncates back to it on failure
   * (discarding whatever `_recordExprBF101` appended) rather than letting
   * the error escape.
   */
  readonly errors: CompilerError[]
}
