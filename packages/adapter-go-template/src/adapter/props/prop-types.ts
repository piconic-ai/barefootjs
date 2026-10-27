/**
 * Prop-type resolution: decide each prop's Go struct-field type.
 *
 * Free functions over a {@link GoEmitContext}, shared by the Input/Props struct
 * generators and the nillable-field set so they can't drift.
 */

import type { ComponentIR, IRMetadata, ParsedExpr } from '@barefootjs/jsx'
import {
  arithmeticOperandCoercion,
  asCallbackMethodCall,
  collectAbsentPropSeedReads,
  collectNullishAttrContext,
  hasComputedDefault,
  inDefaultReadOrder,
  isBooleanAttr,
  isNullableSignal,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { resolveSignalParsedThroughSeedPlan } from '../lib/compile-state.ts'
import { applyGoFallback } from '../lib/go-emit.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { literalNumberValue, typeInfoToGo } from '../type/type-codegen.ts'
import { evalExprGo, evaluatedAsGoType } from '../memo/memo-compute.ts'

/**
 * Build a map from prop name to a better Go type inferred from signals. When a
 * signal is initialized from a prop (`createSignal(props.initial ?? 0)`), the
 * signal's type annotation may be more specific than the prop's `TypeInfo`.
 *
 * Two trigger conditions, mirroring `emitPropsDataFields`'s identical
 * signal-vs-prop reconciliation for the PROPS struct field (`generate - Go
 * struct types` — "Let a specific signal type override a less-specific prop
 * type in either direction"), so the Input/Props field type this override
 * feeds (via `resolvePropGoType`) and the constructor's baked VALUE
 * (`convertInitialValue`'s `seedPassthroughPropName` prop-passthrough
 * shortcut) never disagree about which type is authoritative:
 *
 *   1. A generic prop type (containing `interface{}`) — the historical case.
 *   2. #2674: BOTH sides resolve to a CONCRETE type that DISAGREES — e.g. an
 *      inline array-element prop type (`initialTodos: Array<{ id, text,
 *      done }>`) now independently synthesizes its OWN named struct
 *      (`TodoAppInitialTodosItem`) rather than falling to `interface{}`, but
 *      a signal seeded from it via a shape-widening transform
 *      (`createSignal<Todo[]>((props.initialTodos ?? []).map(t => ({...t,
 *      editing: false})))`, `Todo` carrying an EXTRA `editing` field) still
 *      wants the signal's own `Todo` element type. Before #2674 this case
 *      was unreachable — every inline object/array prop type WAS
 *      `interface{}`-containing, so case 1 always fired — leaving the
 *      passthrough shortcut safe by accident (prop and signal Go types were
 *      always forced equal). Widening to case 2 restores that same
 *      equality now that a prop's own type can independently resolve to
 *      something concrete but narrower.
 */
export function buildPropTypeOverrides(ctx: GoEmitContext, ir: ComponentIR): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const signal of ir.metadata.signals) {
    const propNames = [signal.initialValue]
    const extracted = seedPassthroughPropName(ctx, signal.parsed)
    if (extracted) propNames.push(extracted)

    for (const propName of propNames) {
      const param = ir.metadata.propsParams.find(p => p.name === propName)
      if (!param) continue
      const propGoType = typeInfoToGo(ctx, param.type, param.defaultValue, param.parsed)
      const signalGoType = typeInfoToGo(ctx, signal.type, signal.initialValue, signal.parsed)
      if (signalGoType.includes('interface{}')) continue // never widen TO something less resolved
      if (propGoType.includes('interface{}') || signalGoType !== propGoType) {
        overrides.set(propName, signalGoType)
      }
    }
  }

  return overrides
}

/**
 * Concrete scalar Go types eligible for the nullish (`??`) nillable flip in
 * `resolvePropGoType`. Only these can round-trip through an `interface{}`
 * field and back via a constructor type assertion / `bf.ToInt`-style
 * coercion (see the fallback-var emission in `generateNewPropsFunction`).
 */
export const NULLISH_SCALAR_GO_TYPES: ReadonlySet<string> = new Set(['string', 'int', 'float64', 'bool'])

/**
 * The parsed initializers of a component's own (non-module) value consts,
 * the ones a template reads as their initializer (#3494); a function or JSX
 * const is never inlined, so a `??` in its body consumes nothing here.
 */
function computedConstInitializers(ir: ComponentIR): unknown[] {
  return (ir.metadata.localConstants ?? [])
    .filter(c => !c.isModule && !c.containsArrow && !c.isFunctionValue && !c.isJsx && !c.isJsxFunction)
    .map(c => c.parsed)
}

/**
 * Names of OPTIONAL props consumed nullish-sensitively — the left operand of
 * a `??` anywhere in the component's parsed expression trees or signal seeds
 * (#3532), or a signal's `props.X ?? <literal>` initial value (#2248).
 *
 * Why this matters: JS `??` falls back only on `null`/`undefined`, keeping
 * `''`/`0`/`false`. A Go zero-valued scalar field cannot represent "absent",
 * so a `??`-consumed optional scalar must lower to the adapter's established
 * nillable representation (`interface{}`) for the distinction to exist at
 * render time. `resolvePropGoType` applies that flip using this set.
 *
 * The IR walk is generic (any nested object/array is descended, so parsed
 * trees inside expressions, conditions, attributes, and loops are all seen)
 * and the match is shape-precise: `identifier` left (destructured props) or
 * `<propsObject>.<name>` member left. KNOWN LIMITATION (same class as
 * `collectToFixedPropNames`): an `identifier` left shadowed by a same-named
 * loop/callback param is misattributed to the prop — the flip is then merely
 * unnecessary, not incorrect.
 */
