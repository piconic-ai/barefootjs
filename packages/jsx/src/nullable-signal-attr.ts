/**
 * Nullish-attribute omission for signal reads (#3304).
 *
 * Hono omits an attribute whose value is `undefined` or `null`
 * (`title={s()}` with `s()` undefined renders no `title`). A DSL adapter
 * emits `name="<value>"` unconditionally, so a nil value renders
 * `title=""` unless the adapter guards the attribute on a nil check. Each
 * DSL adapter already guards a bare reference to a no-default optional prop
 * that way; this module is the one decision for the signal half, which
 * every adapter consults instead of re-deriving it.
 *
 * Only the SSR value matters here — a signal's SSR value is its initial
 * value — and the guard is presence-only: a non-nil value renders exactly
 * as it did unguarded, so over-including a signal never changes output for
 * a non-nil value.
 */

import type { ParsedExpr } from './expression-parser.ts'
import type { ComponentIR, MemoInfo, SignalInfo, TypeInfo } from './types.ts'

function isNullishType(type: TypeInfo): boolean {
  return type.kind === 'primitive' && (type.primitive === 'undefined' || type.primitive === 'null')
}

/** `T | undefined` / `T | null`, or bare `undefined` / `null`. */
function admitsNullish(type: TypeInfo): boolean {
  if (isNullishType(type)) return true
  return type.kind === 'union' && (type.unionTypes ?? []).some(isNullishType)
}

/** `undefined` / `null` as a parsed initial value. */
export function isNullishLiteral(expr: ParsedExpr | undefined): boolean {
  if (!expr) return false
  if (expr.kind === 'identifier') return expr.name === 'undefined'
  return expr.kind === 'literal' && expr.literalType === 'null'
}

/**
 * Whether the signal's SSR value can be nullish. The witness is its type
 * admitting `undefined`/`null` (a zero-arg `createSignal<T>()` is typed
 * `T | undefined`, #3215), or, for an untyped signal, a literal `undefined` /
 * `null` initial value.
 */
export function isNullableSignal(signal: SignalInfo): boolean {
  if (admitsNullish(signal.type)) return true
  return signal.type.kind === 'unknown' && isNullishLiteral(signal.parsed)
}

/** Getter names of the component's signals whose SSR value can be nullish. */
export function collectNullableSignalGetters(ir: ComponentIR): Set<string> {
  return new Set((ir.metadata.signals ?? []).filter(isNullableSignal).map(s => s.getter))
}

/**
 * The getter an attribute value reads when the whole value is a bare,
 * zero-argument getter call (`s()`); `null` for any other shape. A member
 * read, a ternary or a template literal around the call is not matched:
 * the attribute's presence then depends on more than the signal.
 */
export function bareGetterCallName(parsed: ParsedExpr | undefined): string | null {
  if (!parsed || parsed.kind !== 'call' || parsed.args.length !== 0) return null
  return parsed.callee.kind === 'identifier' ? parsed.callee.name : null
}

/**
 * The signal getter whose nil check should guard this attribute, or `null`
 * when the attribute is not a bare read of a nullable signal. `nullable` is
 * the set `collectNullableSignalGetters` built for the component.
 */
export function nullableSignalAttrGetter(
  parsed: ParsedExpr | undefined,
  nullable: ReadonlySet<string>,
): string | null {
  const getter = bareGetterCallName(parsed)
  return getter !== null && nullable.has(getter) ? getter : null
}

/**
 * What `attrValueMayBeNullish` needs to know about the component: its
 * nullable signal getters and its memos by name.
 */
export interface NullishAttrContext {
  readonly nullableSignals: ReadonlySet<string>
  readonly memos: ReadonlyMap<string, MemoInfo>
}

export function collectNullishAttrContext(ir: ComponentIR): NullishAttrContext {
  return {
    nullableSignals: collectNullableSignalGetters(ir),
    memos: new Map((ir.metadata.memos ?? []).map(m => [m.name, m])),
  }
}

/**
 * Whether an attribute value's SSR value can be `undefined` / `null`, so a
 * DSL adapter must guard the attribute on a nil check to omit it the way
 * Hono does (#3322) — the derived-value half of the bare-signal guard
 * (`nullableSignalAttrGetter`, #3304). Matches a value that reaches a
 * nullish value through:
 *
 * - a read of a nullable signal or of a memo whose type or body can be
 *   nullish (`label()` with `label = createMemo(() => s())`);
 * - an optional member read (`user()?.name`), or a member read of a value
 *   that can itself be nullish;
 * - a ternary branch, or an `??` / `||` / `&&` operand the result can be;
 * - a literal `undefined` / `null`.
 *
 * Like the bare-signal guard it is presence-only: a non-nil value renders
 * exactly as unguarded, so over-including a value never changes output for
 * a present value (`''`, `0` and `false` still render). `isShadowed` names
 * a getter a loop binding hides at the attribute site, which is then not
 * the signal / memo; a memo's own body is read in its declaration scope.
 */
export function attrValueMayBeNullish(
  parsed: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): boolean {
  const visiting = new Set<string>()
  // `shadowed` is the scope the expression is read in: the attribute site's
  // loop bindings at the top level, none inside a memo body — its getters
  // resolve where the memo is declared, not where it is read.
  const walk = (expr: ParsedExpr, shadowed: (name: string) => boolean): boolean => {
    switch (expr.kind) {
      case 'identifier':
        return expr.name === 'undefined'
      case 'literal':
        return expr.literalType === 'null'
      case 'call': {
        const getter = bareGetterCallName(expr)
        if (getter === null || shadowed(getter)) return false
        if (ctx.nullableSignals.has(getter)) return true
        const memo = ctx.memos.get(getter)
        if (!memo || visiting.has(getter)) return false
        if (admitsNullish(memo.type)) return true
        visiting.add(getter)
        const result = memo.parsed !== undefined && walk(memo.parsed, () => false)
        visiting.delete(getter)
        return result
      }
      case 'member':
        return expr.optional || walk(expr.object, shadowed)
      case 'index-access':
        return walk(expr.object, shadowed)
      case 'conditional':
        return walk(expr.consequent, shadowed) || walk(expr.alternate, shadowed)
      case 'logical':
        return expr.op === '&&'
          ? walk(expr.left, shadowed) || walk(expr.right, shadowed)
          : walk(expr.right, shadowed)
      default:
        return false
    }
  }
  return parsed !== undefined && walk(parsed, isShadowed)
}
