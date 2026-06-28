/**
 * Spread-bag codegen: lower JSX `{...spread}` attributes to Go.
 *
 * Free functions over a {@link GoEmitContext}. Two entry points:
 *   - `collectSpreadSlots` walks the IR (stopping at loop bodies) to gather the
 *     `SpreadSlotInfo` entries plumbed onto the Input/Props structs.
 *   - `buildSpreadInitializer` builds the Go expression for a spread bag's
 *     initial value placed inside `NewXxxProps`: signal-getter object literals,
 *     destructured / SolidJS-style / rest props, and conditional inline-object
 *     spreads.
 */

import ts from 'typescript'

import { parseExpression, parseRecordIndexAccess } from '@barefootjs/jsx'
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
  ParsedExpr,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { SpreadSlotInfo } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'

/**
 * Walk the IR (elements, fragments, conditionals, providers, async, components)
 * but stop at loop bodies. Each `'spread'` attr value with a `slotId` becomes
 * one `SpreadSlotInfo` entry.
 */
export function collectSpreadSlots(ctx: GoEmitContext, node: IRNode): SpreadSlotInfo[] {
  const result: SpreadSlotInfo[] = []
  collectSpreadSlotsRecursive(ctx, node, result)
  return result
}

/**
 * Decide how a spread bag is plumbed onto the Input/Props structs. A
 * bare-identifier spread matching `restPropsName` is open-ended (Go can't
 * enumerate the keys), so the caller supplies the bag via an Input-side
 * `map[string]any` field (`input-bag`). Every other shape — signal getter,
 * `propsObjectName`, plain propsParam, object literal — is built inline in
 * `NewXxxProps` from compile-time-known data (`inline`).
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
        parsed: attr.value.parsed,
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
    // `IRComponent.children` are the JSX children passed to *this* instance at
    // the call site (`<Child>...</Child>`) — part of the PARENT's IR, evaluated
    // in the parent's render scope, so spreads inside them belong on the
    // parent's Props struct. The child's own template body is a separate
    // `ComponentIR` compiled in a separate `generate()` pass, so the recursion
    // never crosses a component boundary and per-component `spreadIdCounter`
    // can't collide across unrelated components.
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
  // Loops are intentionally not descended — loop-internal spreads emit
  // `{{bf_spread_attrs <go-expr>}}` inline from `elementAttrEmitter.emitSpread`
  // instead of plumbing through a Props struct field.
}

/**
 * Lower a signal's carried object-literal initial value into a Go
 * `map[string]any{...}` literal. Conservative subset: string/number/boolean/null
 * values (and a signed-number `{count: -1}`) keyed by identifier or
 * string-literal keys.
 *
 * @returns `null` (→ caller falls back to BF101) for any other shape — a
 *   non-object init, or a shorthand / nested-object / computed / call value.
 */
function parsedObjectLiteralToGoMap(parsed: ParsedExpr | undefined): string | null {
  if (!parsed || parsed.kind !== 'object-literal') return null
  const entries: string[] = []
  for (const prop of parsed.properties) {
    // Reject a numeric key (`{ 1: 'a' }`); `keyKind` distinguishes it from a
    // string `'1'` key.
    if (prop.keyKind === 'numeric') return null
    const v = prop.value
    let goVal: string
    if (v.kind === 'literal' && v.literalType === 'string') {
      goVal = JSON.stringify(v.value)
    } else if (v.kind === 'literal' && v.literalType === 'number') {
      // `raw` is the exact numeric token; `value` is the fallback.
      goVal = v.raw ?? String(v.value)
    } else if (
      // `-1` / `+1` parse as a unary over a numeric literal — accept both signs.
      v.kind === 'unary'
      && (v.op === '-' || v.op === '+')
      && v.argument.kind === 'literal'
      && v.argument.literalType === 'number'
    ) {
      const sign = v.op === '-' ? '-' : ''
      goVal = `${sign}${v.argument.raw ?? String(v.argument.value)}`
    } else if (v.kind === 'literal' && v.literalType === 'boolean') {
      goVal = v.value ? 'true' : 'false'
    } else if (v.kind === 'literal' && v.literalType === 'null') {
      goVal = 'nil'
    } else {
      return null
    }
    entries.push(`${JSON.stringify(prop.key)}: ${goVal}`)
  }
  return `map[string]any{${entries.join(', ')}}`
}

/**
 * Build a Go expression for a JSX spread bag's initial value, placed inside
 * `NewXxxProps`'s return literal.
 *
 * Supported shapes:
 *   - Signal-getter call (`attrs()`): emit the signal's object literal as a Go
 *     `map[string]any{...}`.
 *   - Bare identifier matching a destructured `propsParam`: emit `in.<Field>`.
 *   - Bare identifier matching `propsObjectName` (SolidJS-style `props`):
 *     enumerate `propsParams` into an inline `map[string]any{...}` (each Input
 *     field becomes a bag key).
 *   - Bare identifier matching `restPropsName` (destructured rest): emit
 *     `in.<Field>` against the `map[string]any` Input field added for
 *     `input-bag` slots; the caller populates the open-ended rest values.
 *
 * @returns `null` for unsupported shapes so the caller can raise a narrowed
 *   BF101 with the offending expression.
 */
