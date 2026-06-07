/**
 * Reactive attribute, text, and prop update emission.
 * Handles createEffect blocks for DOM attribute syncing, dynamic text nodes,
 * client-only expressions, and reactive component prop bindings.
 */

import type { AttrMeta } from '../types.ts'
import { isBooleanAttr } from '../html-constants.ts'
import type { ClientJsContext } from './types.ts'
import { toHtmlAttrName, varSlotId, PROPS_PARAM } from './utils.ts'
import { createTemplateAwareStringProtector } from './html-template.ts'

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

/** Emit createEffect blocks that update text nodes for reactive expressions. */
export function emitDynamicTextUpdates(lines: string[], ctx: ClientJsContext): void {
  // Group elements by expression to consolidate effects with same dependencies
  const byExpression = new Map<string, typeof ctx.dynamicElements>()
  for (const elem of ctx.dynamicElements) {
    const key = elem.expression
    if (!byExpression.has(key)) {
      byExpression.set(key, [])
    }
    byExpression.get(key)!.push(elem)
  }

  for (const [expr, elems] of byExpression) {
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