export function collectNullishConsumedPropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  // A destructure default (`{ className = '' }`) means the binding is never
  // nullish in JS — the default already applied — so such props never need
  // the nillable flip (and `applyGoFallback`'s concrete-typed baking relies
  // on them staying concrete).
  const optionalParams = new Set(
    ir.metadata.propsParams.filter(p => p.optional && p.defaultValue == null).map(p => p.name),
  )
  if (optionalParams.size === 0) return names

  const propsObject = ctx.state.propsObjectName
  const propNameOfLeft = (left: ParsedExpr): string | null => {
    if (left.kind === 'identifier') return left.name
    if (left.kind === 'member' && !left.computed && left.object.kind === 'identifier') {
      if (left.object.name === propsObject) return left.property
      // Single-hop member access rooted at a bare destructured optional
      // OBJECT prop (`user?.name ?? '…'`, #2256): the flip belongs to the
      // ROOT prop (`user`) — an optional-object prop already lowers to a
      // nillable `map[string]interface{}` by construction
      // (`resolvePropGoType`'s struct-map branch), so it's the root's
      // membership here (not the accessed field) that lets
      // `nillablePropNameOf` route the `??` to `bf_nullish`. A deeper
      // chain (`props.user?.name`, `user?.address?.city`) isn't matched —
      // same single-hop `?.` caveat documented on the `member` ParsedExpr
      // variant.
      return left.object.name
    }
    return null
  }

  // `?? <zero-equivalent literal>` (`?? ''`, `?? 0`, `?? false`) is the one
  // shape where nullish and truthiness semantics coincide — nil and the zero
  // value both land on the same output — so it earns no flip. Only a
  // fallback the zero value must NOT collapse into makes the distinction
  // observable.
  const isZeroEquivalentLiteral = (right: ParsedExpr): boolean =>
    right.kind === 'literal' &&
    (right.value === '' || right.value === false || right.value === null ||
      (right.literalType === 'number' && Number(right.value) === 0))

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const rec = node as Record<string, unknown>
    if (rec.kind === 'logical' && rec.op === '??' && rec.left && rec.right) {
      const propName = propNameOfLeft(rec.left as ParsedExpr)
      if (propName && optionalParams.has(propName) && !isZeroEquivalentLiteral(rec.right as ParsedExpr)) {
        names.add(propName)
      }
    }
    for (const value of Object.values(rec)) walk(value)
  }
  walk(ir.root)
  // A computed const reads as its initializer in the template (#3494), so a
  // `props.X ?? d` there is consumed like one written in place.
  walk(computedConstInitializers(ir))
  // A signal seed the runtime evaluator computes (`(props.n ?? 1) * 2`)
  // hands it the prop's field, which must be nil when the prop is absent
  // for that `??` to take its right side (#3532).
  walk(ir.metadata.signals.map(s => s.parsed))

  // Signal seeds (`createSignal(props.X ?? 1)`) live in metadata, not the
  // tree — reuse the seam's existing `props.X ?? <literal>` recognizer. The
  // zero-equivalent exclusion matches on the Go-formatted fallback literal.
  for (const signal of ir.metadata.signals) {
    // Resolved through the seed plan's const-hop inlining (#2685) — see
    // `resolveSignalParsedThroughSeedPlan` — so a component-scope `const`
    // between `props.X` and `createSignal` doesn't leave this loop and
    // `collectPropFallbackVars`'s identical extraction disagreeing on
    // whether the prop needs the nillable flip.
    const resolvedParsed = resolveSignalParsedThroughSeedPlan(ctx.state, signal)
    let match = ctx.extractPropFallbackFromParsed(resolvedParsed)
    // #2683: the idempotent fold above declines a non-idempotent derivation
    // (`(props.count ?? 1) * 2`) at the top level. When that signal's Go
    // field name COLLIDES with the prop's own field, the props-struct
    // emitter composes the derivation onto the SHARED field (see
    // `collectPropFallbackVars`'s identical collision gate) — which needs
    // the SAME nillable flip an ordinary `??` fallback gets, so an absent
    // prop (nil) stays distinguishable from an explicit zero-equivalent
    // value. Gated strictly on the collision, matching that other site, so
    // a differently-named signal deriving from the same prop (not
    // colliding — its own dedicated field, untouched by this fix) doesn't
    // spuriously flip the prop's type.
    if (!match) {
      const collision = ctx.extractCollisionDerivation(resolvedParsed)
      if (collision) {
        const collisionParam = ir.metadata.propsParams.find(p => p.name === collision.propName)
        const collisionField = collisionParam
          ? capitalizeFieldName(collisionParam.sourceName ?? collision.propName)
          : null
        if (collisionField && capitalizeFieldName(signal.getter) === collisionField) {
          match = { propName: collision.propName, goFallback: collision.goFallback }
        }
      }
    }
    if (!match || !optionalParams.has(match.propName)) continue
    const f = match.goFallback
    if (f === '""' || f === 'false' || f === 'nil' || Number(f) === 0) continue
    names.add(match.propName)
  }
  return names
}

/**
 * Names of OPTIONAL no-default props that directly seed a nullable signal
 * (`createSignal<string | undefined>(props.initial)`) — #3323.
 *
 * The signal's SSR value is the prop's: `undefined` when the caller omits
 * it. A concrete scalar field reads that absence as its zero value (`""`,
 * `0`), so the signal could never be nil and an attribute bound to it
 * (`title={label()}`) would render `title=""` where Hono omits it. These
 * props take the same `interface{}` flip as `??` consumption
 * (`resolvePropGoType`); the signal's own field follows the prop's type
 * and joins the nil-guarded getters (`collectNillableSignalGetters`).
 */
export function collectNullableSignalSeedPropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const optionalParams = new Set(
    ir.metadata.propsParams.filter(p => p.optional && p.defaultValue == null).map(p => p.name),
  )
  const names = new Set<string>()
  if (optionalParams.size === 0) return names
  for (const signal of ir.metadata.signals) {
    if (!isNullableSignal(signal)) continue
    const name = bareSeedPropName(ctx, signal.parsed)
    if (name !== null && optionalParams.has(name)) names.add(name)
  }
  // A seed that can evaluate to an absent optional prop, read whole or
  // through a ternary branch or a `??` / `||` / `&&` operand (#3567), reads
  // that prop the same way: its field must hold `nil` for the seed to. Only
  // a primitive prop is flipped (`resolvePropGoType`); a slice or struct prop
  // keeps its Go type, so its signal does too.
  const primitiveParams = new Set(
    ir.metadata.propsParams.filter(p => optionalParams.has(p.name) && p.type?.kind === 'primitive').map(p => p.name),
  )
  for (const reads of collectAbsentPropSeedReads(ir).values()) {
    for (const name of reads) if (primitiveParams.has(name)) names.add(name)
  }
  return names
}

/** The prop a signal seed reads whole (`initial` / `props.initial`), else null. */
export function bareSeedPropName(ctx: GoEmitContext, parsed: ParsedExpr | undefined): string | null {
  if (!parsed) return null
  const propsObject = ctx.state.propsObjectName
  if (parsed.kind === 'identifier') return propsObject ? null : parsed.name
  if (
    parsed.kind === 'member' &&
    !parsed.computed &&
    parsed.object.kind === 'identifier' &&
    parsed.object.name === propsObject
  ) {
    return parsed.property
  }
  return null
}

/**
 * The prop a signal seed passes through (#3540), read off the parsed seed:
 * `props.X` on the left of `??` / `||` (or `x ?? …` in a destructured
 * component), and the row seed `(props.X ?? []).map(cb)`, which bakes as the
 * prop's own rows (the shape example apps seed a list from; a mapped field
 * the prop lacks starts at its Go zero value). Its consumers type the
 * signal's field and the prop's field alike, and seed the signal from the
 * prop; a bare `props.X` / `x` is `bareSeedPropName`'s. Null for any other
 * seed, which the runtime evaluator computes or which refuses.
 */
export function seedPassthroughPropName(ctx: GoEmitContext, parsed: ParsedExpr | undefined): string | null {
  if (!parsed) return null
  const propsObject = ctx.state.propsObjectName
  const fallbackOf = (e: ParsedExpr): string | null => {
    if (e.kind !== 'logical' || (e.op !== '??' && e.op !== '||')) return null
    if (!propsObject) return e.left.kind === 'identifier' ? e.left.name : null
    return bareSeedPropName(ctx, e.left)
  }
  if (!propsObject) return fallbackOf(parsed)
  const direct = bareSeedPropName(ctx, parsed) ?? fallbackOf(parsed)
  if (direct !== null) return direct
  const rows = asCallbackMethodCall(parsed)
  return rows?.method === 'map' ? fallbackOf(rows.object) : null
}

/**
 * Names of OPTIONAL no-default props consumed as the BARE value of an
 * omittable attribute (`rows={rows}` / `rows={props.rows}`) anywhere in the
 * component's element tree.
 *
 * Why this matters: Hono omits an attribute whose value is `undefined`, and
 * the adapter's `emitExpression` mirrors that with a `{{if ne .X nil}}` guard
 * — which needs a nillable field to test. A concrete scalar field would
 * render the zero value (`rows="0"`) instead of dropping the attribute, so
 * these props take the same `interface{}` flip as `??` consumption
 * (`resolvePropGoType`). The match mirrors `emitExpression`'s guard branch:
 * bare identifiers / `<propsObject>.<name>` only, skipping `class`/`style`
 * (own lowerings) and boolean/presence attrs (truthiness-tested, where a nil
 * and a zero value already coincide). Same shadowing caveat as
 * `collectNullishConsumedPropNames`: a same-named loop/callback param can
 * misattribute, making the flip merely unnecessary, not incorrect.
 */
export function collectOmittableAttrConsumedPropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  const optionalParams = new Set(
    ir.metadata.propsParams.filter(p => p.optional && p.defaultValue == null).map(p => p.name),
  )
  if (optionalParams.size === 0) return names

  const propsObject = ctx.state.propsObjectName
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const rec = node as Record<string, unknown>
    if (rec.type === 'element' && Array.isArray(rec.attrs)) {
      for (const attr of rec.attrs as Array<{ name: string; value: Record<string, unknown> }>) {
        if (attr.name === 'class' || attr.name === 'className' || attr.name === 'style') continue
        if (isBooleanAttr(attr.name)) continue
        if (attr.value?.kind !== 'expression' || attr.value.presenceOrUndefined) continue
        const bareId = String(attr.value.expr ?? '').trim()
        const propName =
          propsObject && bareId.startsWith(`${propsObject}.`)
            ? bareId.slice(propsObject.length + 1)
            : bareId
        if (/^[A-Za-z_$][\w$]*$/.test(propName) && optionalParams.has(propName)) {
          names.add(propName)
        }
      }
    }
    for (const value of Object.values(rec)) walk(value)
  }
  walk(ir.root)
  return names
}