export function buildSpreadInitializer(
  ctx: GoEmitContext,
  spreadExpr: string,
  ir: ComponentIR,
  parsed?: ParsedExpr,
): string | null {
  const trimmed = spreadExpr.trim()
  // Conditional inline-object spread `{...(COND ? { 'k': v } : {})}` (either
  // branch possibly `{}`). The falsy branch yields an empty map so the key is
  // OMITTED rather than rendered as `k=""` (`SpreadAttrs` does NOT filter empty
  // strings). Consume the carried `parsed` tree; when absent (older/hand-built
  // IR), parse `trimmed` once as a fallback.
  const conditionalTree = parsed ?? parseExpression(trimmed)
  const conditional = buildConditionalSpreadInitializer(ctx, conditionalTree, ir)
  if (conditional !== undefined) return conditional
  // Signal-getter call `attrs()` — translate the signal's object literal to a
  // Go map literal.
  const callMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*\)$/.exec(trimmed)
  if (callMatch) {
    const getterName = callMatch[1]
    const signal = ir.metadata.signals.find(s => s.getter === getterName)
    if (signal && signal.initialValue) {
      const goMap = parsedObjectLiteralToGoMap(signal.parsed)
      if (goMap) return goMap
    }
    return null
  }
  // Bare-identifier paths.
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    // 1. Destructured-from-props parameter `function({ extras }: P)` →
    //    `{...extras}` resolves to `in.Extras`.
    const param = ir.metadata.propsParams.find(p => p.name === trimmed)
    if (param) {
      return `in.${capitalizeFieldName(param.name)}`
    }
    // 2. SolidJS-style props object: `function(props: P)` → spread
    //    `{...props}` enumerates all propsParams into a `map[string]any`
    //    literal; every Input field becomes a bag key. When `propsParams` is
    //    empty (analyzer couldn't enumerate the type), the literal is
    //    `map[string]any{}`: SSR renders no spread attrs, but the CSR
    //    `applyRestAttrs` hydrate path still applies them — worse than full
    //    enumeration, better than BF101 blocking the build.
    if (ir.metadata.propsObjectName === trimmed) {
      const entries = ir.metadata.propsParams.map(p =>
        `${JSON.stringify(p.name)}: in.${capitalizeFieldName(p.name)}`,
      )
      return `map[string]any{${entries.join(', ')}}`
    }
    // 3. Destructured-rest identifier `function({a, ...rest}: P)`. The rest's
    //    key set is open-ended, so `generateInputStruct` added an Input field
    //    named after the rest binding (`rest` → `Rest`); callers write
    //    `XxxInput{Rest: ...}` with the same identifier they saw in source.
    //    Forward it through.
    if (ir.metadata.restPropsName === trimmed) {
      return `in.${capitalizeFieldName(trimmed)}`
    }
    // 4. Function-scope local const holding a conditional inline-object spread:
    //    `const sizeAttrs = size ? {…} : {}` then `{...sizeAttrs}`. Resolve to
    //    its initializer text and route through the conditional-spread lowering.
    //    Only function-scope (`!isModule`) consts qualify, and the initializer
    //    must itself be a conditional-of-object-literals (else fall through to
    //    BF101).
    const localConst = (ir.metadata.localConstants ?? []).find(
      c => c.name === trimmed && !c.isModule,
    )
    if (localConst?.value !== undefined) {
      const initTrimmed = localConst.value.trim()
      // Reject a const resolving to a bare identifier to avoid an unbounded
      // resolution loop / non-literal forwarding.
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(initTrimmed)) {
        const resolved = buildConditionalSpreadInitializer(ctx, parseExpression(initTrimmed), ir)
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
 * Lower a conditional inline-object spread `(COND ? { 'aria-describedby':
 * describedBy } : {})` into a Go IIFE that conditionally builds the map (the
 * falsy branch OMITS the key rather than rendering it as an empty string, which
 * `SpreadAttrs` does not filter):
 *
 *   func() map[string]any {
 *     if bf.Truthy(in.DescribedBy) {
 *       return map[string]any{"aria-describedby": in.DescribedBy}
 *     }
 *     return map[string]any{}
 *   }()
 *
 * @returns `undefined` when the expression is NOT a ternary of object literals
 *   (caller tries other shapes); `null` when it IS that shape but a part can't
 *   be converted (non-static key, unsupported condition) → caller raises BF101;
 *   the Go IIFE string when fully convertible.
 */
function buildConditionalSpreadInitializer(
  ctx: GoEmitContext,
  expr: ParsedExpr | undefined,
  ir: ComponentIR,
): string | null | undefined {
  // `parseExpression` already unwraps redundant parentheses.
  if (!expr || expr.kind !== 'conditional') return undefined
  const whenTrue = expr.consequent
  const whenFalse = expr.alternate
  if (whenTrue.kind !== 'object-literal' || whenFalse.kind !== 'object-literal') {
    return undefined
  }
  // Condition → Go bool against `in.`, type-aware on the prop.
  const goCond = conditionToGoBool(expr.test, ir)
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

/**
 * Convert a conditional-spread condition to a Go bool in the `in.` context.
 * Supports a bare prop identifier (`describedBy`) and its negation, type-aware:
 *   string  → `in.X != ""`
 *   boolean → `in.X`
 *   number  → `in.X != 0`
 *   unknown / interface{} → `bf.Truthy(in.X)`
 * For interface{}, `bf.Truthy` gives faithful JS truthiness; a string-biased
 * `!= ""` test would misread an interface holding `0` / `false` as truthy.
 *
 * @returns `null` for any other shape (caller → BF101).
 */
function conditionToGoBool(
  condition: ParsedExpr,
  ir: ComponentIR,
): string | null {
  let node = condition
  let negate = false
  if (node.kind === 'unary' && node.op === '!') {
    negate = true
    node = node.argument
  }
  if (node.kind !== 'identifier') return null
  const param = ir.metadata.propsParams.find(p => p.name === node.name)
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
    // unknown / interface{}: route through `bf.Truthy` (the `Boolean(x)`
    // equivalent) for faithful JS truthiness; `!= ""` would misread an
    // interface holding `0` / `false`.
    truthy = `bf.Truthy(${field})`
  }
  if (!negate) return truthy
  // Negation: `!` applies to the whole truthiness test.
  if (prim === 'boolean') return `!${field}`
  if (prim === 'number') return `${field} == 0`
  if (prim === 'string') return `${field} == ""`
  return `!bf.Truthy(${field})`
}

/**
 * Convert a static object literal (`{ 'aria-describedby': describedBy }`) into a
 * Go `map[string]any{...}` for a conditional spread. Only static
 * string/identifier keys; values resolve prop identifiers to `in.Field` and
 * string literals to Go string literals. Empty object → `map[string]any{}`.
 *
 * @returns `null` for any computed/spread/dynamic key or unsupported value
 *   (caller → BF101).
 */
function objectLiteralToGoSpreadMap(
  ctx: GoEmitContext,
  obj: Extract<ParsedExpr, { kind: 'object-literal' }>,
  ir: ComponentIR,
): string | null {
  const entries: string[] = []
  for (const prop of obj.properties) {
    // Shorthand (`{ describedBy }`) is unsupported.
    if (prop.shorthand) return null
    // Reject a numeric key (`{ 1: x }`); `keyKind` distinguishes it from a
    // string `'1'` key.
    if (prop.keyKind === 'numeric') return null
    const key = prop.key
    const val = prop.value
    let goVal: string
    if (val.kind === 'literal' && val.literalType === 'string') {
      goVal = JSON.stringify(val.value)
    } else if (val.kind === 'identifier') {
      const param = ir.metadata.propsParams.find(p => p.name === val.name)
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
 *   - `IDENT` resolves via `localConstants` to a MODULE-scope object literal
 *     whose property values are all scalar literals under static keys (a
 *     `Record<staticKeys, scalar>` map like `sizeMap`), AND
 *   - `KEY` is a bare identifier that is a prop.
 * Emits an inline indexed Go map:
 *   `map[string]any{"sm": 16, ...}[fmt.Sprint(in.Size)]`
 * (`fmt.Sprint` coerces the prop to the map's string key space — sets `usesFmt`
 * so the `"fmt"` import is added).
 *
 * @returns the Go string, else `null` (caller → BF101) for any non-scalar
 *   value, non-static key, or non-prop index.
 */
function recordIndexAccessToGoMap(
  ctx: GoEmitContext,
  val: ParsedExpr,
  ir: ComponentIR,
): string | null {
  // `parseRecordIndexAccess` (shared parser) takes a `ts.Expression` and only
  // accepts `IDENT[KEY]` with identifier object and index, so rebuild exactly
  // that node from the carried tree via `ts.factory`. Any other shape
  // short-circuits to `null` here.
  if (
    val.kind !== 'index-access'
    || val.object.kind !== 'identifier'
    || val.index.kind !== 'identifier'
  ) {
    return null
  }
  const tsVal = ts.factory.createElementAccessExpression(
    ts.factory.createIdentifier(val.object.name),
    ts.factory.createIdentifier(val.index.name),
  )
  // Shared structural parse; this wrapper only does the Go-specific emit.
  const parsed = parseRecordIndexAccess(
    tsVal,
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
