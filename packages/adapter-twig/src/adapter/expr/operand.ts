/**
 * Operand-type classification for the Twig template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/expr/operand.ts`. Pure
 * function over `ParsedExpr` taking an `isStringName` predicate rather than
 * reading adapter instance state.
 *
 * NOTE: unlike Kolon/Jinja, `===`/`!==` on this adapter ALWAYS route through
 * `bf.eq`/`bf.neq` (see `twig-adapter.ts`'s file header, divergence 7) —
 * Twig's own `==`/`!=` compile to PHP loose equality, which is wrong for JS
 * strict-equality semantics regardless of operand type. This helper is
 * therefore not consumed by the Twig lowering either — kept only as the
 * parallel of the Jinja/Xslate/Mojo adapters' `expr/operand.ts` (groundwork
 * for a future shared codegen surface).
 */

import type { ParsedExpr } from '@barefootjs/jsx'

/**
 * Whether a comparison operand is string-typed. In the Mojo adapter this
 * selects Perl `eq`/`ne` over numeric `==`/`!=` for a `===`/`!==` against a
 * string operand. Not consumed by the Twig emitters — `===`/`!==` always
 * lowers to `bf.eq`/`bf.neq` regardless of operand type. Kept only as the
 * parallel of the Jinja/Xslate/Mojo helper.
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
