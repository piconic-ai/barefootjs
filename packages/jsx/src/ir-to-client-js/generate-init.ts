/**
 * generateInitFunction orchestrator + generateElementRefs.
 */

import type { ComponentIR, ConstantInfo, FunctionInfo, IRNode } from '../types'
import type { ClientJsContext, ConditionalBranchConditional, ConditionalBranchLoop } from './types'
import { varSlotId, bodyReferencesComponentScope, PROPS_PARAM } from './utils'
import { collectUsedIdentifiers, collectUsedFunctions, collectIdentifiersFromIRTree } from './identifiers'
import { valueReferencesReactiveData, getControlledPropName, detectPropsWithPropertyAccess } from './prop-handling'
import { IMPORT_PLACEHOLDER, MODULE_CONSTANTS_PLACEHOLDER, detectUsedImports, collectUserDomImports, collectExternalImports } from './imports'
import { type Declaration, providedNames, sortDeclarations } from './declaration-sort'
import {
  collectConditionalSlotIds,
  emitPropsExtraction,
  emitDeclaration,
  emitControlledSignalEffect,
  emitPropsEventHandlers,
  emitEventHandlers,
  emitRestAttrApplications,
  emitRefCallbacks,
  emitEffectsAndOnMounts,
  emitProviderAndChildInits,
  emitStaticArrayChildInits,
} from './emit-init-sections'
import { emitConditionalUpdates, emitClientOnlyConditionals, emitLoopUpdates } from './emit-control-flow'
import { emitDynamicTextUpdates, emitClientOnlyExpressions, emitReactiveAttributeUpdates, emitReactivePropBindings, emitReactiveChildProps } from './emit-reactive'
import { emitRegistrationAndHydration } from './emit-registration'

/**
 * Orchestrate client JS code generation: analyze dependencies, emit code sections,
 * and resolve imports. Returns the complete init function + registration code.
 */
