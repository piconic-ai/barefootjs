/**
 * Constants resolution, template generation, and hydration registration.
 * Handles inlinable constants analysis, signal/memo maps for CSR,
 * and the final hydrate() call emission.
 */

import type { ComponentIR, IRFragment } from '../types'
import type { ClientJsContext } from './types'
import { bodyReferencesComponentScope, PROPS_PARAM, inferDefaultValue, exprReferencesIdent } from './utils'
import { canGenerateStaticTemplate, irToComponentTemplate, generateCsrTemplate, createStringProtector } from './html-template'

// JavaScript built-in identifiers that are always available at any scope
const JS_BUILTINS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'typeof', 'instanceof', 'void', 'delete', 'new', 'in', 'of',
  'this', 'super', 'return', 'throw', 'if', 'else',
  'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'try', 'catch', 'finally', 'yield', 'await', 'async',
  'let', 'const', 'var', 'function', 'class',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise',
  'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'console', 'window', 'document', 'globalThis', 'navigator',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'Symbol', 'Proxy', 'Reflect', 'BigInt',
])

/**
 * Check that an expression value only references identifiers known within
 * the component scope (or JavaScript built-ins). Returns false if the value
 * contains references to file-scope variables that won't be available in
 * the generated client JS module scope.
 *
 * Uses pre-computed freeIdentifiers from the analyzer phase (ConstantInfo.freeIdentifiers).
 */
function valueOnlyUsesKnownNames(freeIds: Set<string>, knownNames: Set<string>): boolean {
  for (const id of freeIds) {
    if (JS_BUILTINS.has(id)) continue
    if (knownNames.has(id)) continue
    return false
  }
  return true
}

/**
 * Resolve chained references within a constants map.
 * If constant A references constant B, replace B's name in A's value with B's resolved value.
 * Uses pre-computed freeIdentifiers to skip unnecessary regex replacements.
 */
export function resolveChainedRefs(constants: Map<string, string>, freeIdsMap?: Map<string, Set<string>>): void {
  let changed = true
  const maxIterations = constants.size + 1
  let iteration = 0
  while (changed && iteration < maxIterations) {
    changed = false
    iteration++
    for (const [constName, constValue] of constants) {
      // String literal values (single/double quoted) cannot contain variable references.
      // Skip them to avoid corrupting CSS class names like "size-4" when a constant
      // named "size" exists (the regex would falsely match "size" in "size-4").
      const trimmed = constValue.trim()
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
          (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        continue
      }

      // Protect string literals within compound values (e.g., Record objects
      // containing 'size-4') from regex-based identifier replacement
      const { protect, restore } = createStringProtector()
      let newValue = protect(constValue)
      const freeIds = freeIdsMap?.get(constName)
      for (const [otherName, otherValue] of constants) {
        if (otherName === constName) continue
        // Use freeIdentifiers to skip constants that are definitely not referenced.
        // On subsequent iterations the value may have been expanded beyond what
        // freeIdentifiers tracks, so fall through to regex when freeIds is unavailable
        // or when the iteration is > 1 (values have been mutated).
        if (freeIds && iteration === 1 && !freeIds.has(otherName)) continue
        const replaced = newValue.replace(new RegExp(`(?<![-.])\\b${otherName}\\b`, 'g'), `(${protect(otherValue)})`)
        if (replaced !== newValue) {
          newValue = replaced
          changed = true
        }
      }
      newValue = restore(newValue)
      if (newValue !== constValue) {
        constants.set(constName, newValue)
      }
    }
  }
}

/**
 * Build the inlinable constants map and unsafe local names set from a context.
 * Extracted for reuse by both emitRegistrationAndHydration and generateTemplateOnlyMount (#435).
 */
