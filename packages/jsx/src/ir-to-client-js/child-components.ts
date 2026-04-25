/**
 * Child component imports + IR-tree name collection.
 *
 * Each component referenced from the current component's IR tree
 * (directly, via a loop, or inside a conditional branch) needs a
 * `@bf-child:<Name>` import marker so the bundler can wire up the
 * cross-file reference. Siblings in the same compilation unit are
 * skipped — they are declared in the same file and already resolve.
 */

import type { IRNode } from '../types'
import type { ClientJsContext, ConditionalElement } from './types'

/** Emit child-component import marker lines for every component name
 *  reachable from the current component's IR (minus siblings). */
export function emitChildComponentImports(
  lines: string[],
  ctx: ClientJsContext,
  siblingSet: ReadonlySet<string>,
): void {
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
  for (const cond of [...ctx.conditionalElements, ...ctx.clientOnlyConditionals]) {
    collectChildNamesFromBranches(cond, childComponentNames)
  }
  for (const childName of childComponentNames) {
    if (!siblingSet.has(childName)) {
      lines.push(`import '/* @bf-child:${childName} */'`)
    }
  }
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
  cond: Pick<ConditionalElement, 'whenTrue' | 'whenFalse'>,
  names: Set<string>,
): void {
  for (const loop of [...cond.whenTrue.loops, ...cond.whenFalse.loops]) {
    if (loop.nestedComponents) {
      for (const comp of loop.nestedComponents) names.add(comp.name)
    }
  }
  for (const nested of [...cond.whenTrue.conditionals, ...cond.whenFalse.conditionals]) {
    collectChildNamesFromBranches(nested, names)
  }
}