export function generateInitFunction(_ir: ComponentIR, ctx: ClientJsContext, siblingComponents?: string[], localImportPrefixes?: string[]): string {
  const lines: string[] = []
  const name = ctx.componentName

  lines.push(IMPORT_PLACEHOLDER)

  // Child component imports (skip siblings in the same file)
  const siblingSet = new Set(siblingComponents || [])
  const childComponentNames = new Set<string>()
  for (const loop of ctx.loopElements) {
    if (loop.childComponent) {
      childComponentNames.add(loop.childComponent.name)
      collectComponentNamesFromIR(loop.childComponent.children, childComponentNames)
    }
    // Composite element reconciliation: collect component names from nestedComponents
    if (loop.useElementReconciliation && loop.nestedComponents?.length) {
      for (const comp of loop.nestedComponents) {
        childComponentNames.add(comp.name)
      }
    }
  }
  for (const child of ctx.childInits) {
    childComponentNames.add(child.name)
  }
  // Collect from conditional branch loops and nested conditionals
  for (const cond of [...ctx.conditionalElements, ...ctx.clientOnlyConditionals]) {
    collectChildNamesFromBranches(cond, childComponentNames)
  }
  for (const childName of childComponentNames) {
    if (!siblingSet.has(childName)) {
      lines.push(`import '/* @bf-child:${childName} */'`)
    }
  }

  lines.push('')
  lines.push(MODULE_CONSTANTS_PLACEHOLDER)

  lines.push(`export function init${name}(__scope, ${PROPS_PARAM} = {}) {`)
  lines.push(`  if (!__scope) return`)
  lines.push('')

  // --- Analysis: collect used identifiers and determine dependencies ---

  const usedIdentifiers = collectUsedIdentifiers(ctx)
  const usedFunctions = collectUsedFunctions(ctx)
  for (const fn of usedFunctions) {
    usedIdentifiers.add(fn)
  }

  // Walk the full IR tree to catch identifiers in ANY context —
  // nested component props, loop child components, conditional branches, etc.
  // This eliminates the "whack-a-mole" pattern where new JSX patterns break
  // because collectUsedIdentifiers didn't extract from a specific context.
  collectIdentifiersFromIRTree(_ir.root, usedIdentifiers)

  const neededProps = new Set<string>()
  const neededConstants: ConstantInfo[] = []
  const moduleLevelConstants: ConstantInfo[] = []
  const moduleLevelConstantNames = new Set<string>()

  for (const constant of ctx.localConstants) {
    if (constant.isJsx) continue  // Inlined at IR level (#547)
    if (constant.isJsxFunction) continue  // Inlined at call sites (#569)
    if (usedIdentifiers.has(constant.name)) {
      if (!constant.value) {
        neededConstants.push(constant)
        continue
      }

      // createContext() and new WeakMap() must be at module level to enable
      // cross-component sharing (unique Symbol / identity-based store)
      if (constant.systemConstructKind) {
        moduleLevelConstants.push(constant)
        moduleLevelConstantNames.add(constant.name)
        continue
      }

      neededConstants.push(constant)

      const refs = valueReferencesReactiveData(constant.value, ctx)
      for (const propName of refs.usedProps) {
        neededProps.add(propName)
      }
    }
  }

  // Ensure context variables used by providers are at module level
  for (const provider of ctx.providerSetups) {
    if (!moduleLevelConstantNames.has(provider.contextName)) {
      const contextConstant = ctx.localConstants.find(
        (c) => c.name === provider.contextName && c.systemConstructKind === 'createContext'
      )
      if (contextConstant) {
        moduleLevelConstants.push(contextConstant)
        moduleLevelConstantNames.add(contextConstant.name)
      }
    }
  }

  for (const id of usedIdentifiers) {
    if (ctx.propsParams.some((p) => p.name === id)) {
      neededProps.add(id)
    }
  }

  const propsWithPropertyAccess = detectPropsWithPropertyAccess(ctx, neededConstants)

  const propsUsedAsLoopArrays = new Set<string>()
  for (const loop of ctx.loopElements) {
    const arrayName = loop.array.trim()
    if (ctx.propsParams.some((p) => p.name === arrayName)) {
      propsUsedAsLoopArrays.add(arrayName)
    }
  }

  // --- Output: generate code in correct order ---

  emitPropsExtraction(lines, ctx, neededProps, propsWithPropertyAccess, propsUsedAsLoopArrays)

  // Build unified Declaration[] and sort by dependency order (#508)
  const controlledSignals: Array<{ signal: typeof ctx.signals[0]; propName: string }> = []
  for (const signal of ctx.signals) {
    const controlledPropName = getControlledPropName(signal, ctx.propsParams, ctx.propsObjectName)
    if (controlledPropName) {
      controlledSignals.push({ signal, propName: controlledPropName })
    }
  }

  const declarations: Declaration[] = []

  // Collect constants
  for (const constant of neededConstants) {
    declarations.push({
      kind: 'constant',
      info: constant,
      sourceIndex: constant.loc.start.line,
    })
  }

  // Build component-scope name set to check if module-level functions
  // reference component internals (signals, memos, constants, props).
  // Functions that reference component-scope names must stay inside init.
  const componentScopeNames = new Set<string>()
  for (const s of ctx.signals) {
    componentScopeNames.add(s.getter)
    if (s.setter) componentScopeNames.add(s.setter)
  }
  for (const m of ctx.memos) componentScopeNames.add(m.name)
  for (const c of ctx.localConstants) componentScopeNames.add(c.name)
  for (const p of ctx.propsParams) componentScopeNames.add(p.name)
  if (ctx.propsObjectName) componentScopeNames.add(ctx.propsObjectName)

  // Collect functions (module-level functions that don't reference component
  // internals are emitted outside init for SSR template accessibility)
  const moduleLevelFunctions: FunctionInfo[] = []
  for (const fn of ctx.localFunctions) {
    if (fn.isJsxFunction) continue  // Inlined at call sites (#569)
    if (!usedIdentifiers.has(fn.name)) continue
    if (fn.isModule && !bodyReferencesComponentScope(fn.body, componentScopeNames)) {
      moduleLevelFunctions.push(fn)
      continue
    }
    declarations.push({
      kind: 'function',
      info: fn,
      sourceIndex: fn.loc.start.line,
    })
  }

  // Collect signals
  for (const signal of ctx.signals) {
    const controlled = controlledSignals.find(c => c.signal === signal)
    declarations.push({
      kind: 'signal',
      info: signal,
      controlledPropName: controlled?.propName ?? null,
      sourceIndex: signal.loc.start.line,
    })
  }

  // Collect memos
  for (const memo of ctx.memos) {
    declarations.push({
      kind: 'memo',
      info: memo,
      sourceIndex: memo.loc.start.line,
    })
  }

  // Build the set of all names defined by declarations for dependency filtering
  const declNameSet = new Set<string>()
  for (const decl of declarations) {
    for (const name of providedNames(decl)) {
      declNameSet.add(name)
    }
  }

  const sorted = sortDeclarations(declarations, declNameSet)

  // Emit sorted declarations
  let emittedAny = false
  for (const decl of sorted) {
    emitDeclaration(lines, decl, ctx, controlledSignals)
    if (decl.kind === 'signal' && decl.controlledPropName) {
      emitControlledSignalEffect(lines, decl.info, decl.controlledPropName, ctx)
    }
    emittedAny = true
  }
  if (emittedAny) {
    lines.push('')
  }

  // Emit props-based event handlers (not local definitions)
  emitPropsEventHandlers(lines, ctx, usedFunctions, neededProps)

  const elementRefs = generateElementRefs(ctx)
  if (elementRefs) {
    lines.push(elementRefs)
    lines.push('')
  }

  emitDynamicTextUpdates(lines, ctx)
  emitClientOnlyExpressions(lines, ctx)
  emitReactiveAttributeUpdates(lines, ctx)
  emitConditionalUpdates(lines, ctx)
  emitClientOnlyConditionals(lines, ctx)

  const conditionalSlotIds = collectConditionalSlotIds(ctx)

  emitRestAttrApplications(lines, ctx)
  emitEventHandlers(lines, ctx, conditionalSlotIds)
  emitReactivePropBindings(lines, ctx)
  emitReactiveChildProps(lines, ctx)
  emitRefCallbacks(lines, ctx, conditionalSlotIds)
  emitEffectsAndOnMounts(lines, ctx)
  emitProviderAndChildInits(lines, ctx)
  // Loop updates must run AFTER provider/child inits so that parent
  // components have already provided their context (e.g., SelectContext)
  // before loop children (e.g., SelectItem) call useContext().
  emitLoopUpdates(lines, ctx)
  emitStaticArrayChildInits(lines, ctx)
  const hydrateLine = emitRegistrationAndHydration(lines, ctx, _ir)

  let generatedCode = lines.join('\n')

  // Rename source-level props object name to the generated parameter name.
  // User code may use `props.xxx` or a custom name like `p.xxx`;
  // the init function parameter is always PROPS_PARAM.
  // Both property access (props.xxx) and bare references (fn(props)) are renamed.
  // The hydrate line is structurally excluded — it was not in `lines` during join,
  // so template expressions (already using PROPS_PARAM) are never double-replaced.
  const srcPropsName = ctx.propsObjectName ?? 'props'
  if (srcPropsName !== PROPS_PARAM) {
    generatedCode = generatedCode.split('\n')
      .map(line => {
        // Skip comment lines
        if (line.trimStart().startsWith('//')) return line
        return line.replace(new RegExp(`\\b${srcPropsName}\\b`, 'g'), PROPS_PARAM)
      })
      .join('\n')
  }

  // Append hydrate line after props renaming (template expressions are already correct)
  generatedCode += '\n' + hydrateLine

  const usedImports = detectUsedImports(generatedCode)

  for (const userImport of collectUserDomImports(_ir)) {
    usedImports.add(userImport)
  }

  const sortedImports = [...usedImports].sort()
  const importLine = `import { ${sortedImports.join(', ')} } from '@barefootjs/dom'`

  // Collect external (non-DOM) imports used in the generated code
  const externalImportLines = collectExternalImports(_ir, generatedCode, localImportPrefixes)
  const allImportLines = [importLine, ...externalImportLines].join('\n')

  // Module-level constants use `var` with nullish coalescing for safe
  // re-declaration when multiple components in the same file share context
  const moduleCodeLines: string[] = []
  for (const constant of moduleLevelConstants) {
    if (!constant.value) continue
    moduleCodeLines.push(`var ${constant.name} = ${constant.name} ?? ${constant.value}`)
  }

  // Module-level functions: emitted at module scope so they are available
  // in both the init function and the SSR template.
  // Uses `var` + nullish coalescing for safe re-declaration when multiple
  // components in the same bundle share the same helper function.
  // Note: export is intentionally omitted — client JS files are self-contained
  // entry points, not imported by other modules. Add export when a concrete
  // cross-module use case arises.
  for (const fn of moduleLevelFunctions) {
    const paramStr = fn.params.map(p => p.name).join(', ')
    moduleCodeLines.push(`var ${fn.name} = ${fn.name} ?? function(${paramStr}) ${fn.body}`)
  }

  const moduleConstantsCode = moduleCodeLines.length > 0
    ? moduleCodeLines.join('\n') + '\n'
    : ''

  return generatedCode
    .replace(IMPORT_PLACEHOLDER, allImportLines)
    .replace(MODULE_CONSTANTS_PLACEHOLDER, moduleConstantsCode)
}