export function buildInlinableConstants(ctx: ClientJsContext): {
  inlinableConstants: Map<string, string>
  unsafeLocalNames: Set<string>
} {
  const inlinableConstants = new Map<string, string>()
  const unsafeLocalNames = new Set<string>()

  const signalGetters = new Set(ctx.signals.map(s => s.getter))
  const signalSetters = new Set(ctx.signals.filter(s => s.setter).map(s => s.setter!))
  const memoNames = new Set(ctx.memos.map(m => m.name))

  const componentScopeNames = new Set<string>()
  for (const c of ctx.localConstants) componentScopeNames.add(c.name)
  for (const s of ctx.signals) { componentScopeNames.add(s.getter); if (s.setter) componentScopeNames.add(s.setter) }
  for (const m of ctx.memos) componentScopeNames.add(m.name)
  for (const f of ctx.localFunctions) componentScopeNames.add(f.name)
  for (const p of ctx.propsParams) componentScopeNames.add(p.name)
  if (ctx.propsObjectName) componentScopeNames.add(ctx.propsObjectName)

  for (const fn of ctx.localFunctions) {
    // Module-level functions that don't reference component internals
    // are emitted at module scope, so they are available in the template.
    if (fn.isModule && !bodyReferencesComponentScope(fn.body, componentScopeNames)) continue
    unsafeLocalNames.add(fn.name)
  }

  for (const constant of ctx.localConstants) {
    if (constant.isJsx) continue  // Inlined at IR level (#547)
    if (!constant.value) {
      // `let x` with no initializer — not safe for template inlining
      unsafeLocalNames.add(constant.name)
      continue
    }
    const trimmedValue = constant.value.trim()

    // Use AST-derived flag instead of string inspection
    if (constant.containsArrow) {
      unsafeLocalNames.add(constant.name)
      continue
    }

    // Use AST-derived flag instead of regex
    if (constant.systemConstructKind) {
      continue
    }

    // Use pre-computed freeIdentifiers instead of regex
    let dependsOnReactive = false
    const freeIds = constant.freeIdentifiers
    if (freeIds) {
      for (const sigName of signalGetters) {
        if (freeIds.has(sigName)) { dependsOnReactive = true; break }
      }
      if (!dependsOnReactive) {
        for (const setterName of signalSetters) {
          if (freeIds.has(setterName)) { dependsOnReactive = true; break }
        }
      }
      if (!dependsOnReactive) {
        for (const mName of memoNames) {
          if (freeIds.has(mName)) { dependsOnReactive = true; break }
        }
      }
    }

    if (dependsOnReactive) {
      unsafeLocalNames.add(constant.name)
      continue
    }

    if (!valueOnlyUsesKnownNames(constant.freeIdentifiers!, componentScopeNames)) {
      unsafeLocalNames.add(constant.name)
      continue
    }

    inlinableConstants.set(constant.name, constant.templateValue?.trim() ?? trimmedValue)
  }

  // Build freeIdentifiers lookup for resolveChainedRefs
  const freeIdsMap = new Map<string, Set<string>>()
  for (const constant of ctx.localConstants) {
    if (constant.freeIdentifiers) {
      freeIdsMap.set(constant.name, constant.freeIdentifiers)
    }
  }

  resolveChainedRefs(inlinableConstants, freeIdsMap)

  // Demote constants whose value still references an unsafe name.
  // Use freeIdentifiers from the original constant for initial check,
  // then fall back to checking the resolved value (which may have been
  // expanded by resolveChainedRefs and no longer matches the original freeIdentifiers).
  const toRemove: string[] = []
  for (const [constName, constValue] of inlinableConstants) {
    const constFreeIds = freeIdsMap.get(constName)
    let isUnsafe = false
    if (constFreeIds) {
      for (const unsafeName of unsafeLocalNames) {
        if (constFreeIds.has(unsafeName)) { isUnsafe = true; break }
      }
    }
    // After chained resolution, the constValue may contain identifiers
    // from inlined constants that are themselves unsafe. Fall back to
    // regex for the resolved value since freeIdentifiers reflect the
    // original source, not the resolved string.
    if (!isUnsafe) {
      for (const unsafeName of unsafeLocalNames) {
        if (exprReferencesIdent(constValue, unsafeName)) {
          isUnsafe = true
          break
        }
      }
    }
    if (isUnsafe) {
      toRemove.push(constName)
    }
  }
  for (const removeName of toRemove) {
    inlinableConstants.delete(removeName)
    unsafeLocalNames.add(removeName)
  }

  return { inlinableConstants, unsafeLocalNames }
}

