/**
 * Spread-bag codegen: lower JSX `{...spread}` attributes to Go.
 *
 * Free functions over a {@link GoEmitContext}. Two entry points:
 *   - `collectSpreadSlots` walks the IR (stopping at loop bodies) to gather the
 *     `SpreadSlotInfo` entries plumbed onto the Input/Props structs.
 *   - `buildSpreadInitializer` builds the Go expression for a spread bag's
 *     initial value placed inside `NewXxxProps` (#1407): signal-getter object
 *     literals, destructured / SolidJS-style / rest props, and conditional
 *     inline-object spreads.
 * They read `state.restPropsName` / `state.usesFmt` and `parseLiteralExpression`;
 * everything else comes from the per-call `ComponentIR`.
 */

import ts from 'typescript'

import { parseRecordIndexAccess } from '@barefootjs/jsx'
import type {
  ComponentIR,
  IRNode,
  IRElement,
  IRFragment,
  IRConditional,
  IRIfStatement,
  IRComponent,
  IRProvider,
  IRAsync,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { SpreadSlotInfo } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'

/**
 * Walks the IR tree, descending into elements, fragments,
 * conditionals, providers, async, and components, but stopping at
 * loop bodies. Each `IRElement.attrs[i].value` of kind `'spread'`
 * that has a `slotId` becomes one `SpreadSlotInfo` entry.
 */
export function collectSpreadSlots(ctx: GoEmitContext, node: IRNode): SpreadSlotInfo[] {
  const result: SpreadSlotInfo[] = []
  collectSpreadSlotsRecursive(ctx, node, result)
  return result
}

/**
 * Decide how a spread bag should be plumbed onto the Input/Props
 * structs (#1407 follow-up). A bare-identifier spread that
 * matches the component's `restPropsName` is open-ended (Go's
 * static typing can't enumerate the keys), so the caller must
 * supply the bag via an Input-side `map[string]any` field. Every
 * other shape — signal getter, `propsObjectName`, plain
 * propsParam, object literal — can be constructed inline in
 * `NewXxxProps` from compile-time-known data.
 *
 * Reads `state.restPropsName` (stashed at `generate()` entry)
 * rather than receiving the IR per-call — matches the existing
 * `state.propsObjectName` / `state.componentName` storage pattern.
 */
function classifySpreadBagSource(ctx: GoEmitContext, spreadExpr: string): 'input-bag' | 'inline' {
  const trimmed = spreadExpr.trim()
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)
    && ctx.state.restPropsName === trimmed) {
    return 'input-bag'
  }
  return 'inline'
}

function collectSpreadSlotsRecursive(ctx: GoEmitContext, node: IRNode, result: SpreadSlotInfo[]): void {
  if (node.type === 'element') {
    const element = node as IRElement
    for (const attr of element.attrs) {
      if (attr.value.kind !== 'spread') continue
      if (!attr.value.slotId) continue
      result.push({
        slotId: attr.value.slotId,
        expr: attr.value.expr,
        templateExpr: attr.value.templateExpr,
        bagSource: classifySpreadBagSource(ctx, attr.value.expr),
      })
    }
    for (const child of element.children) {
      collectSpreadSlotsRecursive(ctx, child, result)
    }
    return
  }
  if (node.type === 'fragment') {
    const fragment = node as IRFragment
    for (const child of fragment.children) {
      collectSpreadSlotsRecursive(ctx, child, result)
    }
    return
  }
  if (node.type === 'conditional') {
    const cond = node as IRConditional
    collectSpreadSlotsRecursive(ctx, cond.whenTrue, result)
    if (cond.whenFalse) collectSpreadSlotsRecursive(ctx, cond.whenFalse, result)
    return
  }
  if (node.type === 'if-statement') {
    const stmt = node as IRIfStatement
    collectSpreadSlotsRecursive(ctx, stmt.consequent, result)
    if (stmt.alternate) collectSpreadSlotsRecursive(ctx, stmt.alternate, result)
    return
  }
  if (node.type === 'component') {
    const comp = node as IRComponent
    // `IRComponent.children` are the JSX children passed to *this*
    // component instance at the call site (`<Child>...</Child>`).
    // They are part of the PARENT's IR and evaluate in the parent's
    // render scope, so any spreads inside them belong on the parent's
    // Props struct. The child component's own template body is a
    // separate `ComponentIR` with its own `ir.root`, compiled in a
    // separate `generate()` pass — it never appears in the parent's
    // IR tree, so the recursion never crosses a component boundary
    // and the per-component `spreadIdCounter` can't collide across
    // unrelated components (#1411 review).
    for (const child of comp.children) {
      collectSpreadSlotsRecursive(ctx, child, result)
    }
    return
  }
  if (node.type === 'provider') {
    const p = node as IRProvider
    for (const child of p.children) {
      collectSpreadSlotsRecursive(ctx, child, result)
    }
    return
  }
  if (node.type === 'async') {
    const a = node as IRAsync
    collectSpreadSlotsRecursive(ctx, a.fallback, result)
    for (const child of a.children) {
      collectSpreadSlotsRecursive(ctx, child, result)
    }
    return
  }
  // Loops are intentionally not descended — loop-internal spreads
  // emit `{{bf_spread_attrs <go-expr>}}` inline from
  // `elementAttrEmitter.emitSpread` instead of plumbing through a
  // Props struct field.
}