/**
 * Names of OPTIONAL no-default props consumed as the BARE value of a
 * TEXT-position expression (`{size}` / `{props.size}`) anywhere in the
 * component's element tree.
 *
 * Why this matters (#2267): with no flip, an absent `size?: number` prop
 * resolves to a concrete `int` field and `{{.Size}}` prints its zero value
 * (`0`) instead of empty — the JS reference renders `undefined` as "".
 * These props take the same `interface{}` flip as `??`/omittable-attribute
 * consumption (`resolvePropGoType`); `renderExpression`'s emitter then
 * routes the flipped field through `bf_string` (nil-safe stringify)
 * instead of a bare `{{.X}}`, since `text/template` prints a nil
 * `interface{}` as the literal `<no value>`, not "".
 *
 * Generic recursive walk (matching `type: 'expression'` ANYWHERE, like
 * `collectNullishConsumedPropNames`) rather than only `element.children` —
 * a fragment return (`<>{size}</>`) or a conditional branch's children
 * would otherwise be missed. Same shadowing caveat as the sibling
 * collectors: a same-named loop/callback param can misattribute, making
 * the flip merely unnecessary, not incorrect.
 *
 * Filtered to `kind: 'primitive'` — unlike the `??`/omittable-attribute
 * collectors (whose consumers, `bf_nullish` and the `{{if ne .X nil}}`
 * guard, are nil-test-only and pass the underlying value through
 * untouched), this collector's consumer (`renderExpression`'s `bf_string`
 * wrap) RESTRINGIFIES the value via `fmt.Sprintf`. An optional prop
 * carrying already-rendered markup (a JSX-element/children prop) also
 * independently resolves to `interface{}` via `resolvePropGoType`'s
 * struct-map branch — routing THAT through `bf_string` would strip its
 * `template.HTML` safe-markup typing, so `text/template` re-escapes
 * already-escaped HTML on print (observed as literal `&lt;div&gt;...`).
 * Restricting to primitives keeps this collector disjoint from that flip.
 */
export function collectTextConsumedPropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  const optionalParams = new Set(
    ir.metadata.propsParams
      .filter(p => p.optional && p.defaultValue == null && p.type.kind === 'primitive')
      .map(p => p.name),
  )
  if (optionalParams.size === 0) return names

  const propsObject = ctx.state.propsObjectName
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const rec = node as Record<string, unknown>
    if (rec.type === 'expression') {
      const bareId = String(rec.expr ?? '').trim()
      const propName =
        propsObject && bareId.startsWith(`${propsObject}.`)
          ? bareId.slice(propsObject.length + 1)
          : bareId
      if (/^[A-Za-z_$][\w$]*$/.test(propName) && optionalParams.has(propName)) {
        names.add(propName)
      }
    }
    for (const value of Object.values(rec)) walk(value)
  }
  walk(ir.root)
  return names
}

/**
 * Names of OPTIONAL no-default scalar props read as the RECEIVER of an
 * optional chain (`props.text?.length`, `text?.length`, `props.n?.toFixed(2)`)
 * anywhere in the component's element tree (#3422, #3435).
 *
 * The `?.` lowering guards the read with `bf_eq <receiver> nil`, so an
 * absent receiver yields `undefined` (empty text, and the `??` fallback).
 * A concrete `string` field reads an omitted prop as `""`, the guard never
 * fires, and `.length` renders `0`. These props take the same
 * `interface{}` flip as `??`/attribute/text consumption
 * (`resolvePropGoType`), which also drops the absent prop from the
 * hydration payload. Same shadowing caveat as the sibling collectors: a
 * same-named loop/callback param can misattribute, making the flip merely
 * unnecessary, not incorrect.
 */
export function collectOptionalChainReceiverPropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  const optionalParams = new Set(
    ir.metadata.propsParams
      .filter(p => p.optional && p.defaultValue == null && p.type.kind === 'primitive')
      .map(p => p.name),
  )
  if (optionalParams.size === 0) return names

  const propsObject = ctx.state.propsObjectName
  const propNameOf = (receiver: ParsedExpr): string | null =>
    receiver.kind === 'member' && !receiver.computed &&
      receiver.object.kind === 'identifier' && receiver.object.name === propsObject
      ? receiver.property
      : !propsObject && receiver.kind === 'identifier'
        ? receiver.name
        : null
  const isNullish = (e: ParsedExpr): boolean =>
    (e.kind === 'literal' && e.literalType === 'null') || (e.kind === 'identifier' && e.name === 'undefined')
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const rec = node as Record<string, unknown>
    if (rec.kind === 'member' && rec.optional === true && rec.object) {
      const propName = propNameOf(rec.object as ParsedExpr)
      if (propName && optionalParams.has(propName)) names.add(propName)
    }
    // An optional-chained CALL (`props.x?.toFixed(2)`) reaches here as the
    // parser's guard `props.x === null || props.x === undefined ? … : …`
    // (#3435), so an equality against null / undefined marks the receiver.
    if (rec.kind === 'binary' && ['===', '!==', '==', '!='].includes(rec.op as string) && rec.left && rec.right) {
      const l = rec.left as ParsedExpr
      const r = rec.right as ParsedExpr
      const propName = isNullish(r) ? propNameOf(l) : isNullish(l) ? propNameOf(r) : null
      if (propName && optionalParams.has(propName)) names.add(propName)
    }
    for (const value of Object.values(rec)) walk(value)
  }
  walk(ir.root)
  return names
}

