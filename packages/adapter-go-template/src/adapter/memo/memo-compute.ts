/**
 * Memo initial-value computation — the core that lowers a memo's computation to
 * its SSR initial value as a Go expression.
 *
 * Free functions over a {@link GoEmitContext}. `computeMemoInitialValue` is the
 * typed-field entry (zero-value defaulting); `computeMemoInitialValueOrNull` is
 * the pattern-matching core that dispatches over template-literal, parsed-body,
 * comparison-ternary, block-body and object memo shapes. They read
 * `state.currentMemos` / `state.moduleStringConsts`, `extractPropFallback`, and
 * delegate to the value / type / template / memo-value modules.
 */

import ts from 'typescript'

import type { ParsedExpr, ParsedStatement, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { PropFallbackVar } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { convertInitialValue, getSignalInitialValueAsGo } from '../value/value-lowering.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'
import { computeTemplateLiteralMemoInitialValue, propsAccessName } from './template-interp.ts'
import { resolveBlockBodyMemoModuleConst, computeObjectMemoInitialValue } from './memo-value.ts'

/** Default for the optional `propFallbackVars` argument. */
const EMPTY_PROP_FALLBACK_VARS: ReadonlyMap<string, PropFallbackVar> = new Map()

/**
 * Compute the initial value for a memo based on its computation and signal initial values.
 * Handles simple cases like `() => count() * 2` → `in.Initial * 2`
 * Also handles props.xxx patterns like `() => props.value * 10` → `in.Value * 10`
 *
 * (#1423) When `propFallbackVars` carries a hoisted variable for the
 * referenced prop, substitute it for `in.FieldName` so the memo
 * inherits the signal-time `??` fallback.
 */
export function computeMemoInitialValue(
  ctx: GoEmitContext,
  memo: { name: string; computation: string; deps: string[]; parsed?: ParsedExpr },
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
  // (#checkbox) Go type of the memo field; used to pick the zero-value
  // fallback for an unresolved computation (`false` for `bool`, `""` for
  // `string`, else the historical `0`).
  goType?: string,
): string {
  const resolved = computeMemoInitialValueOrNull(
    ctx, memo, signals, propsParams, propFallbackVars,
  )
  if (resolved !== null) return resolved
  // Default: zero value for the memo's Go type (#checkbox). A boolean memo
  // (`isChecked`) renders `false`, a string memo `""`; reference types
  // (map / slice / interface / pointer) take `nil` — `0` is not
  // assignable to them and broke the struct literal for a
  // block-bodied string-building memo whose type inferred to
  // `map[string]any` (#1896, select-demo's `summary`). Other types
  // keep the historical int `0`.
  if (goType === 'bool') return 'false'
  if (goType === 'string') return '""'
  if (
    goType !== undefined &&
    (goType.startsWith('map[') ||
      goType.startsWith('[]') ||
      goType.startsWith('*') ||
      goType.includes('interface{}') ||
      goType === 'any')
  ) {
    return 'nil'
  }
  return '0'
}

/**
 * Structural matcher for the common expression-bodied memo shapes, driven by
 * the analyzer-attached `MemoInfo.parsed` (the memo arrow's body `ParsedExpr`)
 * instead of regexes over `computation`. Mirrors the former `computation.match`
 * chain 1:1 — `getter() === 'lit'`, `props.X ?? false`, `cond() ? A : B`,
 * `<getter()|props.X|var> <*+-/> <int>`, and bare `getter()` / `props.X` /
 * `var` — returning the Go SSR value, or null when the body isn't one of these
 * (the caller then falls through to the comparison-ternary / block-body /
 * object-memo handling). Structural matching is tolerant of quote style,
 * parenthesisation, and whitespace that the regexes were sensitive to.
 */
export function memoInitialFromParsedBody(
  ctx: GoEmitContext,
  body: ParsedExpr,
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  const propRef = (propName: string): string => {
    const hoisted = propFallbackVars.get(propName)
    if (hoisted) return hoisted.varName
    return `in.${capitalizeFieldName(propName)}`
  }
  // A bare zero-arg getter call (`count()`) → its name, else null.
  const getterCallName = (e: ParsedExpr): string | null =>
    e.kind === 'call' && e.callee.kind === 'identifier' && e.args.length === 0
      ? e.callee.name
      : null
  // A `props.X` member access → the prop name, else null.
  const propsMemberName = (e: ParsedExpr): string | null =>
    e.kind === 'member' &&
    !e.computed &&
    e.object.kind === 'identifier' &&
    e.object.name === 'props'
      ? e.property
      : null

  // () => getter() === 'lit' / !== 'lit' — a selection memo. Resolves to a Go
  // bool when the signal's initial value is itself a string literal.
  if (
    body.kind === 'binary' &&
    ['===', '!==', '==', '!='].includes(body.op) &&
    body.right.kind === 'literal' &&
    body.right.literalType === 'string'
  ) {
    const depName = getterCallName(body.left)
    if (depName) {
      const lit = String(body.right.value)
      const signal = signals.find(sg => sg.getter === depName)
      const initLit = signal ? /^'([^'\\]*)'$/.exec(signal.initialValue.trim()) : null
      if (initLit) {
        const equal = initLit[1] === lit
        return String(body.op.startsWith('!') ? !equal : equal)
      }
    }
  }

  // () => props.X ?? false — a boolean passthrough memo. Go's bool zero value
  // IS the `?? false` fallback, so the raw input field carries it exactly.
  if (
    body.kind === 'logical' &&
    body.op === '??' &&
    body.right.kind === 'literal' &&
    body.right.value === false
  ) {
    const propName = propsMemberName(body.left)
    if (propName) return propRef(propName)
  }

  // () => cond() ? A : B where each branch is a module string const or a
  // string literal, and `cond` is a signal/memo this resolver can evaluate.
  if (body.kind === 'conditional') {
    const condName = getterCallName(body.test)
    if (condName) {
      const resolveBranch = (b: ParsedExpr): string | null => {
        if (b.kind === 'literal' && b.literalType === 'string') return JSON.stringify(b.value)
        if (b.kind === 'identifier') {
          const constVal = ctx.state.moduleStringConsts.get(b.name)
          return constVal !== undefined ? JSON.stringify(constVal) : null
        }
        return null
      }
      const t = resolveBranch(body.consequent)
      const f = resolveBranch(body.alternate)
      if (t !== null && f !== null) {
        let condGo: string | null = null
        const condSignal = signals.find(sg => sg.getter === condName)
        if (condSignal) {
          condGo = getSignalInitialValueAsGo(ctx, condSignal.initialValue, propsParams, propFallbackVars)
        } else {
          const condMemo = (ctx.state.currentMemos ?? []).find(m => m.name === condName)
          if (condMemo) {
            condGo = computeMemoInitialValueOrNull(ctx, condMemo, signals, propsParams, propFallbackVars)
          }
        }
        if (condGo === 'true') return t
        if (condGo === 'false') return f
        if (condGo !== null) {
          return `func() string { if ${condGo} { return ${t} }; return ${f} }()`
        }
      }
    }
  }

  // () => <ref> <*|+|-|/> <non-negative int>. The operand stays an integer
  // literal (the regexes only matched `\d+`), so float/negative bodies fall
  // through unchanged.
  if (
    body.kind === 'binary' &&
    ['*', '+', '-', '/'].includes(body.op) &&
    body.right.kind === 'literal' &&
    body.right.literalType === 'number' &&
    typeof body.right.value === 'number' &&
    Number.isInteger(body.right.value) &&
    body.right.value >= 0
  ) {
    const operator = body.op
    const operand = String(body.right.value)

    // getter() * N — return the signal's Go initial value times N.
    const depName = getterCallName(body.left)
    if (depName) {
      const signal = signals.find(s => s.getter === depName)
      if (signal) {
        const signalInitial = getSignalInitialValueAsGo(ctx, signal.initialValue, propsParams, propFallbackVars)
        return `${signalInitial} ${operator} ${operand}`
      }
    }

    // props.X * N — hoisted var if any, else the input field (asserting int
    // when the field lowers to interface{}).
    const propName = propsMemberName(body.left)
    if (propName) {
      const param = propsParams.find(p => p.name === propName)
      if (param) {
        const hoisted = propFallbackVars.get(propName)
        if (hoisted) return `${hoisted.varName} ${operator} ${operand}`
        const fieldName = capitalizeFieldName(propName)
        if (param.type) {
          const goType = typeInfoToGo(ctx, param.type, param.defaultValue)
          if (goType === 'interface{}') return `in.${fieldName}.(int) ${operator} ${operand}`
        }
        return `in.${fieldName} ${operator} ${operand}`
      }
    }

    // var * N — destructured prop (no hoisted-var lookup, mirroring the
    // former `varArithmeticMatch`).
    if (body.left.kind === 'identifier') {
      const varName = body.left.name
      const param = propsParams.find(p => p.name === varName)
      if (param) {
        const fieldName = capitalizeFieldName(varName)
        if (param.type) {
          const goType = typeInfoToGo(ctx, param.type, param.defaultValue)
          if (goType === 'interface{}') return `in.${fieldName}.(int) ${operator} ${operand}`
        }
        return `in.${fieldName} ${operator} ${operand}`
      }
    }
  }

  // () => getter() — just return the signal's Go initial value.
  const simpleDep = getterCallName(body)
  if (simpleDep) {
    const signal = signals.find(s => s.getter === simpleDep)
    if (signal) {
      return getSignalInitialValueAsGo(ctx, signal.initialValue, propsParams, propFallbackVars)
    }
  }

  // () => props.X — return the prop value (hoisted-aware).
  const simpleProp = propsMemberName(body)
  if (simpleProp) {
    const param = propsParams.find(p => p.name === simpleProp)
    if (param) return propRef(simpleProp)
  }

  // () => var — destructured prop, return the input field directly.
  if (body.kind === 'identifier') {
    const param = propsParams.find(p => p.name === body.name)
    if (param) return `in.${capitalizeFieldName(body.name)}`
  }

  return null
}