/**
 * Build signal and memo maps for CSR template generation.
 * Signal map: getter name → initial value expression
 * Memo map: memo name → computation expression with signal calls replaced by initial values
 */
export function buildSignalAndMemoMaps(ctx: ClientJsContext): {
  signalMap: Map<string, string>
  memoMap: Map<string, string>
} {
  const propsName = ctx.propsObjectName ?? 'props'
  const propsPrefix = `${propsName}.`

  const signalMap = new Map<string, string>()
  for (const signal of ctx.signals) {
    let initialValue = signal.initialValue
    // Normalize custom props object name to PROPS_PARAM and add default fallback
    // to match emitSignalsAndMemos() behavior (prevents undefined rendering in CSR)
    if (ctx.propsObjectName && initialValue.startsWith(propsPrefix)) {
      const propRef = `${PROPS_PARAM}.` + initialValue.slice(propsPrefix.length)
      if (!initialValue.includes('??')) {
        initialValue = `${propRef} ?? ${inferDefaultValue(signal.type)}`
      } else {
        initialValue = propRef
      }
    } else if (initialValue.startsWith('props.') && !initialValue.includes('??')) {
      initialValue = `${PROPS_PARAM}.${initialValue.slice('props.'.length)} ?? ${inferDefaultValue(signal.type)}`
    }
    signalMap.set(signal.getter, initialValue)
  }

  const memoMap = new Map<string, string>()
  for (const memo of ctx.memos) {
    let expr = memo.computation
    // Extract the function body from arrow function: () => count() * 2 → count() * 2
    // Supports both expression arrows `() => expr` and block arrows `() => { return expr }`
    const arrowMatch = expr.match(/^\(\)\s*=>\s*(.+)$/s)
    if (arrowMatch) {
      const body = arrowMatch[1].trim()
      if (body.startsWith('{')) {
        // Block body: detect the trivial `{ return <expr>; }` shape. A bare
        // return expression can be inlined directly. Any other body (local
        // `const`/`let` declarations, guard clauses, multiple statements)
        // must be wrapped in an IIFE so that intermediate bindings remain in
        // scope when the expression is inlined into the SSR template.
        const simpleReturn = body.match(/^\{\s*return\s+([\s\S]+?)\s*;?\s*\}$/)
        if (simpleReturn) {
          expr = simpleReturn[1]
        } else {
          expr = `(() => ${body})()`
        }
      } else {
        expr = body
      }
    }
    // Replace signal getter calls with initial values
    for (const [getter, initial] of signalMap) {
      expr = expr.replace(new RegExp(`\\b${getter}\\(\\)`, 'g'), `(${initial})`)
    }
    memoMap.set(memo.name, expr)
  }

  // Resolve chained memo references: if memo A references memo B(),
  // replace B() with B's resolved computation expression.
  let changed = true
  const maxIter = memoMap.size + 1
  let iter = 0
  while (changed && iter < maxIter) {
    changed = false
    iter++
    for (const [memoName, memoExpr] of memoMap) {
      let newExpr = memoExpr
      for (const [otherName, otherExpr] of memoMap) {
        if (otherName === memoName) continue
        const replaced = newExpr.replace(new RegExp(`\\b${otherName}\\(\\)`, 'g'), `(${otherExpr})`)
        if (replaced !== newExpr) {
          newExpr = replaced
          changed = true
        }
      }
      if (newExpr !== memoExpr) {
        memoMap.set(memoName, newExpr)
      }
    }
  }

  return { signalMap, memoMap }
}

