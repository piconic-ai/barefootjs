/**
 * Extracted output phases from generateInitFunction.
 * Each function appends to a lines[] array.
 *
 * Declarations, props extraction, event handlers, refs, and lifecycle.
 * Control flow, reactive updates, and registration are in separate modules.
 */

import type { PropUsage } from '../types'
import type { ClientJsContext } from './types'
import { propHasPropertyAccess } from './compute-prop-usage'
import { inferDefaultValue, toDomEventName, wrapHandlerInBlock, varSlotId, PROPS_PARAM } from './utils'
import { buildStaticArrayChildInitsPlan } from './plan/build-static-array-child-init'
import { stringifyStaticArrayChildInits } from './stringify/static-array-child-init'


/**
 * Collect slot IDs that are inside conditionals (handled by insert()).
 * Used by both generateElementRefs and emitEventHandlers.
 */
export function collectConditionalSlotIds(ctx: ClientJsContext): Set<string> {
  const conditionalSlotIds = new Set<string>()
  for (const cond of ctx.conditionalElements) {
    for (const event of cond.whenTrue.events) {
      conditionalSlotIds.add(event.slotId)
    }
    for (const event of cond.whenFalse.events) {
      conditionalSlotIds.add(event.slotId)
    }
    for (const ref of cond.whenTrue.refs) {
      conditionalSlotIds.add(ref.slotId)
    }
    for (const ref of cond.whenFalse.refs) {
      conditionalSlotIds.add(ref.slotId)
    }
  }
  return conditionalSlotIds
}

/** Emit `const propName = props.propName ?? default` declarations. */
export function emitPropsExtraction(
  lines: string[],
  ctx: ClientJsContext,
  neededProps: Set<string>,
  propUsage: Map<string, PropUsage>,
): void {
  // Props used as conditional guards must remain falsy when undefined,
  // so we must NOT default them to {} (which is truthy).
  const propsUsedAsConditions = new Set<string>()
  for (const cond of ctx.conditionalElements) {
    if (neededProps.has(cond.condition)) {
      propsUsedAsConditions.add(cond.condition)
    }
  }
  for (const cond of ctx.clientOnlyConditionals) {
    if (neededProps.has(cond.condition)) {
      propsUsedAsConditions.add(cond.condition)
    }
  }

  if (neededProps.size > 0 && !ctx.propsObjectName) {
    for (const propName of neededProps) {
      const prop = ctx.propsParams.find((p) => p.name === propName)
      const usage = propUsage.get(propName)
      const defaultVal = prop?.defaultValue
      if (defaultVal) {
        // Wrap arrow function defaults in parentheses to avoid operator precedence issues
        // e.g., `props.onInput ?? () => {}` is a syntax error; must be `props.onInput ?? (() => {})`
        const wrappedDefault = prop?.defaultContainsArrow ? `(${defaultVal})` : defaultVal
        lines.push(`  const ${propName} = ${PROPS_PARAM}.${propName} ?? ${wrappedDefault}`)
      } else if (usage?.usedAsLoopArray) {
        lines.push(`  const ${propName} = ${PROPS_PARAM}.${propName} ?? []`)
      } else if (propHasPropertyAccess(usage) && !propsUsedAsConditions.has(propName)) {
        lines.push(`  const ${propName} = ${PROPS_PARAM}.${propName} ?? {}`)
      } else if (prop?.optional && prop?.type) {
        const inferredDefault = inferDefaultValue(prop.type)
        if (inferredDefault !== 'undefined') {
          lines.push(`  const ${propName} = ${PROPS_PARAM}.${propName} ?? ${inferredDefault}`)
        } else {
          lines.push(`  const ${propName} = ${PROPS_PARAM}.${propName}`)
        }
      } else {
        lines.push(`  const ${propName} = ${PROPS_PARAM}.${propName}`)
      }
    }
    lines.push('')
  }
}

/** Emit props-based event handler bindings (handlers that come from props, not local definitions). */
export function emitPropsEventHandlers(
  lines: string[],
  ctx: ClientJsContext,
  usedFunctions: Set<string>,
  neededProps: Set<string>
): void {
  const localNames = new Set([
    ...ctx.localFunctions.map((f) => f.name),
    ...ctx.localConstants.map((c) => c.name),
  ])
  let addedPropsHandler = false
  for (const handlerName of usedFunctions) {
    if (localNames.has(handlerName)) continue
    if (neededProps.has(handlerName)) continue

    const isProp = ctx.propsParams.some((p) => p.name === handlerName)
    if (isProp) {
      lines.push(`  const ${handlerName} = ${PROPS_PARAM}.${handlerName}`)
      addedPropsHandler = true
    }
  }
  if (addedPropsHandler) {
    lines.push('')
  }
}