/**
 * Generate `const _slotId = find(...)` declarations for all elements
 * that need direct DOM references (events, dynamic text, loops, etc.).
 */
export function generateElementRefs(ctx: ClientJsContext): string {
  const regularSlots = new Set<string>()
  const textSlots = new Set<string>()
  const componentSlots = new Set<string>()
  const conditionalSlotIds = collectConditionalSlotIds(ctx)

  for (const elem of ctx.interactiveElements) {
    if (elem.slotId !== '__scope' && !conditionalSlotIds.has(elem.slotId)) {
      regularSlots.add(elem.slotId)
    }
  }
  // Dynamic text expressions use comment markers found via $t()
  for (const elem of ctx.dynamicElements) {
    if (!elem.insideConditional) {
      textSlots.add(elem.slotId)
    }
  }
  for (const elem of ctx.conditionalElements) {
    regularSlots.add(elem.slotId)
  }
  for (const elem of ctx.loopElements) {
    regularSlots.add(elem.slotId)
  }
  for (const elem of ctx.refElements) {
    if (!conditionalSlotIds.has(elem.slotId)) {
      regularSlots.add(elem.slotId)
    }
  }
  for (const attr of ctx.reactiveAttrs) {
    regularSlots.add(attr.slotId)
  }
  for (const prop of ctx.reactiveProps) {
    componentSlots.add(prop.slotId)
  }
  for (const child of ctx.childInits) {
    if (child.slotId) {
      componentSlots.add(child.slotId)
    }
  }
  for (const rest of ctx.restAttrElements) {
    regularSlots.add(rest.slotId)
  }

  // Component slots take precedence over regular slots (#360).
  // When a component contains a loop that inherits the component's slot ID
  // (via propagateSlotIdToLoops), both need the same DOM element reference.
  // Component elements use bf-s attributes, so $c() is the correct selector.
  for (const slotId of componentSlots) {
    regularSlots.delete(slotId)
  }

  if (regularSlots.size === 0 && textSlots.size === 0 && componentSlots.size === 0) return ''

  const refLines: string[] = []

  // Emit element ref declarations, batching 2+ slots into destructured calls
  emitSlotRefs(refLines, [...regularSlots], '$')
  emitSlotRefs(refLines, [...textSlots], '$t')
  emitSlotRefs(refLines, [...componentSlots], '$c')

  return refLines.join('\n')
}