/**
 * Build an expanded inlinable constants map for CSR template generation.
 * Re-promotes constants that were demoted to unsafeLocalNames by resolving
 * signal/memo call expressions with their initial values.
 */
export function buildCsrInlinableConstants(
  ctx: ClientJsContext,
  inlinableConstants: Map<string, string>,
  unsafeLocalNames: Set<string>,
  signalMap: Map<string, string>,
  memoMap: Map<string, string>,
): Map<string, string> {
  const csrInlinableConstants = new Map(inlinableConstants)
  for (const constant of ctx.localConstants) {
    if (unsafeLocalNames.has(constant.name) && constant.value && !constant.containsArrow) {
      let value = constant.value.trim()
      for (const [getter, initial] of signalMap) {
        value = value.replace(new RegExp(`\\b${getter}\\(\\)`, 'g'), `(${initial})`)
      }
      for (const [memoName, computation] of memoMap) {
        value = value.replace(new RegExp(`\\b${memoName}\\(\\)`, 'g'), `(${computation})`)
      }
      if (!/\b\w+\(\)/.test(value)) {
        csrInlinableConstants.set(constant.name, value)
      }
    }
  }
  resolveChainedRefs(csrInlinableConstants)
  return csrInlinableConstants
}

/** Emit hydrate() call that registers component, template, and hydrates. */
/**
 * Generate the closing brace for the init function and the hydrate() call.
 * Returns the hydrate line separately so it can be appended after props renaming,
 * preventing double-replacement of props references in template expressions.
 */
export function emitRegistrationAndHydration(
  lines: string[],
  ctx: ClientJsContext,
  _ir: ComponentIR,
): string {
  const name = ctx.componentName

  lines.push(`}`)
  lines.push('')

  const propNamesForStaticCheck = new Set(ctx.propsParams.map((p) => p.name))
  const { inlinableConstants, unsafeLocalNames } = buildInlinableConstants(ctx)

  // Build rest spread names: these are rest/props spreads handled by applyRestAttrs, not spreadAttrs
  const restSpreadNames = new Set<string>()
  if (ctx.restPropsName) restSpreadNames.add(ctx.restPropsName)
  if (ctx.propsObjectName) restSpreadNames.add(ctx.propsObjectName)

  const isCommentScope = (_ir.root.type === 'fragment'
    && (_ir.root as IRFragment).needsScopeComment)
    || _ir.root.type === 'component'

  // Build ComponentDef object for hydrate()
  const defParts: string[] = [`init: init${name}`]
  if (canGenerateStaticTemplate(_ir.root, propNamesForStaticCheck, inlinableConstants, unsafeLocalNames)) {
    const templateHtml = irToComponentTemplate(_ir.root, inlinableConstants, restSpreadNames, ctx.propsObjectName)
    if (templateHtml) {
      defParts.push(`template: (${PROPS_PARAM}) => \`${templateHtml}\``)
    }
  } else {
    // CSR fallback: emit for all components that can't generate static templates.
    // Components may be imported and used in conditional branches in other files,
    // where renderChild() needs a registered template to render HTML correctly.
    const { signalMap, memoMap } = buildSignalAndMemoMaps(ctx)
    const csrInlinableConstants = buildCsrInlinableConstants(ctx, inlinableConstants, unsafeLocalNames, signalMap, memoMap)

    const templateHtml = generateCsrTemplate(
      _ir.root, csrInlinableConstants, signalMap, memoMap, undefined, restSpreadNames, ctx.propsObjectName
    )
    if (templateHtml) {
      defParts.push(`template: (${PROPS_PARAM}) => \`${templateHtml}\``)
    }
  }
  // No else: top-level-only components skip template entirely (save bytes)
  if (isCommentScope) {
    defParts.push('comment: true')
  }

  return `hydrate('${name}', { ${defParts.join(', ')} })`
}
