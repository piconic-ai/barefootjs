/**
 * Component-tree analysis shared by the DSL template adapters (#3475).
 *
 * Pure functions over the IR; they read no adapter instance state.
 * `collectImportedLoopChildComponentErrors` returns its diagnostics instead
 * of pushing onto an adapter's error list, so the adapter stays the sole
 * owner of `errors`.
 */

import type {
  ComponentIR,
  IRNode,
  IRComponent,
  IRElement,
  IRFragment,
  IRConditional,
  IRLoop,
  IRIfStatement,
  IRProvider,
  IRAsync,
  CompilerError,
} from '../types.ts'

/**
 * Whether the component needs the client runtime — it owns reactive state
 * (signals / effects / onMount) or the analyzer flagged it as needing init.
 */
export function hasClientInteractivity(ir: ComponentIR): boolean {
  return (
    ir.metadata.signals.length > 0 ||
    ir.metadata.effects.length > 0 ||
    ir.metadata.onMounts.length > 0 ||
    (ir.metadata.clientAnalysis?.needsInit ?? false)
  )
}

/**
 * Build a `BF103` diagnostic for every component reference inside a loop body
 * whose name is imported from a relative-path module. A DSL template backend
 * renders such a child as a cross-template call, so the child's compiled
 * template must be registered with the backend's loader alongside the
 * parent at render time. `adapterName` is the display name the message
 * uses ("The Jinja adapter emits …", "the resulting Jinja template").
 * Returns the diagnostics so the caller pushes them onto its own error list.
 */
export function collectImportedLoopChildComponentErrors(
  ir: ComponentIR,
  componentName: string,
  adapterName: string,
): CompilerError[] {
  const errors: CompilerError[] = []
  const relativeImports = new Set<string>()
  for (const imp of ir.metadata.templateImports ?? ir.metadata.imports ?? []) {
    if (!imp.source.startsWith('./') && !imp.source.startsWith('../')) continue
    if (imp.isTypeOnly) continue
    for (const spec of imp.specifiers) {
      relativeImports.add(spec.alias ?? spec.name)
    }
  }
  if (relativeImports.size === 0) return errors

  const loc = { file: componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
  const visit = (node: IRNode, inLoop: boolean): void => {
    if (node.type === 'component' && inLoop && relativeImports.has(node.name)) {
      errors.push(importedLoopChildError(node, loc, adapterName))
    }
    const childInLoop = inLoop || node.type === 'loop'
    for (const child of childNodes(node)) visit(child, childInLoop)
  }
  visit(ir.root, false)
  return errors
}

function importedLoopChildError(
  comp: IRComponent,
  loc: CompilerError['loc'],
  adapterName: string,
): CompilerError {
  return {
    code: 'BF103',
    severity: 'error',
    message: `Component <${comp.name}> is imported from a sibling module and used inside a loop. The ${adapterName} adapter emits a cross-template call; the child template must be registered alongside the parent at render time.`,
    loc: comp.loc ?? loc,
    suggestion: {
      message:
        `Options:\n` +
        `  1. Compile '${comp.name}' (its source file) with the same adapter and register the resulting ${adapterName} template alongside the parent at render time.\n` +
        `  2. Inline <${comp.name}> directly inside the loop body so no cross-file template lookup is needed.\n` +
        `  3. Mark the loop position as @client-only so the template is materialised on the client instead of at SSR time.`,
    },
  }
}

/** The child nodes the BF103 walk descends into, in render order. */
function childNodes(node: IRNode): IRNode[] {
  switch (node.type) {
    case 'component':
    case 'element':
    case 'fragment':
    case 'loop':
    case 'provider':
      return (node as IRComponent | IRElement | IRFragment | IRLoop | IRProvider).children
    case 'conditional': {
      const cond = node as IRConditional
      return cond.whenFalse ? [cond.whenTrue, cond.whenFalse] : [cond.whenTrue]
    }
    case 'if-statement': {
      const stmt = node as IRIfStatement
      return stmt.alternate ? [stmt.consequent, stmt.alternate] : [stmt.consequent]
    }
    case 'async': {
      const a = node as IRAsync
      return [a.fallback, ...a.children]
    }
    default:
      return []
  }
}
