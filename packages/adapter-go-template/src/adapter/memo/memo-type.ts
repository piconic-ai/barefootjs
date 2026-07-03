/**
 * Memo type inference predicates.
 *
 * Pure free functions over a {@link GoEmitContext} that classify a memo's
 * computation so `inferMemoType` can pick the right Go field type (and thus the
 * right SSR zero value).
 */

import { asCallbackMethodCall } from '@barefootjs/jsx'
import type { ParsedExpr, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

/**
 * True when a memo's body is a `.filter(<arrow>)` callback-method call
 * (#2075) — a LIST-valued derived memo (the blog PostList `visible` shape:
 * `createMemo(() => props.items.filter((p) => …))`), not a scalar. Exported
 * so both `isBooleanMemo` (guard below) and `inferMemoType`'s field-type
 * decision (go-template-adapter.ts) share the one recognition point.
 */
export function isListFilterMemo(memo: { parsed?: ParsedExpr }): boolean {
  if (!memo.parsed) return false
  const cb = asCallbackMethodCall(memo.parsed)
  return cb !== null && cb.method === 'filter'
}

/**
 * Heuristic: does this memo evaluate to a boolean? True when its computation is
 * a comparison (`!==`/`===`/`!=`/`==`), a negation (`!x`), or a ternary whose
 * branches are all boolean signals/props. Used to pick `bool` (zero value
 * `false`) over the int `0` default for the SSR initial value.
 */
export function isBooleanMemo(
  ctx: GoEmitContext,
  memo: { computation: string; deps: string[]; parsed?: ParsedExpr },
  signals: { getter: string; initialValue: string; type: TypeInfo }[],
  propsParamMap: Map<string, { name: string; type: TypeInfo; defaultValue?: string }>,
): boolean {
  const c = memo.computation
  // A LIST-valued `.filter(arrow)` memo (#2075) is never boolean, even though
  // its predicate arrow body often contains a `!` negation (`!tag() || …`) —
  // that would otherwise trip the `/=>\s*!/` heuristic below into
  // misclassifying the whole memo. Bail before any regex runs.
  if (isListFilterMemo(memo)) return false
  // A ternary whose two branches are string literals is a STRING memo, not
  // boolean — the `===` lives in the *condition*, so the blanket comparison
  // check below would misclassify it as bool and bake `false`. Bail first.
  if (isStringTernaryMemo(ctx, memo.parsed)) return false
  if (/(!==|===|!=(?!=)|==(?!=))/.test(c)) return true
  if (/=>\s*!/.test(c)) return true
  // Ternary `() => cond() ? a() : b()` — boolean when both branches are
  // boolean-resolving getters (signals whose value is boolean, or boolean
  // props).
  const isBoolGetter = (name: string): boolean => {
    const sig = signals.find(s => s.getter === name)
    if (sig) {
      if (typeInfoToGo(ctx, sig.type) === 'bool') return true
      // Signal initialised from `props.X ?? false` / a boolean prop.
      if (/\?\?\s*(true|false)\b/.test(sig.initialValue)) return true
      const propName = ctx.extractPropNameFromInitialValue(sig.initialValue) ?? sig.initialValue
      const prop = propsParamMap.get(propName)
      if (prop && typeInfoToGo(ctx, prop.type, prop.defaultValue) === 'bool') return true
      return false
    }
    const prop = propsParamMap.get(name)
    return !!prop && typeInfoToGo(ctx, prop.type, prop.defaultValue) === 'bool'
  }
  const ternary = c.match(/=>\s*\w+\(\)\s*\?\s*(\w+)\(\)\s*:\s*(\w+)\(\)/)
  if (ternary) {
    return isBoolGetter(ternary[1]) && isBoolGetter(ternary[2])
  }
  return false
}

/**
 * Does this memo's body resolve to a ternary whose BOTH branches are
 * string-valued — e.g. `() => orientation() === 'vertical' ? 'flex-col' :
 * 'flex'`? Such a memo is a string, not a bool, even though its condition
 * contains `===`. Since #2040 a block-bodied memo can also carry `parsed` (a
 * value `if` / early-return folds to a ternary), so this now applies to those
 * too — the inferred field type follows the folded shape, not the syntax.
 */
export function isStringTernaryMemo(ctx: GoEmitContext, parsed: ParsedExpr | undefined): boolean {
  if (!parsed || parsed.kind !== 'conditional') return false
  // A branch is string-valued when it's a string literal or an identifier
  // bound to a module-scope string const (carousel's `positionClasses` →
  // `prevVerticalClasses` / `prevHorizontalClasses`).
  const isStr = (n: ParsedExpr): boolean =>
    (n.kind === 'literal' && n.literalType === 'string') ||
    (n.kind === 'identifier' && ctx.state.moduleStringConsts.has(n.name))
  return isStr(parsed.consequent) && isStr(parsed.alternate)
}
