/**
 * Reactive attribute, text, and prop update emission.
 * Handles createEffect blocks for DOM attribute syncing, dynamic text nodes,
 * client-only expressions, and reactive component prop bindings.
 */

import ts from 'typescript'
import type { AttrMeta, IRMetadata } from '../types.ts'
import { isBooleanAttr } from '../html-constants.ts'
import type { ClientJsContext } from './types.ts'
import { toHtmlAttrName, varSlotId, PROPS_PARAM } from './utils.ts'
import { createTemplateAwareStringProtector } from './html-template.ts'
import { datePlugin, DATE_METHODS } from '../date-lowering.ts'
import { toLocaleDatePlugin, patternArgToClientJs } from '../to-locale-date-lowering.ts'
import { tsNodeToParsedExpr } from '../expression-parser.ts'
import type { LoweringMatcher } from '../lowering-registry.ts'

/**
 * Profile mode (#1690, SR3/SR4): the id appended to a DOM-binding effect so the
 * profiler attributes its re-runs to a source location. Keyed by `slotId` (the
 * `bf="sN"` marker) — `buildIdIndex` resolves `<Component>#binding:<slotId>`
 * from `graph.domBindings`, which carry the same slot + loc. Empty when
 * profiling is off, so the emitted effect is byte-for-byte unchanged (SR8).
 */
function bindingIdArg(ctx: ClientJsContext, slotId: string | undefined): string {
  if (!ctx.profile || !slotId) return ''
  return `, ${JSON.stringify(`${ctx.componentName}#binding:${slotId}`)}`
}

/**
 * Generate JS statements to update a DOM attribute reactively.
 * Centralizes the attribute-type dispatch (value, class, boolean, presence, generic)
 * so that new AttrMeta flags are handled in one place.
 */
export function emitAttrUpdate(target: string, attrName: string, expression: string, meta: AttrMeta): string[] {
  const htmlName = toHtmlAttrName(attrName)
  if (attrName === 'dangerouslySetInnerHTML' || htmlName === 'dangerouslySetInnerHTML') {
    // `{ __html }` is not an attribute — it replaces the element's content.
    // Assign `innerHTML` (raw, intentional escape hatch) to mirror the SSR
    // adapters' native `dangerouslySetInnerHTML` handling instead of
    // stringifying the object into a bogus attribute.
    return [
      `{ const __v = ${expression}; ${target}.innerHTML = __v != null && __v.__html != null ? String(__v.__html) : '' }`,
    ]
  }
  if (htmlName === 'style') {
    return [
      `{ const __v = styleToCss(${expression}); if (__v != null) ${target}.setAttribute('style', __v); else ${target}.removeAttribute('style') }`,
    ]
  }
  if (htmlName === 'class') {
    return [
      `{ const __v = ${expression}; if (__v != null) ${target}.setAttribute('class', String(__v)); else ${target}.removeAttribute('class') }`,
    ]
  }
  if (htmlName === 'value') {
    return [
      `const __val = String(${expression})`,
      `if (${target}.value !== __val) ${target}.value = __val`,
    ]
  }
  if (isBooleanAttr(htmlName)) {
    return [`${target}.${htmlName} = !!(${expression})`]
  }
  if (meta.presenceOrUndefined) {
    // aria-* requires explicit "true" value per WAI-ARIA spec
    const attrVal = htmlName.startsWith('aria-') ? 'true' : ''
    return [
      `if (${expression}) ${target}.setAttribute('${htmlName}', '${attrVal}')`,
      `else ${target}.removeAttribute('${htmlName}')`,
    ]
  }
  return [
    `{ const __v = ${expression}; if (__v != null) ${target}.setAttribute('${htmlName}', String(__v)); else ${target}.removeAttribute('${htmlName}') }`,
  ]
}

/**
 * Rewrite destructured prop names in an expression to `(props.xxx ?? default)`.
 * Only applies when the component uses destructured props (not props.xxx style).
 */
export function rewriteDestructuredPropsInExpr(expr: string, ctx: ClientJsContext): string {
  if (ctx.propsObjectName) return expr

  const { protect, restore } = createTemplateAwareStringProtector()
  let result = protect(expr)

  for (const prop of ctx.propsParams) {
    if (prop.name === 'children') continue
    const pattern = new RegExp(`(?<![-.])\\b${prop.name}\\b`, 'g')
    if (!pattern.test(result)) continue

    const defaultVal = prop.defaultValue
    const replacement = defaultVal
      ? `(${PROPS_PARAM}.${prop.name} ?? ${prop.defaultContainsArrow ? `(${defaultVal})` : defaultVal})`
      : `${PROPS_PARAM}.${prop.name}`
    result = result.replace(new RegExp(`(?<![-.])\\b${prop.name}\\b`, 'g'), replacement)
  }

  return restore(result)
}

