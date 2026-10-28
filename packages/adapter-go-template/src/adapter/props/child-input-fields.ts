/**
 * Child-component Input lowering (#3425): how one child-component call's
 * props become the fields of its `New<Child>Props(<Child>Input{...})`
 * composite literal in the parent's constructor — the ONE place that decides
 * how a caller-side prop value becomes a constructor-time Go value.
 *
 * The orchestrator in `go-template-adapter.ts` emits the surrounding literal
 * (scope IDs, context fields, the reserved children slot) and decides where
 * each construction goes; the decisions about the props live here as free
 * functions over a {@link ChildInputHost}:
 *
 * - {@link lowerChildInputFields} — one call's props, shared by every site.
 * - {@link lowerLoopRowChildInputFields} — a child built once per loop and
 *   shared by every row, refusing an SSR prop it can't lower.
 * - {@link sourceRowChildInputFields} — a bodyless prop-array loop's row,
 *   reading the row-dependent props off the source row.
 *
 * A `{...props}` spread onto the child is resolved per key by the shared plan
 * (`props/props-spread.ts`, #3530) before the props are lowered; the value of
 * one prop is resolved by the steps in `value/child-prop-value.ts`.
 */

import {
  freeIdentifiers,
  isEventHandlerName,
  isFunctionShapedExpression,
  type BindingScope,
  type ComponentIR,
  type IRNode,
  type IRProp,
  type JsSourceText,
  type ParsedExpr,
  type ParsedStatement,
  type TypeInfo,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { findModuleScopeConst, findValuedLocalConst } from '../lib/compile-state.ts'
import { SCALAR_ROW_GO_TYPES } from '../lib/constants.ts'
import { goLiteral } from '../lib/go-emit.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { rowItemPath, rowReadGoAccessor, rowReadGoValue, type LoopRowBinding, type LoopRowShape } from '../lib/loop-row-path.ts'
import type { ChildComponentShape, NestedComponentInfo, PropFallbackVar } from '../lib/types.ts'
import { objectBakeTargetFor, routesToRestBag } from '../lib/types.ts'
import { evaluateChildPropValue, resolveLocalGetterAsGo, templatePartsToGoCode, unboxNillablePropRef } from '../value/child-prop-value.ts'
import { parsedLiteralToGo } from '../value/parsed-literal-to-go.ts'
import { objectLiteralToGoComposite, unboxToGoScalar } from '../value/value-lowering.ts'
import { isFinalPropWriter, isPropsObjectSpread, resolvePropsSpreadCall } from './props-spread.ts'

type GetterSignal = { getter: string; setter: string | null; initialValue: JsSourceText; type: TypeInfo; parsed?: ParsedExpr }
type GetterMemo = { name: string; computation: JsSourceText; deps: string[]; parsed?: ParsedExpr; parsedBlock?: ParsedStatement[]; parsedBlockComplete?: boolean }

/**
 * What the child-Input lowering needs from the adapter beyond the shared
 * {@link GoEmitContext}: the cross-compile child-shape registry, the
 * constructor-time resolution of a bare child-prop value, and the rendering
 * of a JSX-valued prop into a static Go string. Kept out of `GoEmitContext`
 * because only this module reads them.
 */
export interface ChildInputHost {
  readonly ctx: GoEmitContext
  /**
   * The registered shape of the child a call names (`childComponentShapes`),
   * looked up by its DECLARED name, not the caller-local alias (#2822).
   */
  childShape(childName: string): ChildComponentShape | undefined
  /**
   * A bare child-prop value's constructor-time Go value (a getter call, a
   * comparison against one, a passthrough prop), or null.
   */
  resolveDynamicPropValue(
    expr: string,
    signals: GetterSignal[],
    memos: { name: string; computation: JsSourceText; deps: string[] }[],
    propsParams: { name: string; sourceName?: string }[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
    nillableDest?: boolean,
  ): string | null
  /** The children as plain text, or null when any child is not text. */
  extractTextChildren(children: IRNode[]): string | null
  /** The children rendered to static HTML, or null when an action survives. */
  extractHtmlChildren(children: IRNode[]): string | null
  /** A Go concatenation splicing the parent `scopeID` into needsScope children, or null. */
  extractScopedHtmlChildren(children: IRNode[]): string | null
}

type ChildInputField = { goField: string; goValue: string }

/** One child call being lowered: everything a per-prop step reads, plus where its fields go. */
interface ChildCallSite {
  readonly host: ChildInputHost
  readonly child: { name: string; props: readonly IRProp[] }
  readonly ir: ComponentIR
  readonly propFallbackVars: ReadonlyMap<string, PropFallbackVar>
  readonly childShape: ChildComponentShape | undefined
  /** Emit `jsxName`'s value as a field (or rest-bag entry) of the literal. */
  readonly emit: (jsxName: string, writtenValue: string) => void
}

/**
 * Lower one child-component call's props into the fields of its
 * `New<Child>Props(<Child>Input{...})` composite literal — the ONE place
 * that decides how a caller-side prop value becomes a constructor-time Go
 * value. Shared by the non-loop child instances (`emitStaticChildInstances`)
 * and every loop-row wrapper construction (`lowerLoopRowChildInputFields`:
 * the loop-body component itself and the components nested in its
 * forwarded children).
 *
 * Returns the `Field: value` pairs in emission order (the rest-bag map, when
 * any prop routes into it, last) plus `unlowered`: the props that produced
 * no field and no diagnostic of their own. What an unlowered prop means is
 * the caller's decision — the non-loop site leaves it to the child's own
 * default, the loop-row sites refuse it.
 *
 * `rowScope` (loop-row sites only) is the row scope enclosing the call; a
 * prop reading a name bound there is skipped (see the loop below).
 */
export function lowerChildInputFields(
  host: ChildInputHost,
  child: { name: string; props: readonly IRProp[] },
  ir: ComponentIR,
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  rowScope?: BindingScope,
): { fields: ChildInputField[]; unlowered: IRProp[] } {
  const fields: ChildInputField[] = []
  const unlowered: IRProp[] = []
  // #2822: cross-file shapes are keyed by the child's own DECLARED name,
  // not the caller-local alias — see `importAliases`.
  // Non-param attrs route into the child's rest bag (see
  // `childComponentShapes`); `restBagEntries` collects `"jsx-attr-name":
  // goValue` pairs for that map.
  const childShape = host.childShape(child.name)
  const restBagEntries: string[] = []
  // A `{...props}` spread, resolved per key by the shared plan (#3530).
  const call = planChildCallProps(host.ctx, child, ir, childShape)
  const emit = (jsxName: string, writtenValue: string): void =>
    emitChildField(fields, restBagEntries, childShape, jsxName, call.passedOr(jsxName, writtenValue))
  const site: ChildCallSite = { host, child, ir, propFallbackVars, childShape, emit }
  call.paramFields.forEach(field => emit(field.name, field.goValue))
  for (const prop of call.props) {
    // A prop reading the row (`tone={o.tone}`) can't be evaluated here: the
    // constructor runs once, outside the row. It is delivered per row at
    // template time instead (`loopRowChildPropOverrides`), under the same
    // `isBound` question that delivery asks of the live scope.
    if (rowScope && propReadsRow(prop, rowScope)) continue
    if (!lowerChildProp(site, prop)) unlowered.push(prop)
  }
  // Rest-bag entries → the child's open-ended bag field
  // (`Props: map[string]any{...}`).
  if (childShape?.restBagField && restBagEntries.length > 0) {
    fields.push({ goField: childShape.restBagField, goValue: `map[string]any{${restBagEntries.join(', ')}}` })
  }
  return { fields, unlowered }
}

/** One field of the literal for `jsxName`, or its rest-bag entry. */
function emitChildField(
  fields: ChildInputField[],
  restBagEntries: string[],
  childShape: ChildComponentShape | undefined,
  jsxName: string,
  goValue: string,
): void {
  if (routesToRestBag(childShape, jsxName)) {
    restBagEntries.push(`${JSON.stringify(jsxName)}: ${goValue}`)
    return
  }
  // A hyphenated attr (`aria-label`) can't be a Go field and, with no rest
  // bag to route it into, has nowhere to go — skip over emitting invalid Go.
  if (jsxName.includes('-')) return
  // `<Child>Input{...}` composite literal: Input fields are
  // caller-facing and `jsxName` IS the caller-facing name, so no
  // `childPropFieldNames` lookup — that map resolves the child's
  // LOCAL/Props field for `loopRowChildPropOverrides`'s different
  // struct.
  const fieldName = capitalizeFieldName(jsxName)
  // A `float64` field (a `number` prop) also takes this caller's `int`
  // value (a `.length` memo, a loop index): `bf.Number` converts any
  // numeric Go value. A numeric literal assigns as is.
  const numeric = childShape?.paramGoTypes.get(jsxName) === 'float64' &&
    !/^-?\d+(\.\d+)?$/.test(goValue) && !goValue.startsWith('bf.Number(')
  fields.push({ goField: fieldName, goValue: numeric ? `bf.Number(${goValue})` : goValue })
}

/** Lower one prop of the call. False when it produced no field and no diagnostic of its own (`unlowered`). */
function lowerChildProp(site: ChildCallSite, prop: IRProp): boolean {
  switch (prop.value.kind) {
    case 'literal':
      site.emit(prop.name, goLiteral(prop.value.value))
      return true
    case 'boolean-shorthand':
    case 'boolean-attr':
      site.emit(prop.name, 'true')
      return true
    case 'expression':
    case 'spread':
    case 'template':
      return lowerExpressionChildProp(site, prop, prop.value)
    case 'jsx-children':
      lowerJsxChildProp(site, prop, prop.value.children)
      return true
  }
  return true
}

/** An `expression` / `spread` / `template` prop value. */
function lowerExpressionChildProp(
  site: ChildCallSite,
  prop: IRProp,
  value: Extract<IRProp['value'], { kind: 'expression' | 'spread' | 'template' }>,
): boolean {
  // Prefer parsed template parts when present (carried on both
  // `expression` and `template`): handles the shadcn variant lookup
  // (`record-index-lookup-via-child-prop`) that
  // `resolveDynamicPropValue` can't represent.
  const parts =
    value.kind === 'template' || value.kind === 'expression'
      ? value.parts
      : undefined
  if (parts) {
    const goExpr = templatePartsToGoCode(site.host.ctx, parts, site.ir.metadata.propsParams)
    if (goExpr !== null) {
      site.emit(prop.name, goExpr)
      return true
    }
    // Parts opted out (unsupported kind) → bare-expression path below.
  }

  // `template` kind has no raw expr string (discarded for the parts).
  const exprText = value.kind === 'template' ? '' : value.expr
  if (!exprText) return false
  // Inline object literal to a child's object-shaped prop
  // (`opts={{ align: 'start' }}`, or #2925's `value={{ v: count }}`)
  // bakes to a Go map or struct literal per the child's registered
  // shape (`objectBakeTargetFor` — an OPTIONAL object prop's field
  // is `map[string]interface{}`; a REQUIRED one is a synthesized
  // struct, #2674). Only an `expression` attr carries `.parsed`.
  // `resolveIdentifier` resolves a property value that's a bare
  // local signal/memo getter (`{ v: count }`) against this SAME
  // component's constructor-time seeding — #2925, the object-
  // literal-wrapped twin of the bare-getter fix below.
  const parsedValue =
    value.kind === 'expression' ? value.parsed : undefined
  if (parsedValue?.kind === 'conditional' && routesToRestBag(site.childShape, prop.name)) {
    const ternary = restBagTernaryValue(site, parsedValue)
    if (ternary !== null) {
      site.emit(prop.name, ternary)
      return true
    }
  }
  const objectTarget = objectBakeTargetFor(site.childShape, prop.name)
  if (parsedValue && objectTarget) {
    const { signals, memos, propsParams } = site.ir.metadata
    const goObj = objectLiteralToGoComposite(
      site.host.ctx,
      parsedValue,
      objectTarget,
      name => resolveLocalGetterAsGo(site.host.ctx, name, signals, memos, propsParams, site.propFallbackVars),
    )
    if (goObj !== null) {
      site.emit(prop.name, goObj)
      return true
    }
  }
  // A number/boolean JSX-EXPRESSION literal (`count={5}`,
  // `active={true}`) — as opposed to a plain quoted string attr
  // (`label="mail"`, which is `case 'literal':` above, an entirely
  // different `AttrValue` kind) — is still `kind: 'expression'`
  // here, since curly braces always parse to an expression
  // container regardless of what's inside them. #2168
  // child-primitive-props: `resolveDynamicPropValue` below only
  // recognizes a getter call or a comparison against one; a bare
  // `5`/`true` matches neither, so the field was silently OMITTED
  // and the Badge's `Count`/`Active` fields defaulted to Go's zero
  // value (`0`/`false`) regardless of the actual literal.
  //
  // Route through `parsedLiteralToGo` rather than hand-rolling a
  // switch on `.value`/`.literalType`: a numeric literal needs its
  // exact source `raw` token (Copilot review — `String(value)` can
  // change spelling/precision, e.g. a large integer or `-0`), and
  // `parsedLiteralToGo` also covers the LEADING-UNARY-MINUS shape
  // (`count={-5}` parses as `kind: 'unary'` wrapping the literal,
  // not `kind: 'literal'` itself — a case this branch's earlier
  // `parsedValue?.kind === 'literal'` gate missed entirely and
  // would have silently reintroduced the same omitted-field bug
  // for a negative numeric literal).
  if (parsedValue) {
    const goVal = parsedLiteralToGo(site.host.ctx, parsedValue)
    if (goVal !== null) {
      site.emit(prop.name, goVal)
      return true
    }
  }
  return lowerResolvedChildProp(site, prop, exprText, parsedValue)
}

/**
 * A ternary whose falsy branch is `undefined`/`null`
 * (`tag={shown() ? tag() : undefined}`, #3060) has no arm in
 * `templatePartsToGoCode` (it explicitly opts a `ternary` part
 * out — see that function's docstring — reserving the shape for
 * the element-attribute `{{if}}` path) NOR in
 * `resolveDynamicPropValue` (which only matches a bare
 * getter call/comparison/passthrough, never a conditional). Both
 * silently fell through to no field at all in the generated
 * `<Child>Input{...}` literal, so the child's rest-bag/named-prop
 * lookup saw no value on EITHER branch. Bake it as a Go
 * `interface{}`-valued IIFE evaluated at constructor time — the
 * same "what does this signal/prop expression evaluate to right
 * now" question `resolveDynamicPropValue`/`resolveLocalGetterAsGo`
 * already answer for a bare operand, just wrapped in the ternary's
 * own test.
 *
 * Scoped to a REST-BAG destination on purpose (`routesToRestBag`, checked by
 * the caller): that field is always `map[string]any`-typed (`interface{}`
 * values), so a `nil` alternate is always valid there. A NAMED
 * field is concrete-typed (`string`, `int`, …) — a bare `interface{}`
 * IIFE result fails to compile against it ("need type assertion",
 * caught by `destructured-props-live`'s `label?: string` ternary
 * prop, a pre-existing passing shape this must not regress). A
 * named field's own conditional lowering is out of scope here;
 * it keeps falling through to the unchanged paths after this one.
 *
 * Null when the ternary is not that shape or an operand doesn't resolve.
 */
function restBagTernaryValue(
  site: ChildCallSite,
  parsedValue: Extract<ParsedExpr, { kind: 'conditional' }>,
): string | null {
  if (!isUndefinedOperand(parsedValue.alternate) || isUndefinedOperand(parsedValue.consequent)) return null
  const { signals, memos, propsParams } = site.ir.metadata
  const testGo = resolveTernaryOperandAsGo(site.host, parsedValue.test, signals, memos, propsParams, site.propFallbackVars)
  const consequentGo = resolveTernaryOperandAsGo(site.host, parsedValue.consequent, signals, memos, propsParams, site.propFallbackVars)
  if (testGo === null || consequentGo === null) return null
  // Go's `if` takes a `bool` and has no truthiness: a test that
  // resolves to anything but a bool literal (a string/number signal
  // seed, `tag={label() ? x : undefined}` over
  // `createSignal('x')` → `"x"`; a prop field of another
  // type) would embed `if "x" {` and fail to compile. Mirror
  // `lowerTernaryTest` (`expr/url-builder.ts`): a resolved
  // bool literal passes through, everything else goes through
  // `bf.Truthy` — JS `Boolean(x)` over string / number / bool
  // / nil, the same coercion the spread-bag conditionals use.
  const condGo = testGo === 'true' || testGo === 'false' ? testGo : `bf.Truthy(${testGo})`
  return `func() interface{} { if ${condGo} { return ${consequentGo} }; return nil }()`
}

/** `undefined` / `null`, as an identifier or a literal. */
function isUndefinedOperand(e: ParsedExpr): boolean {
  return (e.kind === 'identifier' && (e.name === 'undefined' || e.name === 'null')) ||
    (e.kind === 'literal' && (e.value === null || e.value === undefined))
}

/**
 * Resolve ONE structural operand of a ternary destined for a child prop
 * (#3060's {@link restBagTernaryValue}) to its Go constructor-time
 * value: a zero-arg getter call (`shown()`, `tag()`) and a bare identifier
 * (a local getter, or a passthrough prop reference) both go through
 * `resolveDynamicPropValue` — the ONE place that already answers "what does
 * this expression evaluate to at constructor time" for a bare child-prop
 * value, including its local-shadow guard (a `const label = …` shadowing a
 * `label` prop must NOT resolve to `in.Label`; #2198's hazard). A literal
 * goes through `parsedLiteralToGo`. Returns null for any other operand
 * shape (member expression, nested call, binary/logical) — the caller falls
 * through to leaving the field unbaked (the pre-existing behavior for a
 * ternary this narrow arm doesn't cover) rather than guessing.
 */
function resolveTernaryOperandAsGo(
  host: ChildInputHost,
  node: ParsedExpr,
  signals: GetterSignal[],
  memos: GetterMemo[],
  propsParams: { name: string; sourceName?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  if (node.kind === 'call' && node.callee.kind === 'identifier' && node.args.length === 0) {
    return host.resolveDynamicPropValue(`${node.callee.name}()`, signals, memos, propsParams, propFallbackVars)
  }
  if (node.kind === 'identifier') {
    return host.resolveDynamicPropValue(node.name, signals, memos, propsParams, propFallbackVars)
  }
  if (node.kind === 'literal') {
    return parsedLiteralToGo(host.ctx, node)
  }
  return null
}

/**
 * The last resolution steps of an expression prop: the bare-value
 * resolution (`resolveDynamicPropValue`), then the runtime evaluator, then a
 * loud refusal of a negated value neither lowers. False when nothing applies.
 */
function lowerResolvedChildProp(
  site: ChildCallSite,
  prop: IRProp,
  exprText: string,
  parsedValue: ParsedExpr | undefined,
): boolean {
  const { host, ir, childShape, child } = site
  const resolvedValue = host.resolveDynamicPropValue(
    exprText,
    ir.metadata.signals,
    ir.metadata.memos,
    ir.metadata.propsParams,
    site.propFallbackVars,
    childShape?.nillableParamNames.has(prop.name) ?? false,
  )
  // Any other value inside the evaluator's surface (`u().name!`, a
  // member read off an object signal, #3437) is computed by
  // `bf.EvalExpr` over the seeds it reads and converted to the
  // child's Input field type.
  const evaluatedValue = resolvedValue === null && parsedValue
    ? evaluateChildPropValue(host.ctx, parsedValue, prop.name, childShape, ir, site.propFallbackVars)
    : null
  if (resolvedValue !== null) {
    site.emit(prop.name, childShape?.nillableParamNames.has(prop.name)
      ? resolvedValue
      : unboxNillablePropRef(host.ctx, resolvedValue, ir.metadata.propsParams, childShape?.paramGoTypes.get(prop.name)))
    return true
  }
  if (evaluatedValue !== null) {
    site.emit(prop.name, evaluatedValue)
    return true
  }
  if (parsedValue?.kind !== 'unary' || parsedValue.op !== '!') return false
  // #3174: a negated prop whose operand `resolveDynamicPropValue`'s
  // recursion still can't lower (e.g. a multi-arg call, a deep
  // member chain, `!(a && b)`) — refuse loudly instead of
  // silently omitting the field, which left the child's own
  // zero value (`false`) masquerading as a real answer at every
  // call site with no diagnostic.
  host.ctx.state.errors.push({
    code: 'BF101',
    severity: 'error',
    message: `Prop '${prop.name}' on <${child.name}> is a negated expression ('${exprText}') the Go template adapter can't lower to SSR output`,
    loc: prop.loc,
    suggestion: {
      message: `Wrap <${child.name}> in /* @client */ so it renders on the client instead, or compute '${prop.name}' in the parent as its own signal/memo and pass that in as a plain prop.`,
      escape: [{ kind: 'client-directive' }],
    },
  })
  return true
}

/**
 * A `jsx-children` prop value. The RESERVED children slot (`comp.children.length > 0 ? comp.children
 * : resolveJsxChildrenProp(...)`) is handled by the caller via
 * `child.childrenText` / `child.childrenHtml` and must not be
 * re-emitted here. A JSX-valued prop under any OTHER name
 * (`header={<strong>Title</strong>}`, #2168 jsx-element-prop) is a
 * named slot — bake it the same way real children are baked
 * (`extractTextChildren` / `extractHtmlChildren`) and emit it as
 * its own struct field, mirroring the caller's `Children` field
 * text-vs-HTML branching.
 */
function lowerJsxChildProp(site: ChildCallSite, prop: IRProp, children: IRNode[]): void {
  if (prop.name === 'children') return
  const { host } = site
  const text = host.extractTextChildren(children)
  if (text !== null) {
    site.emit(prop.name, JSON.stringify(text))
    return
  }
  const html = host.extractHtmlChildren(children)
  if (html !== null) {
    host.ctx.state.usesHtmlTemplate = true
    site.emit(prop.name, `template.HTML(${JSON.stringify(html)})`)
    return
  }
  // The value's root needs the PARENT's runtime scope id
  // (`<strong>` hoisted from the call site inherits the
  // caller's `bf-s`, not a bake-time constant) — same
  // needsScope case `childrenScopedHtmlExpr` handles for
  // the reserved children slot. The returned string is
  // already a Go concatenation expression (`"..." +
  // scopeID + "..."`), not a literal to re-quote.
  const scopedHtml = host.extractScopedHtmlChildren(children)
  if (scopedHtml !== null) {
    host.ctx.state.usesHtmlTemplate = true
    site.emit(prop.name, `template.HTML(${scopedHtml})`)
  }
  // Else: none of the three bake attempts produced a static
  // Go string — the value contains a template action that
  // survived (#2746) or is otherwise genuinely dynamic
  // (#2703). No field is emitted here; `queueDynamicPropDefine`
  // (called from `renderComponent`'s static-call-site branch)
  // detects the SAME unbakeable shape and delivers it at
  // template-execution time via `bf_with_props` + `bf_tmpl`,
  // mirroring how the reserved `children` field's null case
  // just above is filled in by `bf_with_children`. A
  // component nested in a loop-row child's forwarded children
  // renders through that same static call-site branch inside
  // its companion define, so it is covered too; the loop-body
  // component itself (the wrapper-slice call) has no dynamic
  // named-prop delivery yet.
}

/**
 * A child call's props once the shared plan has resolved its `{...props}`
 * spread one key at a time (`resolvePropsSpreadCall`, #3530):
 *
 * - `props`: the props still lowered as written — the spread itself, and
 *   every prop a later writer of its key replaces, dropped;
 * - `paramFields`: an `in.<Field>` value for each param the spread carries
 *   unconditionally and the child takes — a declared param, or any key
 *   when the child has a rest bag (`emitChildField` routes it there);
 * - `passedOr`: wraps the value a key would otherwise take in a nil test of
 *   the param the spread carries only when the caller passed it.
 *
 * A call without the spread passes through unchanged.
 */
function planChildCallProps(
  ctx: GoEmitContext,
  child: { name: string; props: readonly IRProp[] },
  ir: ComponentIR,
  childShape: ChildComponentShape | undefined,
): {
  props: readonly IRProp[]
  paramFields: Array<{ name: string; goValue: string }>
  passedOr: (name: string, value: string) => string
} {
  const call = resolvePropsSpreadCall(ctx, ir, child.props)
  if (call === null) return { props: child.props, paramFields: [], passedOr: (_name, value) => value }
  const spread = child.props.find(p => isPropsObjectSpread(p, ctx.state.propsObjectName))!
  const props = child.props.filter(p => p !== spread)
  if (call.kind === 'unresolved') {
    refusePropsSpreadMerge(ctx, child.name, spread, 'the call also spreads an object whose keys are only known at render time')
    return { props, paramFields: [], passedOr: (_name, value) => value }
  }
  const propsParams = ir.metadata.propsParams
  const paramFields: Array<{ name: string; goValue: string }> = []
  for (const resolved of call.keys.values()) {
    const param = resolved.base?.kind === 'props-param' ? propsParams.find(p => p.name === resolved.key) : undefined
    if (!param) continue
    // A key the child neither declares nor collects in a rest bag has no
    // field on its Input: JS hands it over, but the child never reads it.
    if (childShape && !childShape.restBagField && !childShape.paramNames.has(param.name)) continue
    const ref = `in.${capitalizeFieldName(param.sourceName ?? param.name)}`
    const keepsNil = routesToRestBag(childShape, param.name) || childShape?.nillableParamNames.has(param.name)
    paramFields.push({
      name: param.name,
      goValue: keepsNil ? ref : unboxNillablePropRef(ctx, ref, propsParams, childShape?.paramGoTypes.get(param.name)),
    })
  }
  return {
    props: props.filter(p => isFinalPropWriter(p, call.keys)),
    paramFields,
    passedOr: (name, value) => {
      const resolved = call.keys.get(name)
      if (!resolved || resolved.presentParams.length === 0) return value
      return passedPropsParamOr(ctx, resolved.key, value, { childName: child.name, spread, childShape, ir })
    },
  }
}

/**
 * `value` for a key a `{...props}` spread carries only when the caller
 * passed the param of the same name: the param's own Input field when it is
 * not nil, `value` otherwise. The field is nillable by construction
 * (`propsSpreadForwardedPropNames`); a param whose field is not, or a child
 * field this can't type, is refused rather than overridden unconditionally.
 */
function passedPropsParamOr(
  ctx: GoEmitContext,
  name: string,
  value: string,
  site: { childName: string; spread: IRProp; childShape: ChildComponentShape | undefined; ir: ComponentIR },
): string {
  const { childShape } = site
  const param = site.ir.metadata.propsParams.find(p => p.name === name)
  const ref = param ? `in.${capitalizeFieldName(param.sourceName ?? param.name)}` : ''
  const destType = routesToRestBag(childShape, name) || childShape?.nillableParamNames.has(name)
    ? 'interface{}'
    : childShape?.paramGoTypes.get(name)
  const passed = destType === 'interface{}' ? ref : destType ? unboxToGoScalar(ref, destType) : null
  if (!param || !ctx.state.nillablePropNames.has(param.name) || passed === null) {
    refusePropsSpreadMerge(
      ctx,
      site.childName,
      site.spread,
      `the Go template adapter can't tell an omitted '${name}' from a passed one here, so it can't keep the value an earlier prop gives it`,
    )
    return value
  }
  return `func() ${destType} { if ${ref} != nil { return ${passed} }; return ${value} }()`
}

/** BF101 for a `{...props}` spread onto a child the Go constructor can't merge soundly (#3530). */
function refusePropsSpreadMerge(ctx: GoEmitContext, childName: string, spread: IRProp, reason: string): void {
  ctx.state.errors.push({
    code: 'BF101',
    severity: 'error',
    message: `'{...${ctx.state.propsObjectName}}' on <${childName}> can't be merged with the other props of the call: ${reason}`,
    loc: spread.loc,
    suggestion: {
      message: `Pass the props to <${childName}> one by one, or wrap <${childName}> in /* @client */ so it renders on the client instead.`,
      escape: [{ kind: 'client-directive' }],
    },
  })
}

/**
 * A non-loop child call's `key` (`<Badge key="k" />`): the reference renders
 * it as the child root's `data-key`, never as a prop, so it is not a field of
 * `<Child>Input` (`lowerChildInputFields` is handed the call without it). The
 * Go value is stamped on the built child's `BfDataKey`, which the child's root
 * already relays (`{{if .BfDataKey}} data-key=…{{end}}`). Lowered by the same
 * per-prop steps as any other prop; null when there is no key, when it reads
 * a loop row (no constructor-time value), or when it does not lower.
 */
export function lowerStaticChildDataKey(
  host: ChildInputHost,
  child: { name: string; props: readonly IRProp[]; rowScope?: BindingScope },
  ir: ComponentIR,
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  const keyProp = child.props.find(p => p.name === 'key')
  if (!keyProp) return null
  if (child.rowScope && propReadsRow(keyProp, child.rowScope)) return null
  let goValue: string | null = null
  const site: ChildCallSite = {
    host,
    child,
    ir,
    propFallbackVars,
    childShape: undefined,
    emit: (_jsxName, writtenValue) => { goValue = writtenValue },
  }
  lowerChildProp(site, keyProp)
  return goValue === null ? null : `bf.String(${goValue})`
}

/**
 * Does `prop`'s value read a name `rowScope` binds? Reads the IR-computed
 * `IRProp.freeIdentifiers` when it is a live `Set` — it does not survive the
 * debug IR's JSON round trip, which `generateTypes` can be handed — and
 * otherwise walks the parsed value (`freeIdentifiers`). False when neither
 * can answer: the prop then goes through the ordinary lowering, which
 * refuses it loudly at a loop-row site if it can't be lowered.
 */
function propReadsRow(prop: IRProp, rowScope: BindingScope): boolean {
  const irFree = prop.freeIdentifiers
  const free: Iterable<string> | null =
    irFree instanceof Set
      ? irFree
      : (prop.value.kind === 'expression' || prop.value.kind === 'spread') && prop.value.parsed
        ? freeIdentifiers(prop.value.parsed)
        : null
  if (free === null) return false
  for (const name of free) {
    if (rowScope.isBound(name)) return true
  }
  return false
}

/**
 * `lowerChildInputFields` for a child built once per loop in the parent's
 * constructor and shared by every row (the loop-body component of a
 * wrapper-slice loop, and each component nested in its forwarded
 * children). Row-dependent props are skipped (delivered per row); `key` is
 * the row's reconciliation key, not a prop. Every other prop goes through
 * the same lowering as a non-loop call site — a `/* @client *\/` prop
 * included, which the reference still renders at SSR
 * (`loop-row-child-children-nested-client-prop`). A prop the constructor
 * can't lower is refused with BF101 rather than left at the child's zero
 * value — but only when it is SSR data with somewhere to go
 * (`isUndeliveredSsrData`).
 */
export function lowerLoopRowChildInputFields(
  host: ChildInputHost,
  child: { name: string; props: readonly IRProp[] },
  ir: ComponentIR,
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  rowScope: BindingScope,
): ChildInputField[] {
  const props = child.props.filter(p => p.name !== 'key')
  const { fields, unlowered } = lowerChildInputFields(
    host,
    { name: child.name, props },
    ir,
    propFallbackVars,
    rowScope,
  )
  for (const prop of unlowered) {
    if (!isUndeliveredSsrData(host, prop, child.name, ir)) continue
    host.ctx.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Prop '${prop.name}' on <${child.name}> inside a loop row can't be lowered to an SSR value by the Go template adapter`,
      loc: prop.loc,
      suggestion: {
        message: `Mark the prop /* @client */ so it is applied on the client instead, or compute '${prop.name}' in the parent as its own signal/memo and pass that in.`,
        escape: [{ kind: 'client-directive' }],
      },
    })
  }
  return fields
}

/**
 * Whether an unlowered loop-row child prop is SSR data the child should
 * have received — the only props the loop-row refusal covers. Everything
 * else is left out of the constructor silently, exactly as a non-loop
 * call site leaves every unlowered prop (`emitStaticChildInstances`):
 *
 * - a `/* @client *\/` prop: the documented escape — applied on the
 *   client when SSR can't lower it (it is lowered like any prop when it can);
 * - `children`: the reserved slot, delivered by `bf_with_children` (the
 *   forwarded children define), never by the constructor;
 * - `ref`: a compile-time binding to the child's root element, applied on
 *   the client (`child-component-ref-prop`);
 * - an event handler (`isEventHandlerName`) or any other function-valued
 *   prop (a setter, a callback): behavior, which SSR never invokes;
 * - a hyphenated name with no rest bag to route into: no Go field can hold
 *   it (`emitChildField` drops it even when its value lowers);
 * - an imported binding (`isImportedBindingValue`) passed to a param that
 *   could hold a function: its value lives in another module, the IR
 *   records no type for an import, and the adapter has no type checker,
 *   so nothing here says whether it is a function or data. Refused only
 *   when the child's declared type for the param can't hold a function
 *   (`dataTypedParamNames`).
 */
function isUndeliveredSsrData(host: ChildInputHost, prop: IRProp, childName: string, ir: ComponentIR): boolean {
  if (prop.clientOnly) return false
  if (prop.name === 'children' || prop.name === 'ref') return false
  if (isEventHandlerName(prop.name)) return false
  const shape = host.childShape(childName)
  if (prop.name.includes('-') && !routesToRestBag(shape, prop.name)) return false
  if (isFunctionValuedProp(host.ctx, prop, ir)) return false
  if (isImportedBindingValue(host.ctx, prop, ir)) return shape?.dataTypedParamNames.has(prop.name) ?? false
  return true
}

/**
 * Whether a prop's value is an imported binding — a value-imported name
 * (named, aliased, or default) or a member read off one (`utils.formatTone`
 * off a namespace import), per `ir.metadata.imports`. A component-local
 * binding of the same name shadows the import and is not one.
 */
function isImportedBindingValue(ctx: GoEmitContext, prop: IRProp, ir: ComponentIR): boolean {
  if (prop.value.kind !== 'expression') return false
  let root = prop.value.parsed
  while (root?.kind === 'member') root = root.object
  if (root?.kind !== 'identifier') return false
  const name = root.name
  const { signals, memos, localFunctions, propsParams } = ir.metadata
  if (
    signals.some(s => s.getter === name || s.setter === name) ||
    memos.some(m => m.name === name) ||
    localFunctions.some(f => f.name === name) ||
    propsParams.some(p => p.name === name) ||
    findValuedLocalConst(ctx.state, name)
  ) {
    return false
  }
  return ir.metadata.imports.some(imp =>
    !imp.isTypeOnly && imp.specifiers.some(spec => !spec.isTypeOnly && (spec.alias ?? spec.name) === name),
  )
}

/**
 * Whether a prop's value is a function — an inline arrow / function
 * expression, or a name this component binds to one (a signal setter, a
 * local function declaration, a const initialized with a function).
 */
function isFunctionValuedProp(ctx: GoEmitContext, prop: IRProp, ir: ComponentIR): boolean {
  if (prop.value.kind !== 'expression') return false
  const parsed = prop.value.parsed
  if (parsed?.kind === 'arrow') return true
  if (parsed?.kind === 'identifier') {
    const name = parsed.name
    const { signals, localFunctions } = ir.metadata
    if (signals.some(s => s.setter === name)) return true
    if (localFunctions.some(f => f.name === name)) return true
    // The shared const lookups, not a new linear scan
    // (`binding-scope-ratchet.test.ts`'s shrink-only ledger).
    const constant = findValuedLocalConst(ctx.state, name) ?? findModuleScopeConst(ctx.state, name)
    if (!constant?.value) return false
    return constant.parsed?.kind === 'arrow' || isFunctionShapedExpression(constant.value)
  }
  return isFunctionShapedExpression(prop.value.expr)
}

/**
 * The `<Child>Input` fields of a bodyless prop-array loop's row
 * (`propArrayLoopRowSource`), each evaluated against the source row
 * `item`: a prop reading the row lowers to its row accessor
 * (`label={item.label}` → `Label: item.Label`, a scalar row's `label={i}`
 * → `Label: item`); any other prop goes through the same constructor-time
 * lowering as a non-loop call site (`lowerChildInputFields`). `key` is the
 * row's reconciliation key, not a prop. Null — and nothing recorded —
 * when an SSR prop (`isUndeliveredSsrData`) can't be lowered that way;
 * the loop then keeps its caller-supplied `in.<Child>s` rows.
 *
 * `emit` false is the decision-only probe: diagnostics and import flags
 * the lowering raises are rolled back. `readsRow` marks the fields read
 * off the row, so the caller knows whether to bind `item`.
 */
export function sourceRowChildInputFields(
  host: ChildInputHost,
  ir: ComponentIR,
  nested: NestedComponentInfo,
  shape: LoopRowShape,
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  emit: boolean,
): Array<{ goField: string; goValue: string; readsRow?: true }> | null {
  const rowFields = sourceRowReadFields(host, ir, nested, shape)
  if (rowFields === null) return null
  const state = host.ctx.state
  const rowIndependent = nested.rowProps.filter(prop => prop.name !== 'key' && !propReadsRow(prop, nested.rowScope))
  const errorCount = state.errors.length
  const { usesFmt, usesHtmlTemplate } = state
  const { fields, unlowered } = lowerChildInputFields(
    host,
    { name: nested.name, props: rowIndependent },
    ir,
    propFallbackVars,
  )
  const declined =
    state.errors.length > errorCount || unlowered.some(p => isUndeliveredSsrData(host, p, nested.name, ir))
  if (declined || !emit) {
    state.errors.length = errorCount
    state.usesFmt = usesFmt
    state.usesHtmlTemplate = usesHtmlTemplate
  }
  return declined ? null : [...rowFields, ...fields]
}

/**
 * The row-reading half of {@link sourceRowChildInputFields}: each prop
 * reading the row, lowered to its row accessor. Null when an SSR prop reading
 * the row can't be read off it that way.
 */
function sourceRowReadFields(
  host: ChildInputHost,
  ir: ComponentIR,
  nested: NestedComponentInfo,
  shape: LoopRowShape,
): Array<{ goField: string; goValue: string; readsRow: true }> | null {
  const row: LoopRowBinding = { param: nested.loopParam, paramBindings: nested.loopParamBindings }
  const childShape = host.childShape(nested.name)
  const rowFields: Array<{ goField: string; goValue: string; readsRow: true }> = []
  for (const prop of nested.rowProps) {
    if (prop.name === 'key') continue
    const ssrData = isUndeliveredSsrData(host, prop, nested.name, ir)
    if (!propReadsRow(prop, nested.rowScope)) continue
    const parsed = prop.value.kind === 'expression' ? prop.value.parsed : undefined
    const accessor = parsed ? rowReadGoAccessor(parsed, row, shape) : null
    if (accessor === null || prop.name.includes('-') || routesToRestBag(childShape, prop.name)) {
      if (ssrData) return null
      continue
    }
    // The row's Go value must be assignable to the child's Input field as
    // is: a struct row (`value={item}`) or an object field
    // (`meta={item.meta}`) is the PARENT's generated struct, never the
    // child's (`ListItemsItem` vs `BadgeValue`), and a scalar read can
    // still differ (`int` row field, `float64` `.toFixed()` prop). Anything
    // else keeps the caller-supplied rows.
    if (!rowReadAssignsToChildField(parsed!, row, shape, childShape, prop.name)) return null
    rowFields.push({ goField: capitalizeFieldName(prop.name), goValue: rowReadGoValue(accessor, shape), readsRow: true })
  }
  return rowFields
}

/**
 * Whether the row read `expr` (already accepted by `rowReadGoAccessor`)
 * can be assigned to the child's `jsxName` Input field without
 * conversion: a scalar read whose Go type is the field's own. Unknown on
 * either side answers false — including an `interface{}` answer, which is
 * what an object-shaped param resolves to before the child synthesizes
 * its own struct for it (`BadgeValue`).
 */
function rowReadAssignsToChildField(
  expr: ParsedExpr,
  row: LoopRowBinding,
  shape: LoopRowShape,
  childShape: ChildComponentShape | undefined,
  jsxName: string,
): boolean {
  const path = rowItemPath(expr, row)
  const readGoType = path && shape.readGoType ? shape.readGoType(path) : null
  const fieldGoType = childShape?.paramGoTypes.get(jsxName)
  if (!readGoType || !fieldGoType) return false
  return SCALAR_ROW_GO_TYPES.has(readGoType) && readGoType === fieldGoType
}
