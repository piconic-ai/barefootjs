/**
 * Constants resolution, template generation, and hydration registration.
 * Handles inlinable constants analysis, signal/memo maps for CSR,
 * and the final hydrate() call emission.
 */

import type { ComponentIR, IRFragment, IRNode, ReferencesGraph } from '../types.ts'
import type { ClientJsContext } from './types.ts'
import { PROPS_PARAM } from './utils.ts'
import { computeInlinability, toLegacyInlinability } from './compute-inlinability.ts'
import { canGenerateStaticTemplate, irToComponentTemplate, generateCsrTemplate, createStringProtector } from './html-template.ts'
import { nameForRegistryRef } from './component-scope.ts'

/**
 * Resolve chained references within a constants map.
 * If constant A references constant B, replace B's name in A's value with B's resolved value.
 * Uses pre-computed freeIdentifiers to skip unnecessary regex replacements.
 *
 * When `freeIdsMap` is supplied, it is updated in place: each substitution
 * removes the substituted name from the resolving constant's free-id set
 * and unions in the substituted constant's own free ids. The result is a
 * transitively-closed free-id map that downstream callers
 * (`toLegacyInlinability` unsafe-ref check, #1267) can read without
 * re-scanning the resolved string.
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
          // Maintain a transitively-closed free-id set on the resolving
          // constant: drop the substituted name, union in the substituted
          // constant's own free ids.
          if (freeIds) {
            freeIds.delete(otherName)
            const otherFreeIds = freeIdsMap?.get(otherName)
            if (otherFreeIds) {
              for (const id of otherFreeIds) freeIds.add(id)
            }
          }
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
  irRoot: IRNode,
): {
  inlinableConstants: Map<string, string>
  unsafeLocalNames: Set<string>
} {
  const analysis = computeInlinability(ctx, graph, irRoot)
  return toLegacyInlinability(analysis, resolveChainedRefs, ctx)
}

/**
 * Materialise the CSR-inlining map from the context's `csrInlinable`
 * side map (populated by `populateCsrInlinable` during
 * `compute-inlinability`, #1277). Replaces `buildCsrInlinableConstants`
 * — the AST substitution + chain resolution now lives upstream.
 *
 * Excludes constants whose entry is `null` (unsafe to inline) — those
 * are also folded into the unsafe set `generateCsrTemplate` uses
 * internally (see `mergeCsrNullUnsafe` in html-template.ts, #2106), so
 * every caller of `generateCsrTemplate` gets a consistent
 * substitute-or-fallback decision with no extra wiring required here.
 */
export function csrInlinableConstantsFromCtx(ctx: ClientJsContext): Map<string, string> {
  const out = new Map<string, string>()
  for (const [name, entry] of ctx.csrInlinable) {
    if (entry) out.set(name, entry.rewrittenValue)
  }
  return out
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
  /**
   * Precomputed inlinability. `buildInlinableConstants` is side-effectful
   * (pushes BF060/BF061 diagnostics into `ctx.warnings`); the caller in
   * `generate-init.ts` runs it once and forwards it here so phases that
   * also need `unsafeLocalNames` can share the result without surfacing
   * duplicate warnings (#1247).
   */
  inlinability?: { inlinableConstants: Map<string, string>; unsafeLocalNames: Set<string> },
): string {
  const name = ctx.componentName

  lines.push(`}`)
  lines.push('')

  const propNamesForStaticCheck = new Set(ctx.propsParams.map((p) => p.name))
  const { inlinableConstants, unsafeLocalNames } = inlinability ?? buildInlinableConstants(ctx, graph, _ir.root)

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
    // Substitution data (signal initial values, memo bodies, chain-resolved
    // const inlines) is read directly from `ctx.csrInlinable` (CSR-internal
    // side map) / `SignalInfo.initialFreeIdentifiers` /
    // `MemoInfo.computationFreeIdentifiers` — no post-hoc string
    // transformation runs at this layer (#1277).
    const csrInlinableConstants = csrInlinableConstantsFromCtx(ctx)
    const templateHtml = generateCsrTemplate(
      _ir.root, csrInlinableConstants, ctx, undefined, restSpreadNames, ctx.propsObjectName, unsafeLocalNames, ctx.deferredChildSlots
    )
    if (templateHtml) {
      defParts.push(`template: (${PROPS_PARAM}) => \`${templateHtml}\``)
    }
  }
  // No else: top-level-only components skip template entirely (save bytes)
  if (isCommentScope) {
    defParts.push('comment: true')
  }

  const registryKey = nameForRegistryRef(name)
  const hydrateLine = `hydrate('${registryKey}', { ${defParts.join(', ')} })`

  // Emit a callable shim with the original component name so consumers
  // can use the component as a *value* — e.g. `<Flow renderNode={Bridge}>`
  // or any other higher-order pattern where a JSX-defined `'use client'`
  // component is passed around and later invoked as a function.
  //
  // Without the shim, the CLI compiles `function Bridge(props) {...}` to
  // `function initBridge(__scope, _p) {...}` + `hydrate('Bridge', ...)`,
  // and the bare `Bridge` reference becomes a free variable (silent
  // ReferenceError when the holding closure runs). Holders that read it
  // synchronously (Flow's reactive children getter, called from
  // `setNodes` updates) crash.
  //
  // The shim delegates to `createComponent`, which:
  //   - looks up the registered template + init for `${registryKey}`
  //   - generates a fresh DOM element
  //   - sets `currentScope` so `provideContext` / `useContext` inside
  //     the init resolve relative to *this* element (i.e. inside the
  //     calling parent's reactive scope, not at the top level)
  //   - wires the props through and calls init
  //
  // Net effect: `renderNode={Bridge}` works for both the static SSR
  // path (parent renders the bridge as children of NodeWrapper) and the
  // runtime reactive path (mapArray → renderNode getter → real call).
  const shimLine = `export function ${name}(${PROPS_PARAM}, __bfKey) { return createComponent('${registryKey}', ${PROPS_PARAM}, __bfKey) }`

  return `${hydrateLine}\n${shimLine}`
}
