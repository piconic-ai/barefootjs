/**
 * Memo type inference predicates.
 *
 * Pure free functions over a {@link GoEmitContext} that classify a memo's
 * computation so `inferMemoType` can pick the right Go field type (and thus the
 * right SSR zero value).
 */

import { asCallbackMethodCall } from '@barefootjs/jsx'
import type { ParsedExpr, TypeInfo, JsSourceText } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'
import { propMemberSeedGoType } from '../value/prop-member-seed.ts'
import { seedPassthroughPropName } from '../props/prop-types.ts'

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

const COMPARISON_OPS: ReadonlySet<string> = new Set(['===', '!==', '==', '!=', '<', '>', '<=', '>='])

/**
 * Does this memo evaluate to a boolean? Decided on `memo.parsed`, never on
 * the computation text (#3512): true when the body is a comparison, a `!`
 * negation, a boolean literal, a boolean signal or prop read, a `&&` / `||`
 * over boolean operands, or a ternary whose BRANCHES are both boolean. A
 * comparison in a ternary's test, a callback argument or a string does not
 * count. Without a `parsed` tree the answer is false, so the memo keeps its
 * declared type. Used to pick `bool` (zero value `false`) over the int `0`
 * default for the SSR initial value.
 */
export function isBooleanMemo(
  ctx: GoEmitContext,
  memo: { parsed?: ParsedExpr },
  signals: { getter: string; initialValue: JsSourceText; type: TypeInfo; parsed?: ParsedExpr }[],
  propsParamMap: Map<string, { name: string; type: TypeInfo; defaultValue?: string; parsed?: ParsedExpr }>,
): boolean {
  // A boolean signal or prop read through its getter.
  const isBoolGetter = (name: string): boolean => {
    const sig = signals.find(s => s.getter === name)
    if (sig) {
      if ((propMemberSeedGoType(ctx, sig) ?? typeInfoToGo(ctx, sig.type)) === 'bool') return true
      // Signal initialised from `props.X ?? false` / a boolean prop.
      if (sig.parsed?.kind === 'logical' && sig.parsed.op === '??' && isBoolLiteral(sig.parsed.right)) return true
      const propName = seedPassthroughPropName(ctx, sig.parsed) ?? sig.initialValue
      const prop = propsParamMap.get(propName)
      if (prop && typeInfoToGo(ctx, prop.type, prop.defaultValue, prop.parsed) === 'bool') return true
      return false
    }
    return isBoolProp(name)
  }
  const isBoolProp = (name: string): boolean => {
    const prop = propsParamMap.get(name)
    return !!prop && typeInfoToGo(ctx, prop.type, prop.defaultValue, prop.parsed) === 'bool'
  }
  const isBool = (node: ParsedExpr): boolean => {
    switch (node.kind) {
      case 'binary':
        return COMPARISON_OPS.has(node.op)
      case 'unary':
        return node.op === '!'
      case 'literal':
        return isBoolLiteral(node)
      case 'call':
        return node.args.length === 0 && node.callee.kind === 'identifier' && isBoolGetter(node.callee.name)
      case 'member':
        // `props.on` read off the props object.
        return !node.computed && node.object.kind === 'identifier' &&
          node.object.name === ctx.state.propsObjectName && isBoolProp(node.property)
      case 'logical':
        return node.op !== '??' && isBool(node.left) && isBool(node.right)
      case 'conditional':
        return isBool(node.consequent) && isBool(node.alternate)
      default:
        return false
    }
  }
  return memo.parsed !== undefined && isBool(memo.parsed)
}

function isBoolLiteral(node: ParsedExpr): boolean {
  return node.kind === 'literal' && node.literalType === 'boolean'
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