/**
 * Bind `datePlugin`'s matcher (#2292) for this component's reactive-text
 * emission. Reads the same four `EvidenceMetadata` fields
 * (`rich-type-evidence.ts`) `jsx-to-ir.ts`'s `getDateLoweringMatcher` reads
 * off the analyzer for the STATIC template path, so a prop-method call
 * re-evaluated inside a `createEffect` lowers to the `date` helper under
 * the exact same evidence the static template and every SSR adapter use.
 * `ctx.propsType` is optional on `ClientJsContext` (threaded through only
 * for this purpose, `index.ts`'s `createContext`); a context predating
 * #2292 — or a hand-built test fixture — simply carries no Date evidence,
 * so this returns null and callers emit the expression unchanged.
 */
function getReactiveDateLoweringMatcher(ctx: ClientJsContext): LoweringMatcher | null {
  if (!ctx.propsType) return null
  const metadataSlice: Pick<IRMetadata, 'propsType' | 'propsObjectName' | 'propsParams' | 'typeDefinitions'> = {
    propsType: ctx.propsType,
    propsObjectName: ctx.propsObjectName,
    propsParams: ctx.propsParams,
    typeDefinitions: ctx.typeDefinitions ?? [],
  }
  return datePlugin.prepare(metadataSlice as unknown as IRMetadata)
}

/** `getReactiveDateLoweringMatcher`'s twin for `toLocaleDatePlugin` (#2324 slice 2). */
function getReactiveToLocaleMatcher(ctx: ClientJsContext): LoweringMatcher | null {
  if (!ctx.propsType) return null
  const metadataSlice: Pick<IRMetadata, 'propsType' | 'propsObjectName' | 'propsParams' | 'typeDefinitions'> = {
    propsType: ctx.propsType,
    propsObjectName: ctx.propsObjectName,
    propsParams: ctx.propsParams,
    typeDefinitions: ctx.typeDefinitions ?? [],
  }
  return toLocaleDatePlugin.prepare(metadataSlice as unknown as IRMetadata)
}

/**
 * Reactive-path counterpart to `jsx-to-ir.ts`'s `lowerToLocaleDateCalls`
 * (#2324 slice 2): rewrite a literal-locale `toLocaleDateString` call the
 * SAME `toLocaleDatePlugin` matcher claims to `formatDate(recv, pattern,
 * tz)` with the build-time-frozen pattern, for the same two reasons as the
 * `date` rewrite above — the hydrated prop is an ISO STRING (a raw
 * `.toLocaleDateString()` on it throws), and the client must render the
 * frozen pattern, not the browser's own ICU output.
 */
function lowerToLocaleCallsInReactiveExpr(expr: string, matcher: LoweringMatcher | null): string {
  if (!matcher) return expr
  let sourceFile: ts.SourceFile
  try {
    sourceFile = ts.createSourceFile('__reactive_expr__.ts', `(${expr});`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  } catch {
    return expr
  }
  const stmt = sourceFile.statements[0]
  if (!stmt || !ts.isExpressionStatement(stmt)) return expr
  const root = ts.isParenthesizedExpression(stmt.expression) ? stmt.expression.expression : stmt.expression

  const candidates: ts.CallExpression[] = []
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      n.arguments.length === 2 &&
      ts.isPropertyAccessExpression(n.expression) &&
      !n.expression.questionDotToken &&
      n.expression.name.text === 'toLocaleDateString'
    ) {
      candidates.push(n)
    }
    ts.forEachChild(n, visit)
  }
  visit(root)
  if (candidates.length === 0) return expr

  const { protect, restore, replaceProtectedCall } = createTemplateAwareStringProtector()
  let result = protect(expr)
  for (const call of candidates) {
    const propAccess = call.expression as ts.PropertyAccessExpression
    const node = matcher(
      tsNodeToParsedExpr(propAccess),
      call.arguments.map((a) => tsNodeToParsedExpr(a)),
    )
    if (!node || node.kind !== 'helper-call' || node.helper !== 'format_date') continue
    const [, patternArg, tzArg, namesArg] = node.args
    if (!patternArg || tzArg?.kind !== 'literal') continue
    const localeText = call.arguments[0].getText(sourceFile)
    const patternJs = patternArgToClientJs(patternArg, localeText)
    if (patternJs === null) continue
    // The names table (#2334) — omitted when empty, same as the static path.
    let namesJs: string | null = null
    if (namesArg && !(namesArg.kind === 'array-literal' && namesArg.elements.length === 0)) {
      namesJs = patternArgToClientJs(namesArg, localeText)
      if (namesJs === null) continue
    }
    const receiverText = propAccess.expression.getText(sourceFile)
    const matchText = call.getText(sourceFile)
    // The call text contains string literals (placeholders in the protected
    // haystack) — go through the protector's stash-verified matcher, same
    // as the static-path rewrite in jsx-to-ir.ts.
    result = replaceProtectedCall(
      result,
      matchText,
      () =>
        `formatDate(${receiverText}, ${patternJs}, ${JSON.stringify(tzArg.value)}${namesJs !== null ? `, ${namesJs}` : ''})`,
    )
  }
  return restore(result)
}

