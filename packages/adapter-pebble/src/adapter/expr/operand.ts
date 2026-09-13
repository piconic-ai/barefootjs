/**
 * Operand-type classification for the Pebble template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/expr/operand.ts`. Pure
 * function over `ParsedExpr` taking an `isStringName` predicate rather than
 * reading adapter instance state.
 *
 * NOTE: unlike Kolon/Jinja, `===`/`!==` on this adapter ALWAYS route through
 * `bf.eq`/`bf.neq` (see `pebble-adapter.ts`'s file header, divergence 4, and
 * `expr/emitters.ts`'s file header, divergence 4) —
 * Pebble's own `==`/`!=` operator's cross-type behavior (e.g. comparing a
 * boxed `Integer` to a `Double`, or two different Java number wrapper types)
 * is not yet verified against every JS `===` case this adapter must support
 * (the Java runtime doesn't exist yet — see the pebble-adapter.ts file
 * header), so `bf.eq`/`bf.neq` is used unconditionally instead of trusting
 * Pebble's operator to already match JS strict-equality semantics. This helper is
 * therefore not consumed by the Pebble lowering either — kept only as the
 * parallel of the Jinja/Xslate/Mojo adapters' `expr/operand.ts` (groundwork
 * for a future shared codegen surface).
 */

import type { ParsedExpr } from '@barefootjs/jsx'

/**
 * Whether a comparison operand is string-typed. In the Mojo adapter this
 * selects Perl `eq`/`ne` over numeric `==`/`!=` for a `===`/`!==` against a
 * string operand. Not consumed by the Pebble emitters — `===`/`!==` always
 * lowers to `bf.eq`/`bf.neq` regardless of operand type (mirrors the Twig
 * adapter's identical choice). Kept only as the parallel of the
 * Jinja/Twig/Xslate/Mojo helper.
 */
export function isStringTypedOperand(expr: ParsedExpr, isStringName: (n: string) => boolean): boolean {
  if (expr.kind === 'literal' && expr.literalType === 'string') return true
  if (expr.kind === 'call' && expr.callee.kind === 'identifier' && expr.args.length === 0) {
    return isStringName(expr.callee.name)
  }
  if (expr.kind === 'member' && expr.object.kind === 'identifier' && expr.object.name === 'props') {
    return isStringName(expr.property)
  }
  return false
}
