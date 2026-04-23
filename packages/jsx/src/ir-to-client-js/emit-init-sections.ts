/**
 * Extracted output phases from generateInitFunction.
 * Each function appends to a lines[] array.
 *
 * Declarations, props extraction, event handlers, refs, and lifecycle.
 * Control flow, reactive updates, and registration are in separate modules.
 */

import type { SignalInfo } from '../types'
import type { Declaration } from './declaration-sort'
import type { ClientJsContext } from './types'
import { inferDefaultValue, toDomEventName, wrapHandlerInBlock, varSlotId, quotePropName, PROPS_PARAM } from './utils'


/**
 * Collect slot IDs that are inside conditionals (handled by insert()).
 * Used by both generateElementRefs and emitEventHandlers.
 */
export function collectConditionalSlotIds(ctx: ClientJsContext): Set<string> {
  const conditionalSlotIds = new Set<string>()
  for (const cond of ctx.conditionalElements) {
    for (const event of cond.whenTrueEvents) {
      conditionalSlotIds.add(event.slotId)
    }
    for (const event of cond.whenFalseEvents) {
      conditionalSlotIds.add(event.slotId)
    }
    for (const ref of cond.whenTrueRefs) {
      conditionalSlotIds.add(ref.slotId)
    }
    for (const ref of cond.whenFalseRefs) {
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
  propsWithPropertyAccess: Set<string>,
  propsUsedAsLoopArrays: Set<string>
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
      const defaultVal = prop?.defaultValue
      if (defaultVal) {
        // Wrap arrow function defaults in parentheses to avoid operator precedence issues
        // e.g., `props.onInput ?? () => {}` is a syntax error; must be `props.onInput ?? (() => {})`
        const wrappedDefault = prop?.defaultContainsArrow ? `(${defaultVal})` : defaultVal
        lines.push(`  const ${propName} = ${PROPS_PARAM}.${propName} ?? ${wrappedDefault}`)
      } else if (propsUsedAsLoopArrays.has(propName)) {
        lines.push(`  const ${propName} = ${PROPS_PARAM}.${propName} ?? []`)
      } else if (propsWithPropertyAccess.has(propName) && !propsUsedAsConditions.has(propName)) {
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

/**
 * Emit a single declaration (constant, signal, memo, or function).
 * Dispatches by declaration kind. Used by the unified topological-sort emitter.
 */
export function emitDeclaration(
  lines: string[],
  decl: Declaration,
  ctx: ClientJsContext,
  controlledSignals: Array<{ signal: SignalInfo; propName: string }>
): void {
  switch (decl.kind) {
    case 'constant': {
      const constant = decl.info
      const keyword = constant.declarationKind ?? 'const'
      if (constant.value !== undefined) {
        lines.push(`  ${keyword} ${constant.name} = ${constant.value}`)
      } else {
        lines.push(`  ${keyword} ${constant.name}`)
      }
      break
    }
    case 'signal': {
      const signal = decl.info
      const propsName = ctx.propsObjectName ?? 'props'
      const propsPrefix = `${propsName}.`

      let initialValue: string
      if (signal.initialValue.startsWith(propsPrefix) && !signal.initialValue.includes('??')) {
        const propRef = `${PROPS_PARAM}.` + signal.initialValue.slice(propsPrefix.length)
        initialValue = `${propRef} ?? ${inferDefaultValue(signal.type)}`
      } else {
        const controlled = controlledSignals.find(c => c.signal === signal)
        if (controlled) {
          if (signal.initialValue.includes('??')) {
            if (ctx.propsObjectName && signal.initialValue.startsWith(propsPrefix)) {
              initialValue = `${PROPS_PARAM}.` + signal.initialValue.slice(propsPrefix.length)
            } else {
              initialValue = signal.initialValue
            }
          } else {
            const prop = ctx.propsParams.find(p => p.name === controlled.propName)
            const defaultVal = prop?.defaultValue ?? inferDefaultValue(signal.type)
            initialValue = `${PROPS_PARAM}.${controlled.propName} ?? ${defaultVal}`
          }
        } else if (ctx.propsObjectName && signal.initialValue.startsWith(propsPrefix)) {
          initialValue = `${PROPS_PARAM}.` + signal.initialValue.slice(propsPrefix.length)
        } else {
          initialValue = signal.initialValue
        }
      }

      if (signal.setter) {
        lines.push(`  const [${signal.getter}, ${signal.setter}] = createSignal(${initialValue})`)
      } else {
        lines.push(`  const [${signal.getter}] = createSignal(${initialValue})`)
      }
      break
    }
    case 'memo': {
      lines.push(`  const ${decl.info.name} = createMemo(${decl.info.computation})`)
      break
    }
    case 'function': {
      const fn = decl.info
      const paramStr = fn.params.map((p) => p.name).join(', ')
      lines.push(`  const ${fn.name} = (${paramStr}) => ${fn.body}`)
      break
    }
  }
}

/** Emit createEffect for controlled signal synchronization. */
export function emitControlledSignalEffect(
  lines: string[],
  signal: SignalInfo,
  propName: string,
  ctx: ClientJsContext
): void {
  const prop = ctx.propsParams.find(p => p.name === propName)
  const accessor = prop?.defaultValue
    ? `(${PROPS_PARAM}.${propName} ?? ${prop.defaultValue})`
    : `${PROPS_PARAM}.${propName}`
  if (!signal.setter) return // read-only signal, no controlled sync needed
  lines.push(`  createEffect(() => {`)
  lines.push(`    const __val = ${accessor}`)
  lines.push(`    if (__val !== undefined) ${signal.setter}(__val)`)
  lines.push(`  })`)
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
 */
export function emitStaticArrayChildInits(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.loopElements) {
    if (!elem.isStaticArray) continue

    if (elem.childComponent) {
      const { name, props } = elem.childComponent
      const v = varSlotId(elem.slotId)

      const propsEntries = props.map((p) => {
        if (p.isEventHandler) {
          return `${quotePropName(p.name)}: ${p.value}`
        } else if (p.isLiteral) {
          return `${quotePropName(p.name)}: ${JSON.stringify(p.value)}`
        } else {
          return `get ${quotePropName(p.name)}() { return ${p.value} }`
        }
      })
      const propsExpr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}'

      lines.push(`  // Initialize static array children (hydrate skips nested instances)`)
      lines.push(`  if (_${v}) {`)
      // Use both suffix match (for inlined stateless components whose bf-s uses
      // parent scope + slotId, e.g. ~ParentName_hash_s3) and prefix match (for
      // stateful components whose bf-s uses their own name, e.g. ToggleItem_hash)
      const namePrefixSelector = `[bf-s^="~${name}_"], [bf-s^="${name}_"]`
      const childSelector = elem.childComponent.slotId
        ? `[bf-s$="_${elem.childComponent.slotId}"], ${namePrefixSelector}`
        : namePrefixSelector
      lines.push(`    const __childScopes = _${v}.querySelectorAll('${childSelector}')`)
      const indexParam = elem.index || '__idx'
      lines.push(`    __childScopes.forEach((childScope, ${indexParam}) => {`)
      lines.push(`      const ${elem.param} = ${elem.array}[${indexParam}]`)
      lines.push(`      initChild('${name}', childScope, ${propsExpr})`)
      lines.push(`    })`)
      lines.push(`  }`)
      lines.push('')
    }

    if (elem.nestedComponents && elem.nestedComponents.length > 0) {
      const v = varSlotId(elem.slotId)

      // Outer-level components (loopDepth === 0 or undefined)
      const outerComps = elem.nestedComponents.filter(c => !c.loopDepth)
      for (const comp of outerComps) {
        const propsEntries = comp.props.map((p) => {
          if (p.isEventHandler) {
            return `${quotePropName(p.name)}: ${p.value}`
          } else if (p.isLiteral) {
            return `${quotePropName(p.name)}: ${JSON.stringify(p.value)}`
          } else {
            return `get ${quotePropName(p.name)}() { return ${p.value} }`
          }
        })
        const propsExpr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}'

        const selector = comp.slotId
          ? `[bf-s$="_${comp.slotId}"]`
          : `[bf-s^="~${comp.name}_"], [bf-s^="${comp.name}_"]`

        lines.push(`  // Initialize nested ${comp.name} in static array`)
        lines.push(`  if (_${v}) {`)
        const indexParam = elem.index || '__idx'
        const offsetExpr = elem.siblingOffset ? `${indexParam} + ${elem.siblingOffset}` : indexParam
        lines.push(`    ${elem.array}.forEach((${elem.param}, ${indexParam}) => {`)
        lines.push(`      const __iterEl = _${v}.children[${offsetExpr}]`)
        lines.push(`      if (__iterEl) {`)
        lines.push(`        const __compEl = __iterEl.querySelector('${selector}')`)
        lines.push(`        if (__compEl) initChild('${comp.name}', __compEl, ${propsExpr})`)
        lines.push(`      }`)
        lines.push(`    })`)
        lines.push(`  }`)
        lines.push('')
      }

      // Inner-loop components (loopDepth > 0): iterate outer then inner loop
      if (elem.innerLoops) {
        for (const innerLoop of elem.innerLoops) {
          const innerComps = elem.nestedComponents.filter(c =>
            (c.loopDepth ?? 0) === innerLoop.depth && c.innerLoopArray === innerLoop.array
          )
          if (innerComps.length === 0) continue

          lines.push(`  // Initialize inner-loop components in static array (depth ${innerLoop.depth})`)
          lines.push(`  if (_${v}) {`)
          const outerIdx = elem.index || '__idx'
          const outerOffset = elem.siblingOffset ? `${outerIdx} + ${elem.siblingOffset}` : outerIdx
          lines.push(`    ${elem.array}.forEach((${elem.param}, ${outerIdx}) => {`)
          lines.push(`      const __outerEl = _${v}.children[${outerOffset}]`)
          lines.push(`      if (!__outerEl) return`)
          if (innerLoop.containerSlotId) {
            lines.push(`      const __ic = __outerEl.querySelector('[bf="${innerLoop.containerSlotId}"]') || __outerEl`)
          } else {
            lines.push(`      const __ic = __outerEl`)
          }
          const innerOffset = innerLoop.siblingOffset ? `__innerIdx + ${innerLoop.siblingOffset}` : '__innerIdx'
          lines.push(`      ${innerLoop.array}.forEach((${innerLoop.param}, __innerIdx) => {`)
          lines.push(`        const __innerEl = __ic.children[${innerOffset}]`)
          lines.push(`        if (!__innerEl) return`)

          for (const comp of innerComps) {
            const propsEntries = comp.props.map((p) => {
              if (p.isEventHandler) {
                return `${quotePropName(p.name)}: ${p.value}`
              } else if (p.isLiteral) {
                return `${quotePropName(p.name)}: ${JSON.stringify(p.value)}`
              } else {
                return `get ${quotePropName(p.name)}() { return ${p.value} }`
              }
            })
            const propsExpr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}'
            const selector = comp.slotId
              ? `[bf-s$="_${comp.slotId}"]`
              : `[bf-s^="~${comp.name}_"], [bf-s^="${comp.name}_"]`
            lines.push(`        const __compEl = __innerEl.querySelector('${selector}')`)
            lines.push(`        if (__compEl) initChild('${comp.name}', __compEl, ${propsExpr})`)
          }

          lines.push(`      })`)
          lines.push(`    })`)
          lines.push(`  }`)
          lines.push('')
        }
      }
    }
  }
}