/**
 * Parse a JS object-literal source text (the raw string captured
 * for a signal's `initialValue` or a spread expression's argument)
 * into a Go `map[string]any{...}` literal source (#1407).
 *
 * Supports a deliberately conservative subset so the Go output is
 * a 1:1 translation of the JS source: string/number/boolean/null
 * values keyed by identifier or string-literal keys. Returns null
 * for unsupported shapes (nested objects, computed values,
 * function calls, spread elements) — callers fall back to BF101.
 */
function parseJsObjectLiteralToGoMap(jsText: string): string | null {
  const sf = ts.createSourceFile('inline.ts', `(${jsText})`, ts.ScriptTarget.Latest, true)
  if (sf.statements.length !== 1) return null
  const stmt = sf.statements[0]
  if (!ts.isExpressionStatement(stmt)) return null
  let expr: ts.Expression = stmt.expression
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression
  if (!ts.isObjectLiteralExpression(expr)) return null
  const entries: string[] = []
  for (const prop of expr.properties) {
    if (!ts.isPropertyAssignment(prop)) return null
    let key: string
    if (ts.isIdentifier(prop.name)) {
      key = prop.name.text
    } else if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)) {
      key = prop.name.text
    } else {
      return null
    }
    const val = prop.initializer
    let goVal: string
    if (ts.isStringLiteral(val) || ts.isNoSubstitutionTemplateLiteral(val)) {
      goVal = JSON.stringify(val.text)
    } else if (ts.isNumericLiteral(val)) {
      goVal = val.text
    } else if (
      // TypeScript parses `-1` and `+1` as `PrefixUnaryExpression`
      // rather than `NumericLiteral` — accept both signs explicitly
      // so a bag like `{count: -1}` doesn't collapse to BF101
      // (#1411 review).
      ts.isPrefixUnaryExpression(val)
      && (val.operator === ts.SyntaxKind.MinusToken || val.operator === ts.SyntaxKind.PlusToken)
      && ts.isNumericLiteral(val.operand)
    ) {
      const sign = val.operator === ts.SyntaxKind.MinusToken ? '-' : ''
      goVal = `${sign}${val.operand.text}`
    } else if (val.kind === ts.SyntaxKind.TrueKeyword) {
      goVal = 'true'
    } else if (val.kind === ts.SyntaxKind.FalseKeyword) {
      goVal = 'false'
    } else if (val.kind === ts.SyntaxKind.NullKeyword) {
      goVal = 'nil'
    } else {
      return null
    }
    entries.push(`${JSON.stringify(key)}: ${goVal}`)
  }
  return `map[string]any{${entries.join(', ')}}`
}

