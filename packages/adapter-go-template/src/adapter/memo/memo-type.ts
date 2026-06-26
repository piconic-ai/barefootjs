/**
 * Memo type inference predicates.
 *
 * Pure free functions over a {@link GoEmitContext} that classify a memo's
 * computation so `inferMemoType` can pick the right Go field type (and thus the
 * right SSR zero value). They read the context's `state.moduleStringConsts`,
 * `extractPropNameFromInitialValue`, and `typeInfoToGo` from the type-codegen
 * module. (Template-literal classification now rides on the IR as
 * `MemoInfo.bodyIsTemplateLiteral`, set by the analyzer, so it isn't here.)
 */

import ts from 'typescript'

import type { TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

/**
 * (#checkbox) Heuristic: does this memo evaluate to a boolean? True when its
 * computation is a comparison (`!==`/`===`/`!=`/`==`), a negation (`!x`), or
 * a ternary whose branches are all boolean signals/props. Used to pick `bool`
 * (zero value `false`) over the int `0` default for the SSR initial value.
 */
export function isBooleanMemo(
  ctx: GoEmitContext,
  memo: { computation: string; deps: string[] },
  signals: { getter: string; initialValue: string; type: TypeInfo }[],
  propsParamMap: Map<string, { name: string; type: TypeInfo; defaultValue?: string }>,
): boolean {
  const c = memo.computation
  // A ternary whose two branches are string literals is a STRING memo
  // (`orientation() === 'vertical' ? 'flex-col -mt-4' : 'flex -ml-4'`),
  // not boolean — the `===` lives in the *condition*, so the blanket
  // comparison check below would misclassify it as bool and bake `false`
  // (#1971 carousel `directionClasses`). Bail before that check.
  if (isStringTernaryMemo(ctx, c)) return false
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
 * (#1971) Does this memo's arrow body resolve to a string-valued ternary
 * whose BOTH branches are string literals — e.g. `() => orientation() ===
 * 'vertical' ? 'flex-col -mt-4' : 'flex -ml-4'`? Such a memo is a string,
 * not a bool, even though its condition contains `===`. AST-based (the
 * repo idiom) so quotes inside class strings don't trip a regex.
 */
export function isStringTernaryMemo(ctx: GoEmitContext, computation: string): boolean {
  try {
    const sf = ts.createSourceFile(
      '__memo.ts',
      `const __x = (${computation});`,
      ts.ScriptTarget.Latest,
      false,
    )
    const stmt = sf.statements[0]
    if (!stmt || !ts.isVariableStatement(stmt)) return false
    let init = stmt.declarationList.declarations[0]?.initializer
    while (init && ts.isParenthesizedExpression(init)) init = init.expression
    if (!init || !ts.isArrowFunction(init)) return false
    let body: ts.Node = init.body
    while (ts.isParenthesizedExpression(body)) body = body.expression
    if (!ts.isConditionalExpression(body)) return false
    // A branch is string-valued when it's a string/template literal or an
    // identifier bound to a module-scope string const (carousel's
    // `positionClasses` → `prevVerticalClasses`/`prevHorizontalClasses`).
    const isStr = (n: ts.Expression): boolean =>
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      (ts.isIdentifier(n) && ctx.state.moduleStringConsts.has(n.text))
    return isStr(body.whenTrue) && isStr(body.whenFalse)
  } catch {
    return false
  }
}