/**
 * Names of OPTIONAL no-default props read as an arithmetic operand whose nil
 * reads as `undefined` (`props.n * 2`, `n + 1`, `-n` with `n?: number`)
 * anywhere in the component's element tree (#3533). The shared decision
 * (`arithmeticOperandCoercion`) routes the operand through `bf_number`,
 * which maps nil to `NaN` as JS `ToNumber(undefined)` does. A concrete
 * `float64` field reads an omitted prop as `0`, so these props take the same
 * `interface{}` flip as `??`/attribute/text consumption
 * (`resolvePropGoType`). Same shadowing caveat as the sibling collectors: a
 * same-named loop/callback param can misattribute, making the flip merely
 * unnecessary, not incorrect.
 */
export function collectArithmeticAbsentPropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  const optionalParams = new Set(
    ir.metadata.propsParams
      .filter(p => p.optional && p.defaultValue == null && p.type.kind === 'primitive')
      .map(p => p.name),
  )
  if (optionalParams.size === 0) return names

  const nullishCtx = collectNullishAttrContext(ir)
  const propsObject = ctx.state.propsObjectName
  const propNameOf = (operand: ParsedExpr): string | null =>
    operand.kind === 'member' && !operand.computed &&
      operand.object.kind === 'identifier' && operand.object.name === propsObject
      ? operand.property
      : !propsObject && operand.kind === 'identifier'
        ? operand.name
        : null
  const addOperand = (op: string, operand: ParsedExpr, other: ParsedExpr | undefined): void => {
    const propName = propNameOf(operand)
    if (propName === null || !optionalParams.has(propName)) return
    if (arithmeticOperandCoercion(op, operand, other, nullishCtx) === 'undefined') names.add(propName)
  }
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const rec = node as Record<string, unknown>
    if (rec.kind === 'binary' && rec.left && rec.right) {
      const left = rec.left as ParsedExpr
      const right = rec.right as ParsedExpr
      addOperand(rec.op as string, left, right)
      addOperand(rec.op as string, right, left)
    }
    if (rec.kind === 'unary' && rec.op === '-' && rec.argument) addOperand('-', rec.argument as ParsedExpr, undefined)
    for (const value of Object.values(rec)) walk(value)
  }
  walk(ir.root)
  return names
}

/**
 * Names of OPTIONAL no-default props whose PRESENCE is tested — `props.X
 * !== undefined` / `!= undefined` (or the `===`/`==` negation) — anywhere in
 * a memo's computation (#2260). This is the "controlled component" idiom's
 * `isControlled` check (`createMemo(() => props.pressed !== undefined)`):
 * distinguishing "caller passed a value" from "caller omitted the prop" is
 * only expressible on the nillable `interface{}` representation (a
 * concrete `bool` field can't tell `pressed={false}` from omitted `pressed`
 * apart — both are the Go zero value `false`), so these props take the
 * same `interface{}` flip as `??`/attribute/text consumption
 * (`resolvePropGoType`). `memoInitialFromParsedBody`'s presence-check
 * branch then lowers the comparison to `in.X != nil`.
 *
 * Scoped to `ir.metadata.memos[].parsed` (not the generic tree walk the
 * sibling collectors use) — a presence check is a memo-computation shape,
 * never a JSX child/attribute expression.
 */
export function collectPresenceCheckedPropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  const optionalParams = new Set(
    ir.metadata.propsParams
      .filter(p => p.optional && p.defaultValue == null && p.type.kind === 'primitive')
      .map(p => p.name),
  )
  if (optionalParams.size === 0) return names

  const propsObject = ctx.state.propsObjectName
  const isUndefinedCheck = (op: string): boolean =>
    op === '!==' || op === '!=' || op === '===' || op === '=='

  for (const memo of ir.metadata.memos) {
    const body = memo.parsed
    if (!body || body.kind !== 'binary' || !isUndefinedCheck(body.op)) continue
    const other = body.right.kind === 'identifier' && body.right.name === 'undefined'
      ? body.left
      : body.left.kind === 'identifier' && body.left.name === 'undefined'
        ? body.right
        : null
    if (!other) continue
    // Object-props style (`props.X`) — `other` is a member access rooted at
    // the props object. Destructured style (`X` bare) — `other` is a bare
    // identifier naming the prop directly.
    const propName =
      other.kind === 'member' && !other.computed &&
        other.object.kind === 'identifier' && other.object.name === propsObject
        ? other.property
        : !propsObject && other.kind === 'identifier'
          ? other.name
          : null
    if (propName && optionalParams.has(propName)) names.add(propName)
  }
  return names
}

/**
 * Resolve a prop param's Go struct-field type using the SAME logic
 * `generatePropsStruct` / `generateInputStruct` use: a `propTypeOverrides` entry
 * wins, otherwise `typeInfoToGo(param.type, param.defaultValue, param.parsed)`.
 * Factored out so
 * the nillable-field set (`collectNillablePropNames`) can't drift from the
 * emitted field types.
 */
/**
 * The Go value of a destructured prop binding with its destructure default
 * applied, read off the input struct: the props field it initializes and the
 * runtime evaluator's environment both read it (#3540). Null when the binding
 * has no literal default.
 *
 * The input field may be `interface{}` although the binding's own type is
 * concrete: the Input struct declares a caller-facing field once, typed by its
 * first `propsParams` entry, and a second binding of the same name (a renamed
 * body destructure `{ label: text = 'none' }` beside a raw `props.label` read
 * under `??`) can lose that nillable flip (#2943). The zero-value check of
 * `applyGoFallback` would not compile there, so it nil-checks and asserts back
 * to the binding's type instead.
 */