/**
 * Pattern-matching core of `computeMemoInitialValue`: returns the
 * memo's SSR initial value as a Go expression, or `null` when no
 * pattern applies. Callers that have a typed field to fill use the
 * zero-value-defaulting wrapper above; callers that can simply OMIT
 * the field (a child-instance prop init — Go's zero values then apply
 * with the right type for free) use this directly (#1896,
 * data-table's `Checked: 0` into a bool field).
 */
export function computeMemoInitialValueOrNull(
  ctx: GoEmitContext,
  memo: { name: string; computation: string; deps: string[]; parsed?: ParsedExpr; parsedBlock?: ParsedStatement[] },
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
): string | null {
  const computation = memo.computation

  // (#checkbox) Pattern: () => `...${expr}...` — a template-literal memo
  // (the classes memo: `${baseClasses} ${focusClasses} ... ${props.className
  // ?? ''} grid place-content-center`). Build a Go string concatenation that
  // inlines module string consts (incl. `[...].join(' ')` consts resolved by
  // `resolveModuleStringConst`) and resolves `props.X ?? ''` / bare `props.X`
  // to the corresponding `in.Field`. Returns null when any interpolation
  // isn't representable, so the existing patterns below still apply.
  const tmplMemo = computeTemplateLiteralMemoInitialValue(ctx, computation, propsParams)
  if (tmplMemo !== null) return tmplMemo

  // Expression-bodied memo shapes (`getter() === 'lit'`, `props.X ?? false`,
  // `cond() ? A : B`, `<ref> * N`, bare `getter()` / `props.X` / `var`) are
  // matched structurally on the analyzer-attached `parsed` tree instead of
  // re-parsing `computation` with regexes (IR-carries-semantics migration).
  if (memo.parsed) {
    const fromParsed = memoInitialFromParsedBody(
      ctx,
      memo.parsed,
      signals,
      propsParams,
      propFallbackVars,
    )
    if (fromParsed !== null) return fromParsed
  }

  // (#1971) Pattern: () => <operand> ===/!== 'lit' ? A : B, where each
  // branch is a string literal/module-const and <operand> is a getter call
  // (`orientation()`), an inline nullish-defaulted prop
  // (`props.orientation ?? 'horizontal'`), or a bare `props.X` — carousel's
  // `directionClasses` / `positionClasses` / `paddingClass`. Resolved via an
  // AST walk (not regex) so quote style, parenthesization, and whitespace
  // don't matter.
  const cmpTernary = computeComparisonTernaryGo(
    ctx,
    computation,
    signals,
    propsParams,
    propFallbackVars,
  )
  if (cmpTernary !== null) return cmpTernary

  // (#1897) Pattern: block-body memo that early-returns a module-const array
  // when a guard signal is falsy — `() => { const k = getter(); if (!k)
  // return MODULE_ARRAY; return /* @client */ ... }`. When the signal starts
  // null, the SSR value is the module-const array. The constant's literal
  // value (not the identifier) is passed to the baker so `jsLiteralToGo`
  // can reduce it to a Go slice.
  const blockReturn = resolveBlockBodyMemoModuleConst(ctx, memo.parsedBlock, signals)
  if (blockReturn !== null && blockReturn.constValue && blockReturn.constType) {
    return convertInitialValue(ctx,
      blockReturn.constValue,
      blockReturn.constType,
      propsParams,
    )
  }

  // (#1897 PostList) Pattern: an object-returning block-body memo derived from
  // `searchParams()` — `() => { const sp = searchParams(); return { sort:
  // asSortKey(sp.get('sort')), tag: sp.get('tag') ?? '' } }`. Compute a Go
  // `map[string]interface{}` whose values are lowered from the request query,
  // so `.Params.Sort` / `.Params.Tag` resolve at execute time instead of
  // reading a nil map. Returns null for any unsupported shape (→ nil fallback,
  // no regression).
  const objMemo = computeObjectMemoInitialValue(ctx, computation)
  if (objMemo !== null) return objMemo

  return null
}