/**
 * Reactive-path counterpart to `jsx-to-ir.ts`'s `lowerDateCalls` (#2292):
 * without this, a Date-typed prop's catalogued accessor call re-evaluated
 * inside `createEffect` (the Solid-style wrap-by-default fallback for any
 * expression containing a function call, #937) still called the RAW
 * `.toISOString()` / etc. on the hydrated STRING prop value and threw —
 * the static template alone wasn't enough to fix hydration.
 *
 * `expr` here (`IRExpression.expr`, threaded through
 * `ctx.dynamicElements`) is ALREADY the bare-identifier source form the
 * SAME `createEffect` body closes over via the destructured-prop shim
 * (`const createdAt = _p.createdAt ?? {}` at the top of `init()`) — so
 * unlike the static-template path, the receiver does NOT need a `_p.`
 * prefix: swapping the raw call for `date(<receiver>, "<op>")` is enough.
 *
 * No live `ts.Node` survives into this phase (`expr` is a plain string),
 * so this re-parses it fresh via `ts.createSourceFile` — the same
 * technique `expression-parser.ts`'s `parseExpression` uses — rather than
 * a regex scan (per CLAUDE.md's structural-parsing rule): every candidate
 * span comes from walking the freshly-parsed AST, and `matcher(...)` is
 * the SAME `datePlugin` matcher the static path and every SSR adapter
 * bind, so a call lowers here iff it would lower there too.
 */
function lowerDateCallsInReactiveExpr(expr: string, matcher: LoweringMatcher | null): string {
  if (!matcher) return expr
  let sourceFile: ts.SourceFile
  try {
    sourceFile = ts.createSourceFile('__reactive_expr__.ts', `(${expr});`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  } catch {
    return expr
  }
  const stmt = sourceFile.statements[0]
  if (!stmt || !ts.isExpressionStatement(stmt)) return expr
  const root = ts.isParenthesizedExpression(stmt.expression) ? stmt.expression.expression : stmt.expression

  const candidates: ts.CallExpression[] = []
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      n.arguments.length === 0 &&
      ts.isPropertyAccessExpression(n.expression) &&
      !n.expression.questionDotToken &&
      DATE_METHODS.has(n.expression.name.text)
    ) {
      candidates.push(n)
    }
    ts.forEachChild(n, visit)
  }
  visit(root)
  if (candidates.length === 0) return expr

  // Template-aware: protect quoted strings AND template-literal static
  // segments (leaving `${…}` interpolations exposed) so the non-global
  // `.replace` can't rewrite a backtick constant that coincidentally
  // matches the call text before the real call site (Copilot review, #2294).
  const { protect, restore } = createTemplateAwareStringProtector()
  let result = protect(expr)
  for (const call of candidates) {
    const propAccess = call.expression as ts.PropertyAccessExpression
    const node = matcher(tsNodeToParsedExpr(propAccess), [])
    if (!node || node.kind !== 'helper-call' || node.helper !== 'date') continue
    const op = propAccess.name.text
    const receiverText = propAccess.expression.getText(sourceFile)
    const matchText = call.getText(sourceFile)
    // Replacer-function form: a `$` sequence in `receiverText` would
    // otherwise be reinterpreted as a `String.replace` pattern token and
    // corrupt the output (repo precedent, #2285).
    result = result.replace(matchText, () => `date(${receiverText}, "${op}")`)
  }
  return restore(result)
}