export function defaultedBindingGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
): string | null {
  const paramDefault = propLiteralDefaultGo(param)
  if (paramDefault === null) return sharedDependentDefaultGo(ctx, param, propsParams, propTypeOverrides)
  const inputField = capitalizeFieldName(param.sourceName ?? param.name)
  const outputType = resolvePropGoType(ctx, param, propTypeOverrides)
  const fieldOwner = propsParams.find(p => capitalizeFieldName(p.sourceName ?? p.name) === inputField)
  const inputType = fieldOwner ? resolvePropGoType(ctx, fieldOwner, propTypeOverrides) : undefined
  if (inputType === 'interface{}') {
    const read = outputType === 'interface{}' ? `in.${inputField}` : `in.${inputField}.(${outputType})`
    return `func() ${outputType} { if in.${inputField} == nil { return ${paramDefault} }; return ${read} }()`
  }
  return applyGoFallback(`in.${inputField}`, paramDefault)
}

/**
 * The constructor statements that apply a computed destructure default
 * (`hasComputedDefault`): one reading an earlier prop (`{ a, b = a }`,
 * `{ off = false, on = !off }`, `ParamInfo.defaultParts`, #3531) or any other
 * non-literal one (`{ n = 'abc'.length }`), or a non-zero literal one (`{ a = 'x' }`),
 * to the Input itself ({@link appliesDefaultOnNil}), before anything reads
 * it: `if in.B == nil { in.B = <default> }`, one prop at a time in the
 * defaults' read order (`inDefaultReadOrder`). Every later `in.B` read, a
 * signal seed, a memo, a child prop or the Props field, then sees the
 * resolved binding in the field's own Go type, so no reader needs a path of
 * its own. Such a prop's field is nillable: a slice, map or pointer is, and a
 * scalar is flipped to `interface{}` ({@link resolvePropGoType}), so an
 * explicit `false` / `''` / `0` stays the caller's value.
 *
 * A default reading one earlier prop is that prop's resolved Go value
 * (`in.A`, or its own literal default). Any other default is computed by the
 * runtime evaluator, which takes a scalar, or anything into an `interface{}`
 * field. `rawLocals` keeps each caller value `bfCallerProps` reads
 * (`keepsCallerValue`), by Input field, and
 * `unsupported` names the props whose default reads an earlier prop and
 * can't be applied this way (the caller refuses them loudly); any other
 * computed default the evaluator can't build is left unapplied.
 */
export function dependentDefaultNormalization(
  ctx: GoEmitContext,
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
  keepsCallerValue: (param: IRMetadata['propsParams'][number]) => boolean,
): { lines: string[]; rawLocals: Map<string, string>; unsupported: string[] } {
  const lines: string[] = []
  const rawLocals = new Map<string, string>()
  const unsupported: string[] = []
  for (const param of inDefaultReadOrder(propsParams)) {
    if (param.isRest || !param.parsed || !appliesDefaultOnNil(param)) continue
    // A binding sharing its Input field with another one (a renamed body
    // destructure beside a raw `props.b` read) can't change `in`: the other
    // reads the caller's value. Its own reads take
    // `sharedDependentDefaultGo` instead, refused here like any other default
    // the constructor can't build.
    if (sharesInputField(param, propsParams)) {
      if (param.defaultParts && sharedDependentDefaultGo(ctx, param, propsParams, propTypeOverrides) === null) unsupported.push(param.name)
      continue
    }
    const field = capitalizeFieldName(param.sourceName ?? param.name)
    const goType = resolvePropGoType(ctx, param, propTypeOverrides)
    // A literal default on a field that stays concrete (a string-union prop,
    // a required one) keeps `defaultedBindingGo`'s zero-value test.
    if (!hasComputedDefault(param) && !isNillableGoType(goType)) continue
    const value = isNillableGoType(goType) ? dependentDefaultGo(ctx, param, goType, propsParams, propTypeOverrides) : null
    if (value === null) {
      // A default reading an earlier prop is refused. Any other computed one
      // the evaluator can't build (a callback, a module const) is left
      // unapplied, as before, and tracked as a render divergence.
      if (param.defaultParts) unsupported.push(param.name)
      continue
    }
    if (keepsCallerValue(param)) {
      const raw = `bfCaller${field}`
      rawLocals.set(field, raw)
      lines.push(`\t${raw} := in.${field}`)
    }
    lines.push(`\tif in.${field} == nil {`)
    lines.push(`\t\tin.${field} = ${value}`)
    lines.push('\t}')
  }
  if (lines.length > 0) lines.push('')
  return { lines, rawLocals, unsupported }
}

/** Whether another binding reads `param`'s caller-facing Input field (`{ b: local = a }` beside `props.b`). */
function sharesInputField(param: IRMetadata['propsParams'][number], propsParams: IRMetadata['propsParams']): boolean {
  const key = param.sourceName ?? param.name
  return propsParams.some(p => p !== param && !p.isRest && (p.sourceName ?? p.name) === key)
}

/**
 * {@link defaultedBindingGo} for a binding with a computed default
 * (`hasComputedDefault`) whose Input field another binding also reads, so the default is
 * not applied to `in` (`dependentDefaultNormalization`): the binding's own
 * value, the default when the field is nil. Null for any other binding, or
 * when the field can't tell an absent prop apart.
 */
function sharedDependentDefaultGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
): string | null {
  if (!hasComputedDefault(param) || !param.parsed || !sharesInputField(param, propsParams)) return null
  const key = param.sourceName ?? param.name
  const owner = propsParams.find(p => !p.isRest && (p.sourceName ?? p.name) === key) ?? param
  const inputType = resolvePropGoType(ctx, owner, propTypeOverrides)
  const outputType = resolvePropGoType(ctx, param, propTypeOverrides)
  if (!isNillableGoType(inputType)) return null
  const value = dependentDefaultGo(ctx, param, outputType, propsParams, propTypeOverrides)
  if (value === null) return null
  const field = `in.${capitalizeFieldName(key)}`
  const read = outputType === inputType || outputType === 'interface{}' ? field : `${field}.(${outputType})`
  return `func() ${outputType} { if ${field} == nil { return ${value} }; return ${read} }()`
}