/**
 * Build a Go expression for a JSX spread bag's initial value, to
 * be placed inside `NewXxxProps`'s return literal (#1407).
 *
 * Supported shapes:
 *   - Signal-getter call (e.g. `attrs()`): look up the signal,
 *     parse its `initialValue` as a JS object literal, and emit a
 *     Go `map[string]any{...}` literal.
 *   - Bare identifier matching a destructured `propsParam` (e.g.
 *     `function({ extras }: P) { <el {...extras}/> }`): emit
 *     `in.<FieldName>` — works when the prop's Go type is a map
 *     type the bag is assignable to.
 *   - Bare identifier matching `propsObjectName` (SolidJS-style
 *     `function(props: P) { <el {...props}/> }`): enumerate the
 *     analyzer-extracted `propsParams` into an inline
 *     `map[string]any{...}` literal so each typed Input field
 *     surfaces as a bag key (#1407 follow-up).
 *   - Bare identifier matching `restPropsName` (the destructured-
 *     rest pattern `function({a, ...rest}: P) { <el {...rest}/> }`):
 *     emit `in.<slotId>` against the `map[string]any` Input field
 *     that `generateInputStruct` adds for `input-bag` slots. The
 *     caller (parent component or test harness) populates the
 *     bag with the open-ended rest values (#1407 follow-up).
 *
 * Returns null for unsupported shapes so the caller can raise a
 * narrowed BF101 with the offending expression.
 */
export function buildSpreadInitializer(
  ctx: GoEmitContext,
  spreadExpr: string,
  ir: ComponentIR,
): string | null {
  const trimmed = spreadExpr.trim()
  // Conditional inline-object spread:
  //   `{...(COND ? { 'k': v } : {})}` (either branch possibly `{}`).
  // Lower to an immediately-invoked func literal that conditionally
  // builds the bag, so the falsy branch yields an empty map (the key
  // is OMITTED rather than rendered as `k=""` — `SpreadAttrs` does
  // NOT filter empty strings). Returns null for any shape it can't
  // faithfully convert so the caller falls back to BF101 (#textarea).
  const conditional = buildConditionalSpreadInitializer(ctx, trimmed, ir)
  if (conditional !== undefined) return conditional
  // Signal-getter call: `attrs()` — pluck the signal's initialValue
  // and translate the JS object literal to a Go map literal.
  const callMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*\)$/.exec(trimmed)
  if (callMatch) {
    const getterName = callMatch[1]
    const signal = ir.metadata.signals.find(s => s.getter === getterName)
    if (signal && signal.initialValue) {
      const goMap = parseJsObjectLiteralToGoMap(signal.initialValue)
      if (goMap) return goMap
    }
    return null
  }
  // Bare-identifier paths.
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    // 1. Destructured-from-props parameter: `function({ extras }: P)`
    //    → spread `{...extras}` resolves to `in.Extras`.
    const param = ir.metadata.propsParams.find(p => p.name === trimmed)
    if (param) {
      return `in.${capitalizeFieldName(param.name)}`
    }
    // 2. SolidJS-style props object: `function(props: P)` → spread
    //    `{...props}` enumerates all analyzer-extracted propsParams
    //    into a `map[string]any` literal. Every Input field becomes
    //    a bag key. When `propsParams` is empty (analyzer couldn't
    //    enumerate the type — e.g. an unresolved interface
    //    `extends` chain), the literal is `map[string]any{}`. SSR
    //    then renders no spread attrs; the CSR `applyRestAttrs`
    //    hydrate path still applies them. Strictly worse than a
    //    full enumeration, but strictly better than BF101 blocking
    //    the build.
    if (ir.metadata.propsObjectName === trimmed) {
      const entries = ir.metadata.propsParams.map(p =>
        `${JSON.stringify(p.name)}: in.${capitalizeFieldName(p.name)}`,
      )
      return `map[string]any{${entries.join(', ')}}`
    }
    // 3. Destructured-rest identifier:
    //    `function({a, ...rest}: P) { <el {...rest}/> }`. The
    //    rest's key set is open-ended (Go can't enumerate it
    //    statically when the analyzer's `restPropsExpandedKeys`
    //    isn't populated), so `generateInputStruct` added an
    //    Input field named after the rest binding itself
    //    (`rest` → `Rest`) so callers can write
    //    `XxxInput{Rest: ...}` using the same identifier they
    //    saw in source. Forward it through.
    if (ir.metadata.restPropsName === trimmed) {
      return `in.${capitalizeFieldName(trimmed)}`
    }
    // 4. Function-scope local const holding a conditional inline-object
    //    spread: `const sizeAttrs = size ? {…} : {}` then `{...sizeAttrs}`
    //    (#checkbox / icon). Resolve the identifier to its initializer
    //    text and route through the conditional-spread lowering. Only
    //    function-scope (`!isModule`) consts qualify — a module const is
    //    a different shape, and the resolved initializer must itself be a
    //    conditional-of-object-literals (else `buildConditionalSpreadInitializer`
    //    returns undefined and we fall through to BF101). Guard against a
    //    const that resolves to another bare identifier (loop / non-literal).
    const localConst = (ir.metadata.localConstants ?? []).find(
      c => c.name === trimmed && !c.isModule,
    )
    if (localConst?.value !== undefined) {
      const initTrimmed = localConst.value.trim()
      // Reject a const resolving to a bare identifier to avoid an
      // unbounded resolution loop / non-literal forwarding.
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(initTrimmed)) {
        const resolved = buildConditionalSpreadInitializer(ctx, initTrimmed, ir)
        // `undefined` → not a conditional-spread shape; fall through to
        // BF101. `null` → that shape but unconvertible; also BF101.
        if (resolved) return resolved
        if (resolved === null) return null
      }
    }
  }
  return null
}