/** Emit createEffect blocks that update text nodes for reactive expressions. */
export function emitDynamicTextUpdates(lines: string[], ctx: ClientJsContext): void {
  const dateLoweringMatcher = getReactiveDateLoweringMatcher(ctx)
  const toLocaleMatcher = getReactiveToLocaleMatcher(ctx)
  // Group elements by expression to consolidate effects with same dependencies
  const byExpression = new Map<string, typeof ctx.dynamicElements>()
  for (const elem of ctx.dynamicElements) {
    const key = elem.expression
    if (!byExpression.has(key)) {
      byExpression.set(key, [])
    }
    byExpression.get(key)!.push(elem)
  }

  for (const [rawExpr, elems] of byExpression) {
    const expr = lowerToLocaleCallsInReactiveExpr(
      lowerDateCallsInReactiveExpr(rawExpr, dateLoweringMatcher),
      toLocaleMatcher,
    )
    // Separate conditional vs non-conditional elements
    const conditionalElems = elems.filter(e => e.insideConditional)
    const normalElems = elems.filter(e => !e.insideConditional)

    if (normalElems.length > 0 || conditionalElems.length > 0) {
      // Persistent slot trackers for non-conditional elements. `__bfText`
      // returns the node now occupying the slot; a JSX-valued expression
      // (`{themeLogo(id)}`) replaces the text node with a live element, so
      // the next reactive run must operate on that element, not the stale
      // text node (#1663). Primitive values keep the same text node.
      for (const elem of normalElems) {
        const v = varSlotId(elem.slotId)
        lines.push(`  let __anchor_${v} = _${v}`)
      }
      const __textSlot = (normalElems[0] ?? conditionalElems[0])?.slotId
      lines.push(`  createEffect(() => {`)
      if (normalElems.length > 0) {
        // Expression is always evaluated for non-conditional elements
        lines.push(`    const __val = ${expr}`)
        for (const elem of normalElems) {
          const v = varSlotId(elem.slotId)
          lines.push(`    __anchor_${v} = __bfText(__anchor_${v}, __val)`)
        }
        for (const elem of conditionalElems) {
          const v = varSlotId(elem.slotId)
          lines.push(`    const [__el_${v}] = $t(__scope, '${elem.slotId}')`)
          lines.push(`    __bfText(__el_${v}, __val)`)
        }
      } else {
        // Only conditional elements — evaluate expression unconditionally
        // to maintain reactive subscriptions even when the DOM element hasn't
        // been created yet by insert(). Without this, the effect loses all
        // subscriptions when the text node doesn't exist and never re-runs.
        // Use try-catch because the expression may access a property of the
        // conditional guard variable (e.g., prev.title where prev may be
        // undefined when the condition is false).
        lines.push(`    let __val`)
        lines.push(`    try { __val = ${expr} } catch { return }`)
        for (const elem of conditionalElems) {
          const v = varSlotId(elem.slotId)
          lines.push(`    const [__el_${v}] = $t(__scope, '${elem.slotId}')`)
          lines.push(`    __bfText(__el_${v}, __val)`)
        }
      }
      lines.push(`  }${bindingIdArg(ctx, __textSlot)})`)
      lines.push('')
    }
  }
}

/** Emit createEffect blocks for client-only expressions using comment markers. */
export function emitClientOnlyExpressions(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.clientOnlyElements) {
    lines.push(`  // @client: ${elem.slotId}`)
    lines.push(`  createEffect(() => {`)
    lines.push(`    updateClientMarker(__scope, '${elem.slotId}', ${elem.expression})`)
    lines.push(`  }${bindingIdArg(ctx, elem.slotId)})`)
    lines.push('')
  }
}

/** Emit createEffect blocks that sync reactive attribute values (class, value, checked, etc.). */
export function emitReactiveAttributeUpdates(lines: string[], ctx: ClientJsContext): void {
  if (ctx.reactiveAttrs.length > 0) {
    const attrsBySlot = new Map<string, typeof ctx.reactiveAttrs>()
    for (const attr of ctx.reactiveAttrs) {
      if (!attrsBySlot.has(attr.slotId)) {
        attrsBySlot.set(attr.slotId, [])
      }
      attrsBySlot.get(attr.slotId)!.push(attr)
    }

    for (const [slotId, attrs] of attrsBySlot) {
      const v = varSlotId(slotId)
      lines.push(`  createEffect(() => {`)
      lines.push(`    if (_${v}) {`)
      for (const attr of attrs) {
        const expression = rewriteDestructuredPropsInExpr(attr.expression, ctx)
        for (const stmt of emitAttrUpdate(`_${v}`, attr.attrName, expression, attr)) {
          lines.push(`      ${stmt}`)
        }
      }
      lines.push(`    }`)
      lines.push(`  }${bindingIdArg(ctx, slotId)})`)
      lines.push('')
    }
  }
}

