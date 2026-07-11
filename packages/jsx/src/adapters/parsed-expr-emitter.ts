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

import type { ParsedExpr, FlatDepth, TemplatePart, ObjectLiteralProperty } from '../expression-parser.ts'
import { asCallbackMethodCall } from '../expression-parser.ts'

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
  | 'trimStart'
  | 'trimEnd'
  | 'toFixed'
  | 'split'
  | 'startsWith'
  | 'endsWith'
  | 'replace'
  | 'replaceAll'
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
  // `optional` is true for a `?.`-written access (`user?.name`); see the
  // `ParsedExpr` `member` variant's docstring in `expression-parser.ts`
  // for the single-hop caveat. Every adapter's `member()` implementation
  // that doesn't need it (its lowering is already null-safe) is free to
  // ignore the parameter.
  member(
    object: ParsedExpr,
    property: string,
    computed: boolean,
    optional: boolean,
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
  // A higher-order callback method call (`<object>.<method>(<arrow>, …rest)`,
  // method ∈ `CALLBACK_METHODS`): `.filter`/`.find`/`.every`/`.some`/`.sort`/
  // `.reduce`/`.flatMap`/… (#2018 P5). The adapter serializes the `arrow` body
  // to the runtime evaluator (eval-first) and falls back to a structured
  // lowering when the body is outside the evaluator surface. `restArgs` carries
  // any trailing arguments (e.g. the `.reduce` init).
  callbackMethod(
    method: string,
    object: ParsedExpr,
    arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string
  // A standalone arrow / regex literal. These normally reach an adapter only as
  // a callback argument (handled by `callbackMethod`); emitted standalone they
  // have no template form, so adapters route them to their `unsupported` path.
  arrow(params: string[], body: ParsedExpr, emit: (e: ParsedExpr) => string): string
  regex(raw: string): string
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
  // `.flat(depth?)` gets its own dispatcher arm (#1448 Tier C): it carries
  // a structured `FlatDepth` (the validated literal / `'infinity'`) rather
  // than a `ParsedExpr[]` args list. Non-callback, so it is NOT routed
  // through `callbackMethod`.
  //
  // `depth` is `FlatDepth` for the literal path (unchanged: adapters keep
  // their existing `bf_flat`-family emit exactly as before) or
  // `{ expr: ParsedExpr }` for a DYNAMIC depth (#2094) — an adapter renders
  // `expr` with the `emit` callback and passes the result to a SEPARATE
  // runtime helper that coerces it at render time (JS `ToIntegerOrInfinity`;
  // see the `depthExpr` doc on `ParsedExpr`'s `array-method`/`flat` variant
  // for why this must NOT be the same helper as the literal path — the
  // literal path's `-1` sentinel means "flatten fully", but a genuinely
  // dynamic `-1` means the opposite per JS). Every adapter emits its
  // `flat_dynamic`-family helper for the dynamic form, and every runtime
  // implements the coercion; parity is pinned by the `flat_dynamic`
  // golden helper vectors.
  flatMethod(
    object: ParsedExpr,
    depth: FlatDepth | { expr: ParsedExpr },
    emit: (e: ParsedExpr) => string,
  ): string
  unsupported(raw: string, reason: string): string
}

/**
 * Whether an operand is string-typed, as far as the ParsedExpr tree can
 * tell: a string literal, a template literal, a zero-arg getter call /
 * `props.x` member whose name the adapter knows to be string-valued
 * (`isStringName`, from adapter state), or a `+` chain that is itself a
 * string concatenation. Promoted from the Mojo/Xslate adapters' local
 * copies (their file header marked it a shared candidate) and extended
 * with the template-literal and nested-`+` arms.
 *
 * Consumed by `===`/`!==` lowering on backends whose `==` is numeric
 * (Perl `eq`/`ne`) and by `isStringConcatBinary` below.
 */
export function isStringTypedOperand(expr: ParsedExpr, isStringName: (n: string) => boolean): boolean {
  if (expr.kind === 'literal' && expr.literalType === 'string') return true
  if (expr.kind === 'template-literal') return true
  if (expr.kind === 'call' && expr.callee.kind === 'identifier' && expr.args.length === 0) {
    return isStringName(expr.callee.name)
  }
  if (expr.kind === 'member' && expr.object.kind === 'identifier' && expr.object.name === 'props') {
    return isStringName(expr.property)
  }
  // A bare identifier (#2212): a destructured prop param or a same-file
  // local const, string-typed per the caller's `isStringName` set — each
  // adapter's `collectStringValueNames` already tracks `propsParams`, so a
  // component's own `{ a, b }: { a: string; b: string }` destructure was
  // only unreachable here for lack of this arm; extending
  // `collectStringValueNames` to also walk `ir.metadata.localConstants`
  // (adapter-side change) closes the "two same-file string consts" shape
  // the same way.
  if (expr.kind === 'identifier') return isStringName(expr.name)
  if (expr.kind === 'binary' && expr.op === '+') {
    return isStringTypedOperand(expr.left, isStringName) || isStringTypedOperand(expr.right, isStringName)
  }
  return false
}

/**
 * Whether a `binary` node is JS STRING concatenation rather than numeric
 * addition: `+` with at least one string-typed operand (#2176). JS `+`
 * overloads on operand type; backends whose `+` is numeric-only coerce
 * the strings — Perl renders `'Hello, ' + name` as 0, PHP fatals with
 * "Unsupported operand types" — so their emitters must pick the
 * language's concat operator (`.` / `~`) when this returns true. The
 * decision is shared-layer semantics; each adapter only maps true to
 * its own operator.
 */
export function isStringConcatBinary(
  op: string,
  left: ParsedExpr,
  right: ParsedExpr,
  isStringName: (n: string) => boolean,
): boolean {
  return op === '+' && (isStringTypedOperand(left, isStringName) || isStringTypedOperand(right, isStringName))
}

/**
 * Wrap an emitted binary/logical/ternary OPERAND in parentheses so the
 * source grouping the `ParsedExpr` tree encodes survives infix
 * re-emission (#2173). `(count() + 2) * 3` parses as
 * `binary{*, binary{+}, 3}` — the tree is unambiguous, but an emitter
 * that joins operands textually (`${l} ${op} ${r}`) re-exposes the
 * text to the TARGET language's precedence, silently computing
 * `count + 2 * 3`. Grouping is decided here, in the shared layer
 * (the semantics), so adapters just call this on each operand — no
 * per-language precedence table needed: parenthesizing a compound
 * operand is universally valid, and leaf operands (identifiers,
 * literals, calls, members) stay unwrapped so simple emissions remain
 * byte-identical.
 */
export function groupBinaryOperand(operand: ParsedExpr, emitted: string): string {
  return operand.kind === 'binary' || operand.kind === 'logical' || operand.kind === 'conditional'
    ? `(${emitted})`
    : emitted
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
    case 'call': {
      // A higher-order callback call (`arr.filter(p)` / `arr.sort(cmp)` / …)
      // routes to the dedicated `callbackMethod` arm; any other call is generic.
      const cb = asCallbackMethodCall(expr)
      if (cb) return emitter.callbackMethod(cb.method, cb.object, cb.arrow, cb.args, emit)
      return emitter.call(expr.callee, expr.args, emit)
    }
    case 'member':
      return emitter.member(expr.object, expr.property, expr.computed, expr.optional, emit)
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
    case 'arrow':
      return emitter.arrow(expr.params, expr.body, emit)
    case 'regex':
      return emitter.regex(expr.raw)
    case 'array-literal':
      return emitter.arrayLiteral(expr.elements, emit)
    case 'object-literal':
      return emitter.objectLiteral(expr.properties, expr.raw, emit)
    case 'array-method':
      if (expr.method === 'flat') {
        return emitter.flatMethod(
          expr.object,
          expr.depthExpr ? { expr: expr.depthExpr } : expr.flatDepth,
          emit,
        )
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