/**
 * Lower a conditional inline-object spread bag value:
 *   `(COND ? { 'aria-describedby': describedBy } : {})`
 * into an immediately-invoked Go func literal that conditionally
 * builds the map (so the falsy branch OMITS the key rather than
 * rendering it as an empty string, which `SpreadAttrs` does not
 * filter):
 *
 *   func() map[string]any {
 *     if in.DescribedBy != nil && in.DescribedBy != "" {
 *       return map[string]any{"aria-describedby": in.DescribedBy}
 *     }
 *     return map[string]any{}
 *   }()
 *
 * Returns:
 *   - `undefined` when the expression is NOT a parenthesized ternary
 *     of object literals — the caller falls through to other shapes.
 *   - `null` when it IS that shape but a part can't be faithfully
 *     converted (non-static key, unsupported condition, …) — the
 *     caller raises BF101.
 *   - the Go IIFE string when fully convertible.
 */
function buildConditionalSpreadInitializer(
  ctx: GoEmitContext,
  spreadExpr: string,
  ir: ComponentIR,
): string | null | undefined {
  const expr = ctx.parseLiteralExpression(spreadExpr)
  if (!expr || !ts.isConditionalExpression(expr)) return undefined
  const whenTrue = unwrapParens(expr.whenTrue)
  const whenFalse = unwrapParens(expr.whenFalse)
  if (!ts.isObjectLiteralExpression(whenTrue) || !ts.isObjectLiteralExpression(whenFalse)) {
    return undefined
  }
  // Condition → Go bool against `in.`, type-aware on the prop.
  const goCond = conditionToGoBool(expr.condition, ir)
  if (goCond === null) return null
  const trueMap = objectLiteralToGoSpreadMap(ctx, whenTrue, ir)
  const falseMap = objectLiteralToGoSpreadMap(ctx, whenFalse, ir)
  if (trueMap === null || falseMap === null) return null
  return (
    `func() map[string]any {\n` +
    `\t\tif ${goCond} {\n` +
    `\t\t\treturn ${trueMap}\n` +
    `\t\t}\n` +
    `\t\treturn ${falseMap}\n` +
    `\t}()`
  )
}

/** Strip redundant parenthesised wrappers off a TS expression. */
function unwrapParens(node: ts.Expression): ts.Expression {
  let e = node
  while (ts.isParenthesizedExpression(e)) e = e.expression
  return e
}

/**
 * Convert a conditional-spread condition expression to a Go bool in
 * the `in.` context. Supports a bare prop identifier (`describedBy`)
 * and its negation (`!describedBy`), type-aware on the prop:
 *   string  → `in.X != ""`
 *   boolean → `in.X`
 *   number  → `in.X != 0`
 *   unknown / interface{} → `in.X != nil && in.X != ""`
 *     (faithful JS string-truthiness for an interface holding a
 *     string — textarea's `describedBy` resolves to interface{}).
 * Returns null for any other shape (caller → BF101).
 */
