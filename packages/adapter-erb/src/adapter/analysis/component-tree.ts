/**
 * Component-tree analysis for the ERB template adapter.
 *
 * Ported from the Mojolicious adapter's `analysis/component-tree.ts` (issue
 * #2018 track D lineage). Pure functions over the IR — they read no adapter
 * instance state. `collectImportedLoopChildComponentErrors` returns its
 * diagnostics instead of pushing onto the adapter's error list, so the
 * adapter stays the sole owner of `errors`.
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
} from '@barefootjs/jsx'

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
 * whose name is imported from a relative-path module. Mirror of the Go /
 * Mojo adapters' check — the ERB adapter has the same cross-template-
 * registration constraint at request time. Returns the diagnostics so the
 * caller pushes them onto its own error list.
 */
export function collectImportedLoopChildComponentErrors(
  ir: ComponentIR,
  componentName: string,
): CompilerError[] {
  const errors: CompilerError[] = []
  // Collect every name imported from a relative-path module (no
  // case filter — `IRComponent` nodes only exist for PascalCase JSX
  // usages, so a lowercase utility import in the set can't match
  // anyway, and any heuristic on the import name itself would be
  // strictly less robust than the structural IR check below).
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
    switch (node.type) {
      case 'component': {
        const comp = node as IRComponent
        if (inLoop && relativeImports.has(comp.name)) {
          errors.push({
            code: 'BF103',
            severity: 'error',
            message: `Component <${comp.name}> is imported from a sibling module and used inside a loop. The ERB adapter emits a cross-template call; the child template must be registered alongside the parent at render time.`,
            loc: comp.loc ?? loc,
            suggestion: {
              message:
                `Options:\n` +
                `  1. Compile '${comp.name}' (its source file) with the same adapter and register the resulting ERB template alongside the parent at render time.\n` +
                `  2. Inline <${comp.name}> directly inside the loop body so no cross-file template lookup is needed.\n` +
                `  3. Mark the loop position as @client-only so the template is materialised on the client instead of at SSR time.`,
            },
          })
        }
        for (const child of comp.children) visit(child, inLoop)
        break
      }
      case 'element':
        for (const child of (node as IRElement).children) visit(child, inLoop)
        break
      case 'fragment':
        for (const child of (node as IRFragment).children) visit(child, inLoop)
        break
      case 'conditional': {
        const cond = node as IRConditional
        visit(cond.whenTrue, inLoop)
        if (cond.whenFalse) visit(cond.whenFalse, inLoop)
        break
      }
      case 'loop':
        for (const child of (node as IRLoop).children) visit(child, true)
        break
      case 'if-statement': {
        const stmt = node as IRIfStatement
        visit(stmt.consequent, inLoop)
        if (stmt.alternate) visit(stmt.alternate, inLoop)
        break
      }
      case 'provider':
        for (const child of (node as IRProvider).children) visit(child, inLoop)
        break
      case 'async': {
        const a = node as IRAsync
        visit(a.fallback, inLoop)
        for (const child of a.children) visit(child, inLoop)
        break
      }
    }
  }
  visit(ir.root, false)
  return errors
}