/**
 * (#1971) Resolve a signal/memo getter NAME to a Go value expression, for
 * use as the condition operand of another memo's ternary (carousel's
 * `directionClasses` reads the `orientation` memo). Handles a plain
 * signal, a prop-shadow memo `() => props.X ?? 'lit'` (→ a nil/empty-
 * tolerant field read mirroring the prop fold in `generateNewPropsFunction`),
 * else recurses. Returns null when the shape isn't representable.
 */
export function resolveGetterValueAsGo(
  ctx: GoEmitContext,
  name: string,
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  const signal = signals.find(s => s.getter === name)
  if (signal) {
    return getSignalInitialValueAsGo(ctx, signal.initialValue, propsParams, propFallbackVars)
  }
  const memo = (ctx.state.currentMemos ?? []).find(m => m.name === name)
  if (memo) {
    const stripped = memo.computation.replace(/^\(\)\s*=>\s*/, '')
    const fb = ctx.extractPropFallback(stripped)
    if (fb && capitalizeFieldName(fb.propName) === capitalizeFieldName(memo.name)) {
      const field = `in.${capitalizeFieldName(fb.propName)}`
      return `func() interface{} { v := interface{}(${field}); if v == nil || v == "" { return ${fb.goFallback} }; return v }()`
    }
    return computeMemoInitialValueOrNull(ctx, memo, signals, propsParams, propFallbackVars)
  }
  const param = propsParams.find(p => p.name === name)
  if (param) {
    const hoisted = propFallbackVars.get(name)
    return hoisted ? hoisted.varName : `in.${capitalizeFieldName(name)}`
  }
  return null
}