/**
 * Emit element ref declarations for a set of slot IDs using the given finder function.
 * Always emits destructured form: `const [_sN, ...] = fn(__scope, 'sN', ...)`
 */
function emitSlotRefs(lines: string[], slotIds: string[], fn: string): void {
  if (slotIds.length === 0) return
  const vars = slotIds.map(id => `_${varSlotId(id)}`).join(', ')
  const args = slotIds.map(id => `'${id}'`).join(', ')
  lines.push(`  const [${vars}] = ${fn}(__scope, ${args})`)
}

/**
 * Recursively collect component names from IR children.
 * Used to ensure all nested components are imported, and to detect
 * which components are used as children (for conditional CSR fallback).
 */
export function collectComponentNamesFromIR(nodes: IRNode[], names: Set<string>): void {
  for (const node of nodes) {
    if (node.type === 'component') {
      names.add(node.name)
      collectComponentNamesFromIR(node.children, names)
      // Traverse JSX prop children for nested component references
      for (const prop of node.props) {
        if (prop.jsxChildren) {
          collectComponentNamesFromIR(prop.jsxChildren, names)
        }
      }
    } else if (node.type === 'element' || node.type === 'fragment' || node.type === 'provider') {
      collectComponentNamesFromIR(node.children, names)
    } else if (node.type === 'conditional') {
      collectComponentNamesFromIR([node.whenTrue], names)
      collectComponentNamesFromIR([node.whenFalse], names)
    } else if (node.type === 'loop') {
      collectComponentNamesFromIR(node.children, names)
      if (node.childComponent) {
        names.add(node.childComponent.name)
        collectComponentNamesFromIR(node.childComponent.children, names)
      }
      if (node.nestedComponents) {
        for (const nested of node.nestedComponents) {
          names.add(nested.name)
          collectComponentNamesFromIR(nested.children, names)
        }
      }
    }
  }
}

/**
 * Collect child component names from conditional branch loops and nested conditionals.
 * Ensures @bf-child import markers are generated for components inside
 * composite loops within conditional branches (e.g., Badge inside a branch loop).
 */
function collectChildNamesFromBranches(
  cond: { whenTrueLoops: ConditionalBranchLoop[]; whenFalseLoops: ConditionalBranchLoop[]; whenTrueConditionals?: ConditionalBranchConditional[]; whenFalseConditionals?: ConditionalBranchConditional[] },
  names: Set<string>,
): void {
  for (const loop of [...cond.whenTrueLoops, ...cond.whenFalseLoops]) {
    if (loop.nestedComponents) {
      for (const comp of loop.nestedComponents) names.add(comp.name)
    }
  }
  for (const nested of [...(cond.whenTrueConditionals ?? []), ...(cond.whenFalseConditionals ?? [])]) {
    collectChildNamesFromBranches(nested, names)
  }
}