/** Emit applyRestAttrs() calls for HTML elements with unresolved spread attrs. */
export function emitRestAttrApplications(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.restAttrElements) {
    const v = varSlotId(elem.slotId)
    const excludeKeys = JSON.stringify(elem.excludeKeys)
    lines.push(`  if (_${v}) applyRestAttrs(_${v}, ${elem.source}, ${excludeKeys})`)
  }
  if (ctx.restAttrElements.length > 0) {
    lines.push('')
  }
}

/** Emit DOM event handler assignments, skipping slots inside conditionals. */
export function emitEventHandlers(
  lines: string[],
  ctx: ClientJsContext,
  conditionalSlotIds: Set<string>
): void {
  for (const elem of ctx.interactiveElements) {
    if (conditionalSlotIds.has(elem.slotId)) continue

    for (const event of elem.events) {
      const eventName = toDomEventName(event.name)
      const wrappedHandler = wrapHandlerInBlock(event.handler)
      if (elem.slotId === '__scope') {
        lines.push(`  if (__scope) __scope.addEventListener('${eventName}', ${wrappedHandler})`)
      } else {
        const v = varSlotId(elem.slotId)
        lines.push(`  if (_${v}) _${v}.addEventListener('${eventName}', ${wrappedHandler})`)
      }
    }
  }
}

/** Emit ref callback invocations, skipping slots inside conditionals. */
export function emitRefCallbacks(
  lines: string[],
  ctx: ClientJsContext,
  conditionalSlotIds: Set<string>
): void {
  for (const elem of ctx.refElements) {
    if (conditionalSlotIds.has(elem.slotId)) continue
    const v = varSlotId(elem.slotId)
    lines.push(`  if (_${v}) (${elem.callback})(_${v})`)
  }
}

/** Emit user-defined createEffect and onMount calls. */
export function emitEffectsAndOnMounts(lines: string[], ctx: ClientJsContext): void {
  for (const effect of ctx.effects) {
    if (effect.captureName) {
      // Preserve the `const <name> = createEffect(...)` form so user code
      // calling the captured disposer (or any future return value) still
      // resolves at runtime.
      lines.push(`  const ${effect.captureName} = createEffect(${effect.body})`)
    } else {
      lines.push(`  createEffect(${effect.body})`)
    }
  }

  for (const onMount of ctx.onMounts) {
    lines.push(`  onMount(${onMount.body})`)
  }
}

/**
 * Emit user-written top-level imperative statements preserved from the
 * component body (#930). Each statement is re-indented and inserted verbatim
 * so it runs once during init, after signal/memo declarations.
 *
 * Examples: `if (typeof window !== 'undefined') { window.addEventListener(...) }`,
 * `console.log(...)`, `try { localStorage.getItem(...) } catch {}`.
 */
export function emitInitStatements(lines: string[], ctx: ClientJsContext): void {
  for (const stmt of ctx.initStatements) {
    // Re-indent the source text (which may span multiple lines) so it nests
    // neatly inside init(). Preserve blank lines as-is.
    const indented = stmt.body
      .split('\n')
      .map((ln, i) => (i === 0 || ln === '' ? ln : '  ' + ln))
      .join('\n')
    lines.push(`  ${indented}`)
  }
}

/** Emit provideContext calls and initChild calls for child components. */
export function emitProviderAndChildInits(lines: string[], ctx: ClientJsContext): void {
  if (ctx.providerSetups.length > 0) {
    lines.push('')
    lines.push('  // Provide context for child components')
    for (const provider of ctx.providerSetups) {
      lines.push(`  provideContext(${provider.contextName}, ${provider.valueExpr})`)
    }
  }

  if (ctx.childInits.length > 0) {
    lines.push('')
    lines.push(`  // Initialize child components with props`)
    for (const child of ctx.childInits) {
      const scopeRef = child.slotId ? `_${varSlotId(child.slotId)}` : '__scope'
      lines.push(`  initChild('${child.name}', ${scopeRef}, ${child.propsExpr})`)
    }
  }
}

/**
 * Emit initChild calls for static array children.
 * Must run AFTER emitProviderAndChildInits so that parent components
 * have already provided their context (e.g., SelectContext) before
 * array children (e.g., SelectItem) call useContext().
 *
 * Drives the per-loop emission via a `StaticArrayChildInitsPlan` built up-
 * front. Three Plan kinds (`single-comp`, `outer-nested`,
 * `inner-loop-nested`) cover every shape this helper used to emit inline.
 */
export function emitStaticArrayChildInits(lines: string[], ctx: ClientJsContext): void {
  const plans = buildStaticArrayChildInitsPlan(ctx)
  stringifyStaticArrayChildInits(lines, plans)
}