/**
 * (#1971) Resolve a string-ternary memo whose condition is a literal
 * comparison — `() => <operand> === 'lit' ? A : B` (or `!==`) — to a Go
 * runtime conditional, or null when the shape isn't supported. AST-based
 * (the repo idiom): tolerant of quote style, parenthesization, and
 * whitespace that a regex would miss. Branches must be string
 * literals/module-string-consts; the operand resolves via
 * `resolveComparisonOperandGo`.
 */
export function computeComparisonTernaryGo(
  ctx: GoEmitContext,
  computation: string,
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  let arrow: ts.ArrowFunction | null = null
  try {
    const sf = ts.createSourceFile(
      '__memo.ts',
      `const __x = (${computation});`,
      ts.ScriptTarget.Latest,
      false,
    )
    const stmt = sf.statements[0]
    if (stmt && ts.isVariableStatement(stmt)) {
      let init = stmt.declarationList.declarations[0]?.initializer
      while (init && ts.isParenthesizedExpression(init)) init = init.expression
      if (init && ts.isArrowFunction(init)) arrow = init
    }
  } catch {
    return null
  }
  if (!arrow) return null
  let body: ts.Node = arrow.body
  while (ts.isParenthesizedExpression(body)) body = body.expression
  if (!ts.isConditionalExpression(body)) return null
  const cond = body.condition
  if (!ts.isBinaryExpression(cond) || !ts.isStringLiteral(cond.right)) return null
  const opKind = cond.operatorToken.kind
  const isEq =
    opKind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    opKind === ts.SyntaxKind.EqualsEqualsToken
  const isNe =
    opKind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    opKind === ts.SyntaxKind.ExclamationEqualsToken
  if (!isEq && !isNe) return null

  const branch = (bn: ts.Expression): string | null => {
    if (ts.isStringLiteral(bn) || ts.isNoSubstitutionTemplateLiteral(bn)) {
      return JSON.stringify(bn.text)
    }
    if (ts.isIdentifier(bn)) {
      const cv = ctx.state.moduleStringConsts.get(bn.text)
      return cv !== undefined ? JSON.stringify(cv) : null
    }
    return null
  }
  const t = branch(body.whenTrue)
  const f = branch(body.whenFalse)
  if (t === null || f === null) return null

  const condGo = resolveComparisonOperandGo(
    ctx,
    cond.left,
    signals,
    propsParams,
    propFallbackVars,
  )
  if (condGo === null) return null

  // `whenTrue` fires when the comparison holds; for `!==` the branches swap.
  const eqBranch = isEq ? t : f
  const neBranch = isEq ? f : t
  return `func() string { if ${condGo} == ${JSON.stringify(cond.right.text)} { return ${eqBranch} }; return ${neBranch} }()`
}

