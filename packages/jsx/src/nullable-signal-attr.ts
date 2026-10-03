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
import type { ComponentIR, SignalInfo, TypeInfo } from './types.ts'

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
