/**
 * Constants resolution, template generation, and hydration registration.
 * Handles inlinable constants analysis, signal/memo maps for CSR,
 * and the final hydrate() call emission.
 */

import type { ComponentIR, IRFragment, ReferencesGraph } from '../types'
import type { ClientJsContext } from './types'
import { PROPS_PARAM, inferDefaultValue, exprReferencesIdent } from './utils'
import { computeInlinability, toLegacyInlinability } from './compute-inlinability'
import { canGenerateStaticTemplate, irToComponentTemplate, generateCsrTemplate, createStringProtector } from './html-template'
import { nameForRegistryRef } from './component-scope'

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
 *
 * Thin adapter over `computeInlinability` — the tagged-union classifier
 * lives in `compute-inlinability.ts`; this function reconstructs the
 * legacy Map/Set shape for the template pipeline.
 */
export function buildInlinableConstants(
  ctx: ClientJsContext,
  graph: ReferencesGraph,
): {
  inlinableConstants: Map<string, string>
  unsafeLocalNames: Set<string>
} {
  const analysis = computeInlinability(ctx, graph)
  return toLegacyInlinability(analysis, resolveChainedRefs, ctx, exprReferencesIdent)
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
    // Replace signal getter calls with initial values.
    // `(?<![-.])` skips member accesses (e.g. `ctx.count()`) so a local
    // signal whose name matches a context method is preserved (#1100).
    for (const [getter, initial] of signalMap) {
      expr = expr.replace(new RegExp(`(?<![-.])\\b${getter}\\(\\)`, 'g'), `(${initial})`)
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
        // `(?<![-.])` keeps the substitution off member accesses such as
        // `ctx.bars()` when a local memo `bars` exists (#1100).
        const replaced = newExpr.replace(new RegExp(`(?<![-.])\\b${otherName}\\(\\)`, 'g'), `(${otherExpr})`)
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
 *
 * `propsObjectName`, when supplied, is the source-level name the user gave
 * the props parameter (e.g. `props`). A re-promoted value that still
 * contains a bare reference to it (`makeStore(props)`) is rejected: the
 * template lambda's regex-based `propsObjectName.x → _p.x` rewrite only
 * catches the dotted form, so a bare `props` token would survive into the
 * module-scope template and ReferenceError at template-call time (#1137).
 * The init-body path uses `rewritePropsObjectRef` (AST-based) which
 * handles bare refs correctly, but that rewrite isn't applied to the
 * template body — the constant must instead stay in `unsafeLocalNames`,
 * letting `expressionReferencesAny` swap the getter call for the
 * `UNSAFE_TEMPLATE_EXPR` sentinel and init's `createEffect` repaint.
 */
export function buildCsrInlinableConstants(
  ctx: ClientJsContext,
  inlinableConstants: Map<string, string>,
  unsafeLocalNames: Set<string>,
  signalMap: Map<string, string>,
  memoMap: Map<string, string>,
  propsObjectName?: string | null,
): Map<string, string> {
  const csrInlinableConstants = new Map(inlinableConstants)
  // Match any reference to the props object — bare `props` OR `props.X`.
  // The previous lookahead form (`(?!\.)`) caught only the bare token,
  // letting `useYjs(props.roomId, props.readOnly)` re-inline into the
  // template — the call ran on every template re-render (wrong identity)
  // AND the renderChild prop bag duplicated the bare reference into
  // child scope (#1138 soak / #1137 follow-up).
  const propsRe = propsObjectName ? new RegExp(`\\b${propsObjectName}\\b`) : null
  for (const constant of ctx.localConstants) {
    if (unsafeLocalNames.has(constant.name) && constant.value && !constant.containsArrow) {
      let value = constant.value.trim()
      // `(?<![-.])` skips member accesses (e.g. `ctx.count()`) so a local
      // signal/memo whose name matches a context method is preserved (#1100).
      for (const [getter, initial] of signalMap) {
        value = value.replace(new RegExp(`(?<![-.])\\b${getter}\\(\\)`, 'g'), `(${initial})`)
      }
      for (const [memoName, computation] of memoMap) {
        value = value.replace(new RegExp(`(?<![-.])\\b${memoName}\\(\\)`, 'g'), `(${computation})`)
      }
      // Reject when the value depends on props in any form (bare `props`
      // or `props.X` access) — those calls need init scope where _p is
      // a parameter. Keep zero-arg `()` rejection too so
      // `useContext(SomeContext)` (no props dep) is still re-promoted
      // for #1100.
      const hasPropsRef = propsRe ? propsRe.test(value) : false
      if (!hasPropsRef && !/\b\w+\(\)/.test(value)) {
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
  graph: ReferencesGraph,
): string {
  const name = ctx.componentName

  lines.push(`}`)
  lines.push('')

  const propNamesForStaticCheck = new Set(ctx.propsParams.map((p) => p.name))
  const { inlinableConstants, unsafeLocalNames } = buildInlinableConstants(ctx, graph)

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
    const csrInlinableConstants = buildCsrInlinableConstants(ctx, inlinableConstants, unsafeLocalNames, signalMap, memoMap, ctx.propsObjectName)

    const templateHtml = generateCsrTemplate(
      _ir.root, csrInlinableConstants, signalMap, memoMap, undefined, restSpreadNames, ctx.propsObjectName, unsafeLocalNames
    )
    if (templateHtml) {
      defParts.push(`template: (${PROPS_PARAM}) => \`${templateHtml}\``)
    }
  }
  // No else: top-level-only components skip template entirely (save bytes)
  if (isCommentScope) {
    defParts.push('comment: true')
  }

  return `hydrate('${nameForRegistryRef(name)}', { ${defParts.join(', ')} })`
}