function conditionToGoBool(
  condition: ts.Expression,
  ir: ComponentIR,
): string | null {
  let node = unwrapParens(condition)
  let negate = false
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    negate = true
    node = unwrapParens(node.operand)
  }
  if (!ts.isIdentifier(node)) return null
  const param = ir.metadata.propsParams.find(p => p.name === node.text)
  if (!param) return null
  const field = `in.${capitalizeFieldName(param.name)}`
  const prim = param.type.kind === 'primitive' ? param.type.primitive : undefined
  let truthy: string
  if (prim === 'boolean') {
    truthy = field
  } else if (prim === 'number') {
    truthy = `${field} != 0`
  } else if (prim === 'string') {
    truthy = `${field} != ""`
  } else {
    // unknown / interface{}: the runtime value may be a string, number,
    // bool, etc., so a string-biased `!= ""` test would diverge from JS
    // truthiness (e.g. an `interface{}` holding `0` or `false` is falsy in
    // JS but `!= ""` reads true). Route through `bf.Truthy`, the exported
    // `Boolean(x)` equivalent, for a faithful check (Copilot review #1752).
    truthy = `bf.Truthy(${field})`
  }
  if (!negate) return truthy
  // Negation: wrap so `!` applies to the whole truthiness test.
  if (prim === 'boolean') return `!${field}`
  if (prim === 'number') return `${field} == 0`
  if (prim === 'string') return `${field} == ""`
  return `!bf.Truthy(${field})`
}

/**
 * Convert a static object literal (`{ 'aria-describedby': describedBy }`)
 * into a Go `map[string]any{...}` literal for a conditional spread.
 * Only static string/identifier keys are allowed; values resolve
 * prop-identifier references to `in.FieldName` and string literals to
 * Go string literals. Returns null for any computed/spread/dynamic
 * key or unsupported value (caller → BF101). Empty object → `map[string]any{}`.
 */
function objectLiteralToGoSpreadMap(
  ctx: GoEmitContext,
  obj: ts.ObjectLiteralExpression,
  ir: ComponentIR,
): string | null {
  const entries: string[] = []
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) return null
    let key: string
    if (ts.isIdentifier(prop.name)) {
      key = prop.name.text
    } else if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)) {
      key = prop.name.text
    } else {
      return null
    }
    const val = unwrapParens(prop.initializer)
    let goVal: string
    if (ts.isStringLiteral(val) || ts.isNoSubstitutionTemplateLiteral(val)) {
      goVal = JSON.stringify(val.text)
    } else if (ts.isIdentifier(val)) {
      const param = ir.metadata.propsParams.find(p => p.name === val.text)
      if (!param) return null
      goVal = `in.${capitalizeFieldName(param.name)}`
    } else {
      const indexed = recordIndexAccessToGoMap(ctx, val, ir)
      if (indexed === null) return null
      goVal = indexed
    }
    entries.push(`${JSON.stringify(key)}: ${goVal}`)
  }
  return `map[string]any{${entries.join(', ')}}`
}

/**
 * Lower a spread-object VALUE of the form `IDENT[KEY]` where:
 *   - `IDENT` resolves via `localConstants` to a MODULE-scope object
 *     literal whose property values are all scalar (number/string)
 *     literals under static (string-literal or identifier) keys
 *     (a `Record<staticKeys, scalar>` map like `sizeMap`), AND
 *   - `KEY` is a bare identifier that is a prop.
 * Emits an inline indexed Go map:
 *   `map[string]any{"sm": 16, ...}[fmt.Sprint(in.Size)]`
 * (`fmt.Sprint` coerces the `interface{}`/typed prop to the map's
 * string key space — sets `usesFmt` so the `"fmt"` import is added).
 *
 * Returns the Go string when convertible, else `null` (caller → BF101)
 * for any non-scalar value, non-static key, or non-prop index so
 * unrelated shapes don't regress. (#checkbox / icon `sizeMap[size]`.)
 */
function recordIndexAccessToGoMap(
  ctx: GoEmitContext,
  val: ts.Expression,
  ir: ComponentIR,
): string | null {
  // Shared structural parse (single source of truth in `@barefootjs/jsx`);
  // this wrapper only does the Go-specific emit from the structured result.
  const parsed = parseRecordIndexAccess(
    val,
    ir.metadata.localConstants ?? [],
    ir.metadata.propsParams,
  )
  if (!parsed) return null
  const entries = parsed.entries.map(e => {
    const mapVal = e.value.kind === 'number' ? e.value.text : JSON.stringify(e.value.text)
    return `${JSON.stringify(e.key)}: ${mapVal}`
  })
  ctx.state.usesFmt = true
  const field = `in.${capitalizeFieldName(parsed.indexPropName)}`
  return `map[string]any{${entries.join(', ')}}[fmt.Sprint(${field})]`
}