/**
 * A binding's value as an evaluator environment entry when only the runtime
 * evaluator can build its destructure default (one that passes a callback,
 * `{ b: local = ['y', ''].filter((x) => x !== '') }`): the caller's value,
 * or the evaluated default when the Input field is nil. Null for a binding
 * without such a default, or when the field can't tell an absent prop apart.
 */
export function evaluatedDefaultBindingGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
): string | null {
  if (param.defaultValue === undefined || !param.parsed || param.defaultParts) return null
  const key = param.sourceName ?? param.name
  const owner = propsParams.find(p => !p.isRest && (p.sourceName ?? p.name) === key) ?? param
  if (!isNillableGoType(resolvePropGoType(ctx, owner, propTypeOverrides))) return null
  const value = evalExprGo(ctx, param.parsed, [], propsParams, new Map(), new Set())
  if (value === null) return null
  const field = `in.${capitalizeFieldName(key)}`
  return `func() any { if ${field} == nil { return ${value} }; return ${field} }()`
}

function isNillableGoType(goType: string): boolean {
  return goType === 'interface{}' || goType === 'any' || goType.startsWith('[]') || goType.startsWith('map[') || goType.startsWith('*')
}

/** The Go value of `param`'s literal or computed default, in its field's type `goType`; null when it can't be built. */
function dependentDefaultGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  goType: string,
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
): string | null {
  const parsed = param.parsed!
  // A literal default (`{ a = 'x' }`) is its own Go literal.
  if (!hasComputedDefault(param)) return propLiteralDefaultGo(param)
  const ref = parsed.kind === 'identifier' ? propsParams.find(p => !p.isRest && p.name === parsed.name) : undefined
  if (ref) {
    const refType = resolvePropGoType(ctx, ref, propTypeOverrides)
    if (goType !== 'interface{}' && goType !== 'any' && refType !== goType) return null
    // An earlier dependent prop is already resolved on `in`; a literal
    // default applies here.
    return defaultedBindingGo(ctx, ref, propsParams, propTypeOverrides) ?? `in.${capitalizeFieldName(ref.sourceName ?? ref.name)}`
  }
  const evaluated = evalExprGo(ctx, parsed, [], propsParams, new Map(), new Set())
  return evaluated === null ? null : evaluatedAsGoType(evaluated, goType)
}

export function resolvePropGoType(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propTypeOverrides: Map<string, string>,
): string {
  const base = propTypeOverrides.get(param.name) ?? typeInfoToGo(ctx, param.type, param.defaultValue, param.parsed)
  // An OPTIONAL prop typed as a named struct (`opts?: EmblaOptionsType`) lowers
  // to `map[string]interface{}`, not the value struct: a value struct is always
  // truthy in Go templates (so a `{{if .Opts}}`-guarded attribute could never be
  // omitted), whereas a nil/empty map is falsy and round-trips through `bf_json`
  // with only the supplied keys — matching JS `JSON.stringify` of a partial
  // object instead of a zero-filled struct.
  // Gate on `localStructFields` (an actual generated struct), NOT
  // `localTypeNames` — the latter also covers string-union aliases
  // (`placement?: 'top' | 'right' | …`), which must stay their scalar Go type.
  if (param.optional && ctx.state.localStructFields.has(base)) {
    return 'map[string]interface{}'
  }
  // An OPTIONAL scalar prop consumed by `??` lowers to `interface{}` (#2248):
  // a zero-valued `string`/`int` field cannot distinguish "absent" from
  // `''`/`0`, so JS nullish semantics (which KEEP `''`/`0`) are unexpressible
  // on the concrete type. `interface{}` is the adapter's established nillable
  // representation; the `??` template lowering then tests nil-ness via
  // `bf_nullish` and the constructor seeds via a nil check + assertion.
  // Assignment ergonomics are unchanged (plain literals assign into
  // `interface{}`), and the prop joins the existing nillable behaviours
  // (bare-attribute omission) by construction.
  //
  // Gated to `kind: 'primitive'` — a string-union prop
  // (`placement?: 'top' | 'bottom'`) must stay its scalar Go type (the same
  // invariant the struct-map gate above documents): the union-typed
  // class-composition lowerings key off the concrete type, AND the flip
  // would buy nothing — the zero value (`""`) is never a legal union
  // member, so the zero-check already coincides with nullish semantics for
  // every valid input. (A literal-number union containing 0 would be the
  // exception; none exists in the corpus and the conflation is the
  // documented pre-#2248 trade-off there.)
  // A bare-attribute consumption (`rows={rows}`) takes the same flip (#2259):
  // attribute omission for an absent optional needs a nil to test — see
  // `collectOmittableAttrConsumedPropNames`. A bare TEXT-position
  // consumption (`{size}`) takes the same flip too (#2267) — see
  // `collectTextConsumedPropNames`. A presence check (`props.X !==
  // undefined`, the "controlled component" idiom's `isControlled` memo)
  // takes the same flip too (#2260) — see `collectPresenceCheckedPropNames`.
  // A prop seeding a nullable signal takes it too (#3323) — see
  // `collectNullableSignalSeedPropNames`. So does an optional-chain
  // receiver (#3422) — see `collectOptionalChainReceiverPropNames`. So does
  // an arithmetic operand whose nil reads as `undefined` (#3533) — see
  // `collectArithmeticAbsentPropNames`. So does a param a `{...props}`
  // spread onto a child component forwards (#3530) — see
  // `collectPropsSpreadForwardedParams`.
  // A default that reads an earlier prop (`{ off = false, on = off }`,
  // #3531), or a literal one other than the zero value (`{ tag = 'z' }`,
  // `{ n = 2 }`, `{ on = true }`), applies to an absent prop only, which the
  // constructor tells apart by nil (`appliesDefaultOnNil`,
  // `dependentDefaultNormalization`): an explicit `''` / `0` / `false` stays
  // the caller's value.
  if (
    param.optional &&
    param.type.kind === 'primitive' &&
    (appliesDefaultOnNil(param) ||
      ctx.state.nullishConsumedPropNames.has(param.name) ||
      ctx.state.omittableAttrConsumedPropNames.has(param.name) ||
      ctx.state.textConsumedPropNames.has(param.name) ||
      ctx.state.presenceCheckedPropNames.has(param.name) ||
      ctx.state.nullableSignalSeedPropNames.has(param.name) ||
      ctx.state.optionalChainReceiverPropNames.has(param.name) ||
      ctx.state.arithmeticAbsentPropNames.has(param.name) ||
      ctx.state.propsSpreadForwardedPropNames.has(param.name)) &&
    NULLISH_SCALAR_GO_TYPES.has(base)
  ) {
    return 'interface{}'
  }
  return base
}

