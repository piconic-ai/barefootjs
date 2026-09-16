/**
 * The contract the extracted expression-emitter modules depend on instead of
 * the concrete `PebbleAdapter`.
 *
 * Ported from `packages/adapter-xslate/src/adapter/emit-context.ts`. The
 * Pebble adapter's top-level expression lowering is mutually recursive with
 * the adapter's own const/record resolution and its filter-predicate
 * emitter, so the extracted `PebbleTopLevelEmitter` still needs to call back
 * into shared per-compile state and recursive entry points.
 * `PebbleEmitContext` is that seam: the emitter takes a `PebbleEmitContext`
 * built by the adapter's private `emitCtx` getter (the adapter does NOT
 * `implements` this interface, so the wrapped members stay private and off
 * its exported public type). The emitter depends on this narrow interface
 * rather than the full class, so the coupling is explicit and it's
 * unit-testable against a stub.
 *
 * Keep this surface minimal: add a member only when an extracted module
 * genuinely needs it, so the seam documents the real cross-module coupling
 * rather than re-exposing the whole adapter.
 */

import type { ParsedExpr, CompilerError, IRMetadata, LoweringMatcher } from '@barefootjs/jsx'

export interface PebbleEmitContext {
  /**
   * (#1922) Local binding names the request-scoped `searchParams()` env signal
   * is imported under. Non-empty enables the env-signal method-call lowering.
   */
  readonly _searchParamsLocals: Set<string>

  /**
   * Registered lowering-plugin matchers (#2057), bound to this component's
   * metadata at init. Read by `PebbleTopLevelEmitter`'s `lowering` seam
   * (#2843) so a registered call — the built-in `queryHref`, or any
   * userland plugin — is recognised no matter where it sits in an
   * expression tree (a ternary branch, a template-literal interpolation, …),
   * not only when it's the call the adapter's own top-level conversion
   * entry point (`convertExpressionToPebble`) is asked to lower directly.
   */
  readonly _loweringMatchers: readonly LoweringMatcher[]

  /**
   * Inline a module-scope pure string-literal const by name as the resolved
   * literal value, or null when the name is not such a const.
   */
  _resolveModuleStringConst(name: string): string | null

  /** Resolve a literal const (`const totalPages = 5`) to its Pebble value, or null. */
  _resolveLiteralConst(name: string): string | null

  /**
   * Resolve a static property access on a module object-literal const
   * (`variantClasses.ghost`) to its Pebble value at compile time, or null.
   */
  _resolveStaticRecordLiteral(objectName: string, key: string): string | null

  /** Record a BF101 unsupported-expression diagnostic. */
  _recordExprBF101(message: string, reason?: string): void

  /** Lower a filter/predicate body to its Pebble form, bound to `param`. */
  _renderPebbleFilterExprPublic(expr: ParsedExpr, param: string): string

  /**
   * Whether `name` (a signal getter, prop, or same-file local const) holds a
   * string value — consumed by `isStringConcatBinary` (`@barefootjs/jsx`) to
   * route a JS `+` with a string-typed operand through Pebble's `~` concat
   * operator instead of numeric `+` (mirrors the Twig adapter's identical
   * need; see `pebble-adapter.ts`'s file header for why this is a real
   * divergence here, unlike Jinja, which never needed this gate).
   */
  _isStringValueName(name: string): boolean
}

/**
 * The contract the extracted object-literal / conditional-spread lowering
 * (`spread/spread-codegen.ts`) depends on. Declared separately from
 * `PebbleEmitContext` so each extracted module's real coupling is documented
 * precisely. Mirror of the Xslate adapter's `XslateSpreadContext`.
 */
export interface PebbleSpreadContext {
  /** Component name, for diagnostic source locations. */
  readonly componentName: string

  /** Per-compile diagnostic list the spread lowering appends to. */
  readonly errors: CompilerError[]

  /** Local-constant metadata, for resolving `Record[key]` spread values. */
  readonly localConstants: IRMetadata['localConstants']

  /** Prop params, for classifying a bare-identifier index as a prop. */
  readonly propsParams: { name: string }[]

  /**
   * Lower a JS expression to its Pebble form (the core recursive entry).
   *
   * When the IR already carries a structured `ParsedExpr` tree, pass it as
   * `preParsed` so the converter threads it straight through instead of
   * re-parsing `expr`. With `preParsed` set, `expr` is unused for parsing
   * (the converter derives any diagnostic text from the tree), so callers
   * may pass `''`.
   */
  convertExpressionToPebble(expr: string, preParsed?: ParsedExpr): string

  /**
   * Lower a JS expression to a Pebble CONDITION (routes through `bf.truthy`
   * unless the expression is structurally already boolean-shaped — see
   * `boolean-result.ts`). Used for the conditional-spread ternary's test,
   * which is a condition position, not a value position. Same `preParsed`
   * contract as `convertExpressionToPebble`.
   */
  convertConditionToPebble(expr: string, preParsed?: ParsedExpr): string
}

/**
 * The contract the extracted in-template memo / context seeding
 * (`memo/seed.ts`) depends on. The seed lowering recurses into the core
 * expression lowering to compute a derived signal/memo value or a context
 * default; that recursive entry is its only adapter coupling.
 */
export interface PebbleMemoContext {
  /**
   * Lower a JS expression to its Pebble form (the core recursive entry). See
   * `PebbleSpreadContext.convertExpressionToPebble` for the `preParsed` contract.
   * `pos` (default `'rendered'`) must be `'value'` for a derived-seed RHS —
   * an assignment, not a render — so the internal support gate matches the
   * `isSupportedValue` classification the seed plan already used.
   */
  convertExpressionToPebble(expr: string, preParsed?: ParsedExpr, pos?: 'rendered' | 'value'): string

  /**
   * Per-compile diagnostic list `convertExpressionToPebble` appends to on an
   * unsupported shape (`_recordExprBF101`). `memo/seed.ts`'s
   * `generateDerivedMemoSeed` is a SPECULATIVE "try this in-template
   * recomputation, else fall back to the static ssrDefault seed" attempt per
   * plan step — unlike every other `convertExpressionToPebble` call site, a
   * failure here must NOT become a hard compile error, so it snapshots this
   * array's length before calling in and truncates back to it on failure
   * (discarding whatever `_recordExprBF101` appended) rather than letting
   * the error escape.
   */
  readonly errors: CompilerError[]
}