/**
 * (#1971) Resolve the left operand of a string-ternary memo's comparison
 * condition to a Go expression: a zero-arg getter call (`orientation()` —
 * a signal/prop-shadow memo), an inline `props.X ?? 'def'` (folds the
 * default like `generateNewPropsFunction`), or a bare `props.X`. Returns
 * null for anything else.
 */
export function resolveComparisonOperandGo(
  ctx: GoEmitContext,
  node: ts.Expression,
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  let n: ts.Expression = node
  while (ts.isParenthesizedExpression(n)) n = n.expression
  // getter(): a signal or memo getter call.
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.arguments.length === 0) {
    return resolveGetterValueAsGo(ctx, n.expression.text, signals, propsParams, propFallbackVars)
  }
  // props.X ?? 'def' — nil/empty-tolerant field read with the default folded in.
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    ts.isStringLiteral(n.right)
  ) {
    const propName = propsAccessName(ctx, n.left)
    if (propName) {
      const field = `in.${capitalizeFieldName(propName)}`
      return `func() interface{} { v := interface{}(${field}); if v == nil || v == "" { return ${JSON.stringify(n.right.text)} }; return v }()`
    }
  }
  // Bare props.X.
  const direct = propsAccessName(ctx, n)
  if (direct) return `in.${capitalizeFieldName(direct)}`
  return null
}