/**
 * Whether the constructor applies `param`'s destructure default to its Input
 * field when the field is nil (`dependentDefaultNormalization`), which a
 * scalar field is boxed for ({@link resolvePropGoType}): a computed default
 * (`hasComputedDefault`: one reading an earlier prop, `{ a, b = a }`, #3531,
 * or any other non-literal one, `{ n = 'abc'.length }`), or a literal one
 * other than the field's Go zero value ({@link hasNonZeroLiteralDefault}).
 */
export function appliesDefaultOnNil(param: IRMetadata['propsParams'][number]): boolean {
  return hasComputedDefault(param) || hasNonZeroLiteralDefault(param)
}

/**
 * Whether `param`'s destructure default is a literal other than its Go type's
 * zero value (`{ a = 'x' }`, `{ n = 2 }`, `{ on = true }`). The default
 * applies to an absent prop only, so an explicit `''` / `0` / `false` must stay
 * the caller's value; a concrete field reads both as its zero value, which
 * only a nil can tell apart. A zero default (`{ a = '' }`) needs no nil: an
 * absent prop and the default render the same.
 */
function hasNonZeroLiteralDefault(param: IRMetadata['propsParams'][number]): boolean {
  if (param.defaultValue == null) return false
  const value = scalarLiteralDefault(param)
  return value !== null && value !== '' && value !== 0 && value !== false
}

/**
 * The value of `param`'s destructure default when it is a scalar literal
 * (`'x'`, `2`, `-1e3`, `0x10`, `true`), read off the parsed tree; null for
 * any other shape. The single classification both the nil-boxing decision
 * ({@link hasNonZeroLiteralDefault}) and the Go literal it applies
 * ({@link propLiteralDefaultGo}) read, so a spelling one accepts the other
 * can always emit.
 */
function scalarLiteralDefault(param: IRMetadata['propsParams'][number]): string | number | boolean | null {
  const parsed = param.parsed
  if (!parsed) return null
  const number = literalNumberValue(parsed)
  if (number !== null) return number
  if (parsed.kind !== 'literal') return null
  if (parsed.literalType === 'string' || parsed.literalType === 'boolean') return parsed.value
  return null
}

/**
 * The Go literal of `param`'s scalar literal destructure default, spelled from
 * its parsed value rather than its source text: `1e3`, `0x10`, `.5`, `1_000`
 * all yield the same number, and a string default carries its decoded value
 * (`'a\nb'` holds a newline), re-quoted for Go. Null when the default is not
 * a scalar literal or has no finite Go spelling.
 *
 * A number is spelled as an untyped FLOAT constant (`2.0`, `0.5`,
 * `100000000000000000000.0`, `1e+21`): boxed into an `interface{}` field it
 * holds a `float64`, the type a JSON-decoded caller number takes and the one
 * `bf.Text` / `bf.String` spell as JS `String(n)` does. An integer
 * constant would box as `int`, and one past int64 (`1e20`) would not
 * compile at all.
 */
export function propLiteralDefaultGo(param: IRMetadata['propsParams'][number]): string | null {
  const value = scalarLiteralDefault(param)
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number' && Number.isFinite(value)) return goFloatConstant(value)
  return null
}

/** `value` as a Go untyped float constant: JS `String` spelling, with `.0` when it has neither a point nor an exponent. */
function goFloatConstant(value: number): string {
  const text = String(value)
  return /[.e]/.test(text) ? text : `${text}.0`
}

/**
 * Build the set of prop NAMES whose resolved Go field type is exactly
 * `interface{}` (nillable, for Hono-style attribute omission). Uses the same
 * `propTypeOverrides` + `resolvePropGoType` pipeline as the struct generators;
 * the caller passes the overrides map it stashed on the compile state.
 * Concrete (`string`/`int`/`bool`/`[]T`/struct) types are excluded.
 */
export function collectNillablePropNames(
  ctx: GoEmitContext,
  ir: ComponentIR,
  propTypeOverrides: Map<string, string>,
): Set<string> {
  const nillable = new Set<string>()
  for (const param of ir.metadata.propsParams) {
    if (resolvePropGoType(ctx, param, propTypeOverrides) === 'interface{}') {
      nillable.add(param.name)
    }
  }
  return nillable
}