/** Emit createEffect to update component element attributes when signal/memo values change. */
export function emitReactivePropBindings(lines: string[], ctx: ClientJsContext): void {
  if (ctx.reactiveProps.length > 0) {
    lines.push('')
    lines.push(`  // Reactive prop bindings`)
    lines.push(`  createEffect(() => {`)

    const propsBySlot = new Map<string, typeof ctx.reactiveProps>()
    for (const prop of ctx.reactiveProps) {
      if (!propsBySlot.has(prop.slotId)) {
        propsBySlot.set(prop.slotId, [])
      }
      propsBySlot.get(prop.slotId)!.push(prop)
    }

    for (const [slotId, props] of propsBySlot) {
      const v = varSlotId(slotId)
      lines.push(`    if (_${v}) {`)
      for (const prop of props) {
        const value = `${prop.expression}()`
        if (prop.propName === 'selected') {
          if (prop.componentName === 'TabsContent') {
            lines.push(`      _${v}.setAttribute('data-state', ${value} ? 'active' : 'inactive')`)
            lines.push(`      if (${value}) {`)
            lines.push(`        _${v}.classList.remove('hidden')`)
            lines.push(`      } else {`)
            lines.push(`        _${v}.classList.add('hidden')`)
            lines.push(`      }`)
          } else {
            // Update data-state and aria-selected attributes.
            // Visual styling is driven by CSS data-[state=active/inactive]: selectors.
            lines.push(`      _${v}.setAttribute('aria-selected', String(${value}))`)
            lines.push(`      _${v}.setAttribute('data-state', ${value} ? 'active' : 'inactive')`)
            lines.push(`      _${v}.setAttribute('tabindex', ${value} ? '0' : '-1')`)
          }
        // Use DOM property assignment for value and boolean attrs.
        // setAttribute('value', x) only sets the initial HTML attribute; after user
        // interaction the DOM property diverges, so .value = x is required.
        // Boolean attrs (disabled, checked, etc.) treat any attribute presence as
        // truthy, so setAttribute('disabled', 'false') still disables the element.
        } else if (prop.propName === 'value') {
          lines.push(`      const __val = String(${value})`)
          lines.push(`      if (_${v}.value !== __val) _${v}.value = __val`)
        } else if (isBooleanAttr(prop.propName)) {
          lines.push(`      _${v}.${prop.propName} = !!(${value})`)
        } else {
          lines.push(`      _${v}.setAttribute('${prop.propName}', String(${value}))`)
        }
      }
      lines.push(`    }`)
    }

    lines.push(`  }${bindingIdArg(ctx, ctx.reactiveProps[0]?.slotId)})`)
  }
}

/** Emit createEffect to update child component DOM attributes when parent props change. */
export function emitReactiveChildProps(lines: string[], ctx: ClientJsContext): void {
  if (ctx.reactiveChildProps.length > 0) {
    lines.push('')
    lines.push(`  // Reactive child component props`)
    lines.push(`  createEffect(() => {`)

    const propsByComponent = new Map<string, typeof ctx.reactiveChildProps>()
    for (const prop of ctx.reactiveChildProps) {
      const key = `${prop.componentName}_${prop.slotId ?? '__scope'}`
      if (!propsByComponent.has(key)) {
        propsByComponent.set(key, [])
      }
      propsByComponent.get(key)!.push(prop)
    }

    for (const [, props] of propsByComponent) {
      const first = props[0]
      const varSuffix = first.slotId ? varSlotId(first.slotId).replace(/-/g, '_') : first.componentName
      const varName = `__${first.componentName}_${varSuffix}El`
      const selectorArg = first.slotId ? first.slotId : first.componentName
      lines.push(`    const [${varName}] = $c(__scope, '${selectorArg}')`)
      lines.push(`    if (${varName}) {`)
      for (const prop of props) {
        for (const stmt of emitAttrUpdate(varName, prop.attrName, prop.expression, prop)) {
          lines.push(`      ${stmt}`)
        }
      }
      lines.push(`    }`)
    }

    lines.push(`  }${bindingIdArg(ctx, ctx.reactiveChildProps[0]?.slotId ?? undefined)})`)
  }
}
