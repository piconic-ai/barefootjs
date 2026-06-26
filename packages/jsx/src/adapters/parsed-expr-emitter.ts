/**
 * Shared ParsedExpr emitter (#1250 phase 1).
 *
 * Each adapter used to carry its own `renderParsedExpr` switch over
 * every `ParsedExpr.kind` (identifier, literal, call, member, binary,
 * unary, logical, conditional, template-literal, higher-order, …). Two
 * problems followed:
 *
 *  1. Drift: adding a new kind required editing every adapter's switch.
 *     The TS compiler couldn't enforce that every adapter handled it;
 *     a forgotten case fell through to a default branch and emitted
 *     placeholder garbage at runtime.
 *  2. Duplication: the recursive traversal — paren wrapping, child
 *     emission, kind-discrimination — was identical across adapters
 *     and rewritten each time.
 *
 * The fix is a single recursion in the compiler that dispatches each
 * kind to a method on an adapter-provided `ParsedExprEmitter`. Every
 * `ParsedExpr.kind` maps to exactly one interface method, so a new
 * kind becomes a TS compile error in every adapter that hasn't been
 * updated. Adapters keep ownership of the target-language details
 * (operator names, capitalisation, primitive registry) because those
 * are not shareable.
 *
 * Method receives:
 *   - The structured children directly (`left`, `right`, `args`, …),
 *     not pre-rendered strings — that lets an emitter inspect a child
 *     before emitting (e.g. Go's `find().prop` short-circuit).
 *   - An `emit` callback to recurse into a child node when it does
 *     want the default rendering. Passing `emit` (rather than letting
 *     emitters call a global) keeps the recursion in this module's
 *     control so future hooks (depth limits, source-map tracking) can
 *     be added in one place.
 */

import type { ParsedExpr, SortComparator, ReduceOp, FlatDepth, FlatMapOp, TemplatePart, ObjectLiteralProperty } from '../expression-parser.ts'

export type HigherOrderMethod = 'filter' | 'every' | 'some' | 'find' | 'findIndex' | 'findLast' | 'findLastIndex'

/**
 * Non-higher-order array methods (#1443). One discriminator for the
 * full set of "value-builtin" method calls on arrays — extending it
 * adds a TS compile error in every adapter, mirroring the drift
 * defence used for `ParsedExpr.kind` itself. Per-call-site method
 * detection (matching `.join` inside an adapter's `call()` emitter)
 * doesn't scale: every new method would need a new branch in every
 * adapter. The IR-level discriminator keeps the lowering surface
 * type-driven and the dispatch in one place.
 *
 * `sort` and `toSorted` are NOT in this union — they get their own
 * `sortMethod()` dispatcher arm because they carry a structured
 * `SortComparator` (not a `ParsedExpr[]` args list), and conflating
 * the two would make `arrayMethod()` need a comparator-or-args
 * runtime check at every call site.
 */
export type ArrayMethod =
  | 'join'
  | 'includes'
  | 'indexOf'
  | 'lastIndexOf'
  | 'at'
  | 'concat'
  | 'slice'
  | 'reverse'
  | 'toReversed'
  | 'toLowerCase'
  | 'toUpperCase'
  | 'trim'
  | 'toFixed'
  | 'split'
  | 'startsWith'
  | 'endsWith'
  | 'replace'
  | 'repeat'
  | 'padStart'
  | 'padEnd'

/**
 * Method names handled by the dedicated `sortMethod()` dispatcher
 * (#1448 Tier B). Both shapes share the lowering — template SSR
 * context renders a snapshot, so the JS mutate-vs-new distinction
 * has no template-level meaning.
 */
export type SortMethod = 'sort' | 'toSorted'

/**
 * `reduce` / `reduceRight` are handled by the dedicated `reduceMethod()`
 * dispatcher arm (#1448 Tier C) for the same reason sort is: they carry
 * a structured `ReduceOp` (the parsed arithmetic-fold spec) rather than
 * a `ParsedExpr[]` args list, so folding them into `arrayMethod()` would
 * force a spec-or-args runtime check at every call site. The method name
 * is threaded through so adapters can pick the fold direction (left for
 * `reduce`, right for `reduceRight`).
 */
export type ReduceMethod = 'reduce' | 'reduceRight'

export type LiteralType = 'string' | 'number' | 'boolean' | 'null'

/**
 * Adapter-side ParsedExpr lowering surface. One method per
 * `ParsedExpr.kind`. The shared `emitParsedExpr` runner dispatches
 * here based on `expr.kind`.
 *
 * Each method receives the structured children (not pre-rendered) so
 * the emitter can inspect their kinds before deciding how to lower
 * them, plus an `emit` callback to recurse on any child it wants the
 * default rendering for.
 */
export interface ParsedExprEmitter {
  identifier(name: string): string
  literal(value: string | number | boolean | null, literalType: LiteralType): string
  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string
  member(
    object: ParsedExpr,
    property: string,
    computed: boolean,
    emit: (e: ParsedExpr) => string,
  ): string
  // Element access with a non-literal index (`arr[index]`). The index
  // is a full `ParsedExpr` (loop variable, arithmetic, etc.); the
  // adapter picks array vs hash deref per target language. #1897.
  indexAccess(
    object: ParsedExpr,
    index: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string
  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string
  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string
  logical(
    op: '&&' | '||' | '??',
    left: ParsedExpr,
    right: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string
  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string
  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string
  arrowFn(param: string, body: ParsedExpr, emit: (e: ParsedExpr) => string): string
  higherOrder(
    method: HigherOrderMethod,
    object: ParsedExpr,
    param: string,
    predicate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string
  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string
  // Emit an object literal `{ a: 1, b: x }`. `raw` is the original
  // expression string so an adapter that doesn't lower object values yet
  // can delegate to `unsupported(raw, …)` and stay byte-identical.
  objectLiteral(
    properties: ObjectLiteralProperty[],
    raw: string,
    emit: (e: ParsedExpr) => string,
  ): string
  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string
  sortMethod(
    method: SortMethod,
    object: ParsedExpr,
    comparator: SortComparator,
    emit: (e: ParsedExpr) => string,
  ): string
  reduceMethod(
    method: ReduceMethod,
    object: ParsedExpr,
    reduceOp: ReduceOp,
    emit: (e: ParsedExpr) => string,
  ): string
  // `.flat(depth?)` gets its own dispatcher arm (#1448 Tier C): it carries
  // a structured `FlatDepth` (the validated literal / `'infinity'`) rather
  // than a `ParsedExpr[]` args list, same rationale as sort / reduce.
  flatMethod(
    object: ParsedExpr,
    depth: FlatDepth,
    emit: (e: ParsedExpr) => string,
  ): string
  // `.flatMap(fn)` value-returning field projection gets its own arm
  // (#1448 Tier C): it carries a structured `FlatMapOp` rather than a
  // `ParsedExpr[]` args list, same rationale as sort / reduce / flat.
  flatMapMethod(
    object: ParsedExpr,
    op: FlatMapOp,
    emit: (e: ParsedExpr) => string,
  ): string
  unsupported(raw: string, reason: string): string
}

/**
 * Single point of dispatch from `ParsedExpr.kind` to the adapter's
 * method. Adapters call this once at their entry point; the recursion
 * threads the `emit` callback for child nodes.
 *
 * The `assertNever` default arm makes adding a new `ParsedExpr.kind`
 * a TS compile error here — and, transitively, in every adapter that
 * hasn't extended its `ParsedExprEmitter` implementation.
 */
export function emitParsedExpr(expr: ParsedExpr, emitter: ParsedExprEmitter): string {
  const emit = (child: ParsedExpr): string => emitParsedExpr(child, emitter)
  switch (expr.kind) {
    case 'identifier':
      return emitter.identifier(expr.name)
    case 'literal':
      return emitter.literal(expr.value, expr.literalType)
    case 'call':
      return emitter.call(expr.callee, expr.args, emit)
    case 'member':
      return emitter.member(expr.object, expr.property, expr.computed, emit)
    case 'index-access':
      return emitter.indexAccess(expr.object, expr.index, emit)
    case 'binary':
      return emitter.binary(expr.op, expr.left, expr.right, emit)
    case 'unary':
      return emitter.unary(expr.op, expr.argument, emit)
    case 'logical':
      return emitter.logical(expr.op, expr.left, expr.right, emit)
    case 'conditional':
      return emitter.conditional(expr.test, expr.consequent, expr.alternate, emit)
    case 'template-literal':
      return emitter.templateLiteral(expr.parts, emit)
    case 'arrow-fn':
      return emitter.arrowFn(expr.param, expr.body, emit)
    case 'higher-order':
      return emitter.higherOrder(expr.method, expr.object, expr.param, expr.predicate, emit)
    case 'array-literal':
      return emitter.arrayLiteral(expr.elements, emit)
    case 'object-literal':
      return emitter.objectLiteral(expr.properties, expr.raw, emit)
    case 'array-method':
      if (expr.method === 'sort' || expr.method === 'toSorted') {
        return emitter.sortMethod(expr.method, expr.object, expr.comparator, emit)
      }
      if (expr.method === 'reduce' || expr.method === 'reduceRight') {
        return emitter.reduceMethod(expr.method, expr.object, expr.reduceOp, emit)
      }
      if (expr.method === 'flat') {
        return emitter.flatMethod(expr.object, expr.flatDepth, emit)
      }
      if (expr.method === 'flatMap') {
        return emitter.flatMapMethod(expr.object, expr.flatMapOp, emit)
      }
      return emitter.arrayMethod(expr.method, expr.object, expr.args, emit)
    case 'unsupported':
      return emitter.unsupported(expr.raw, expr.reason)
    default: {
      const _exhaustive: never = expr
      throw new Error(
        `emitParsedExpr: unhandled ParsedExpr kind ${(_exhaustive as { kind: string }).kind}`,
      )
    }
  }
}
